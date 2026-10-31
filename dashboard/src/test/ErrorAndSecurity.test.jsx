import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Header from '../components/Header';
import BidderTab from '../components/BidderTab';
import OfficerTab from '../components/OfficerTab';
import PublicAuditTab from '../components/PublicAuditTab';
import {
  mockTenders,
  createMockContract,
  REGISTRAR_ACCOUNT,
  DEPARTMENT_ACCOUNT,
  VERIFIER1_ACCOUNT,
  BIDDER1_ACCOUNT,
  VISITOR_ACCOUNT,
  NOW,
} from './mockData';

describe('Error and Security Test Suite', () => {
  const commonProps = {
    tenders: mockTenders,
    selectedTenderId: 1,
    latestBlockTimestamp: NOW,
    chainId: 91562037,
  };

  it('handles disconnected wallet state across components', () => {
    // 1. Header with no account
    const onConnect = vi.fn();
    render(
      <Header
        account={null}
        chainId={null}
        roles={{}}
        balance="0"
        activeTab="audit"
        onTabChange={vi.fn()}
        onConnect={onConnect}
        onDisconnect={vi.fn()}
        onSwitchNetwork={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: /Connect wallet/i })).toBeInTheDocument();

    // 2. Bidder tab with no account
    render(
      <BidderTab
        {...commonProps}
        account={null}
        signerContract={null}
        claimableBalance={0n}
        setNotification={vi.fn()}
      />
    );
    expect(screen.getByText(/Wallet Disconnected/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Place sealed bid/i })).toBeDisabled();
  });

  it('detects wrong network and renders network switch banner and disabled actions', async () => {
    const onSwitchNetwork = vi.fn();
    render(
      <Header
        account={BIDDER1_ACCOUNT}
        chainId={1} // Ethereum Mainnet (wrong network, OpenTender requires 91562037)
        roles={{ isBidder: true }}
        balance="1.0"
        activeTab="bidder"
        onTabChange={vi.fn()}
        onConnect={vi.fn()}
        onDisconnect={vi.fn()}
        onSwitchNetwork={onSwitchNetwork}
      />
    );

    expect(screen.getByText(/Your wallet is on the wrong network/i)).toBeInTheDocument();
    const switchBtn = screen.getByRole('button', { name: /Switch network/i });
    await userEvent.click(switchBtn);
    expect(onSwitchNetwork).toHaveBeenCalledTimes(1);

    // BidderTab with wrong network
    render(
      <BidderTab
        {...commonProps}
        account={BIDDER1_ACCOUNT}
        signerContract={createMockContract()}
        chainId={1} // Wrong chain
        setNotification={vi.fn()}
      />
    );
    expect(screen.getAllByText(/Wrong Network/i).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /Place sealed bid/i })).toBeDisabled();
  });

  it('blocks unauthorized account roles in Bidder and Officer tabs', async () => {
    // Unregistered bidder
    render(
      <BidderTab
        {...commonProps}
        account={VISITOR_ACCOUNT}
        signerContract={createMockContract()}
        roles={{ isBidder: false }}
        setNotification={vi.fn()}
      />
    );
    await waitFor(() => {
      expect(screen.getByText(/Your wallet is not registered as a bidder/i)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /Place sealed bid/i })).toBeDisabled();

    // Non-verifier visiting Officer tab
    render(
      <OfficerTab
        {...commonProps}
        account={VISITOR_ACCOUNT}
        signerContract={createMockContract()}
        roles={{ isDepartment: false, isVerifier: false, isRegistrar: false }}
        setNotification={vi.fn()}
      />
    );
    expect(screen.getByText(/Connect a verifier wallet to approve work/i)).toBeInTheDocument();
    expect(screen.getByText(/Connect an admin wallet to manage participants/i)).toBeInTheDocument();
  });

  it('validates participant addresses and displays error on malformed addresses', async () => {
    render(
      <OfficerTab
        {...commonProps}
        account={REGISTRAR_ACCOUNT}
        roles={{ isRegistrar: true }}
        signerContract={createMockContract()}
        setNotification={vi.fn()}
      />
    );

    const addressInput = screen.getByPlaceholderText(/Wallet Address \(0x\.\.\.\)/i);
    await userEvent.type(addressInput, 'invalid-address-format-0x123');

    expect(screen.getByText(/Must be a valid 42-character 0x address\./i)).toBeInTheDocument();
    const addBtn = screen.getByRole('button', { name: /Add participant/i });
    expect(addBtn).toBeDisabled();
  });

  it('enforces required fields and prevents empty submissions', async () => {
    render(
      <BidderTab
        {...commonProps}
        account={BIDDER1_ACCOUNT}
        signerContract={createMockContract()}
        roles={{ isBidder: true }}
        setNotification={vi.fn()}
      />
    );

    const submitBtn = screen.getByRole('button', { name: /Place sealed bid/i });
    expect(submitBtn).toBeDisabled();
    expect(screen.getByText(/Enter your price/i)).toBeInTheDocument();
  });

  it('rejects negative or zero bid amounts', async () => {
    render(
      <BidderTab
        {...commonProps}
        account={BIDDER1_ACCOUNT}
        signerContract={createMockContract()}
        roles={{ isBidder: true }}
        setNotification={vi.fn()}
      />
    );

    const priceInput = screen.getByPlaceholderText(/e\.g\. 0\.0425/i);
    await userEvent.type(priceInput, '-0.01');

    const submitBtn = screen.getByRole('button', { name: /Place sealed bid/i });
    expect(submitBtn).toBeDisabled();
  });

  it('handles user rejected wallet transactions gracefully', async () => {
    const mockContract = createMockContract();
    const userRejectedError = new Error('user rejected action');
    userRejectedError.code = 'ACTION_REJECTED';
    mockContract.commitBid = vi.fn().mockRejectedValue(userRejectedError);

    const setNotification = vi.fn();
    render(
      <BidderTab
        {...commonProps}
        account={BIDDER1_ACCOUNT}
        signerContract={mockContract}
        roles={{ isBidder: true }}
        setNotification={setNotification}
      />
    );

    const priceInput = screen.getByPlaceholderText(/e\.g\. 0\.0425/i);
    await userEvent.type(priceInput, '0.04');

    const submitBtn = screen.getByRole('button', { name: /Place sealed bid/i });
    await userEvent.click(submitBtn);

    await waitFor(() => {
      expect(setNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Failed to place sealed bid',
          error: expect.stringMatching(/cancelled in your wallet/i),
        })
      );
    });
  });

  it('handles contract revert responses cleanly', async () => {
    const mockContract = createMockContract();
    const revertError = new Error('execution reverted: custom error AlreadyCommitted()');
    revertError.data = '0x123';
    mockContract.commitBid = vi.fn().mockRejectedValue(revertError);

    const setNotification = vi.fn();
    render(
      <BidderTab
        {...commonProps}
        account={BIDDER1_ACCOUNT}
        signerContract={mockContract}
        roles={{ isBidder: true }}
        setNotification={setNotification}
      />
    );

    const priceInput = screen.getByPlaceholderText(/e\.g\. 0\.0425/i);
    await userEvent.type(priceInput, '0.04');

    const submitBtn = screen.getByRole('button', { name: /Place sealed bid/i });
    await userEvent.click(submitBtn);

    await waitFor(() => {
      expect(setNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Failed to place sealed bid',
          error: expect.stringMatching(/AlreadyCommitted|already submitted a sealed bid/i),
        })
      );
    });
  });

  it('displays loading states and prevents duplicate clicks during in-flight transactions', async () => {
    const mockContract = createMockContract();
    let resolveTx;
    const txPromise = new Promise((resolve) => {
      resolveTx = resolve;
    });

    mockContract.commitBid = vi.fn().mockReturnValue(txPromise);

    render(
      <BidderTab
        {...commonProps}
        account={BIDDER1_ACCOUNT}
        signerContract={mockContract}
        roles={{ isBidder: true }}
        setNotification={vi.fn()}
      />
    );

    const priceInput = screen.getByPlaceholderText(/e\.g\. 0\.0425/i);
    await userEvent.type(priceInput, '0.04');

    const submitBtn = screen.getByRole('button', { name: /Place sealed bid/i });
    await userEvent.click(submitBtn);

    // Button transitions to loading state and becomes disabled
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Placing sealed bid\.\.\./i })).toBeDisabled();
    });

    // Clean up in-flight promise
    resolveTx({
      hash: '0xtest',
      wait: vi.fn().mockResolvedValue({ status: 1 }),
    });
  });
});
