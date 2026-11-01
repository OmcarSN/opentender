import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Header from '../components/Header';
import BidderTab from '../components/BidderTab';
import OfficerTab from '../components/OfficerTab';
import PublicAuditTab from '../components/PublicAuditTab';
import WalletModal from '../components/WalletModal';
import { parseContractError } from '../utils/errors';
import { executeTransaction } from '../utils/txHandler';
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

  it('correctly labels roles including Visitor (no role), Blocked bidder, and registered Bidder', () => {
    // 1. Unregistered visitor
    const { rerender } = render(
      <Header
        account={VISITOR_ACCOUNT}
        chainId={91562037}
        roles={{ isBidder: false, isRegistrar: false, isDepartment: false, isVerifier: false, isDebarred: false }}
        balance="1.0"
        activeTab="audit"
        onTabChange={vi.fn()}
        onConnect={vi.fn()}
        onDisconnect={vi.fn()}
        onSwitchNetwork={vi.fn()}
      />
    );
    expect(screen.getByText('Visitor (no role)')).toBeInTheDocument();

    // 2. Debarred / Blocked bidder
    rerender(
      <Header
        account={BIDDER1_ACCOUNT}
        chainId={91562037}
        roles={{ isBidder: true, isRegistrar: false, isDepartment: false, isVerifier: false, isDebarred: true }}
        balance="1.0"
        activeTab="audit"
        onTabChange={vi.fn()}
        onConnect={vi.fn()}
        onDisconnect={vi.fn()}
        onSwitchNetwork={vi.fn()}
      />
    );
    expect(screen.getByText('Blocked bidder')).toBeInTheDocument();

    // 3. Registered active bidder
    rerender(
      <Header
        account={BIDDER1_ACCOUNT}
        chainId={91562037}
        roles={{ isBidder: true, isRegistrar: false, isDepartment: false, isVerifier: false, isDebarred: false }}
        balance="1.0"
        activeTab="audit"
        onTabChange={vi.fn()}
        onConnect={vi.fn()}
        onDisconnect={vi.fn()}
        onSwitchNetwork={vi.fn()}
      />
    );
    expect(screen.getByText('Bidder')).toBeInTheDocument();

    // 4. Loading state shows "Checking role..."
    rerender(
      <Header
        account={BIDDER1_ACCOUNT}
        chainId={91562037}
        roles={{ isLoading: true }}
        balance="1.0"
        activeTab="audit"
        onTabChange={vi.fn()}
        onConnect={vi.fn()}
        onDisconnect={vi.fn()}
        onSwitchNetwork={vi.fn()}
      />
    );
    expect(screen.getByText('Checking role...')).toBeInTheDocument();
  });

  it('differentiates connection vs transaction rejections in parseContractError', () => {
    const userCancel = new Error('User rejected the request.');
    userCancel.code = 4001;

    // Connection context
    const connMsg = parseContractError(userCancel, 'connection');
    expect(connMsg).toBe('Connection request was cancelled in your wallet.');

    // Transaction context
    const txMsg = parseContractError(userCancel, 'transaction');
    expect(txMsg).toBe('Transaction signature was cancelled in your wallet.');

    // Wallet locked
    const lockedErr = new Error('Unauthorized');
    lockedErr.code = 4100;
    expect(parseContractError(lockedErr)).toContain('locked');

    // Request already pending
    const pendingErr = new Error('Request already pending');
    pendingErr.code = -32002;
    expect(parseContractError(pendingErr)).toContain('already pending');
  });

  it('enforces transaction mutex and blocks duplicate concurrent transactions', async () => {
    const mockContract = createMockContract();
    let resolveTx;
    mockContract.commitBid = vi.fn().mockReturnValue(
      new Promise((res) => {
        resolveTx = res;
      })
    );

    const setNotif = vi.fn();
    // Start first transaction
    const tx1Promise = executeTransaction({
      signerContract: mockContract,
      method: 'commitBid',
      args: [1, '0xabc'],
      account: BIDDER1_ACCOUNT,
      chainId: 91562037,
      title: 'First Transaction',
      setNotification: setNotif,
    });

    // Attempt second transaction while first is pending
    const tx2Result = await executeTransaction({
      signerContract: mockContract,
      method: 'commitBid',
      args: [1, '0xdef'],
      account: BIDDER1_ACCOUNT,
      chainId: 91562037,
      title: 'Second Transaction',
      setNotification: setNotif,
    });

    expect(tx2Result.success).toBe(false);
    expect(tx2Result.error).toContain('Another transaction is currently awaiting confirmation');

    // Clean up first tx
    resolveTx({ hash: '0xhash', wait: vi.fn().mockResolvedValue({ status: 1, blockNumber: 100 }) });
    await tx1Promise;
  });

  it('validates chainId and blocks transactions when wallet is on wrong network', async () => {
    const mockContract = createMockContract();
    const setNotif = vi.fn();

    const result = await executeTransaction({
      signerContract: mockContract,
      method: 'commitBid',
      args: [1, '0xabc'],
      account: BIDDER1_ACCOUNT,
      chainId: 1, // Ethereum mainnet instead of MST Testnet (91562037)
      title: 'Wrong Network Tx',
      setNotification: setNotif,
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/wrong network/i);
  });

  it('rejects transaction when receipt status is 0 (reverted on-chain)', async () => {
    const mockContract = createMockContract();
    mockContract.commitBid = vi.fn().mockResolvedValue({
      hash: '0xreverted_tx',
      wait: vi.fn().mockResolvedValue({ status: 0, blockNumber: 101 }),
    });

    const setNotif = vi.fn();
    const result = await executeTransaction({
      signerContract: mockContract,
      method: 'commitBid',
      args: [1, '0xabc'],
      account: BIDDER1_ACCOUNT,
      chainId: 91562037,
      title: 'Reverted Tx',
      setNotification: setNotif,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('reverted on-chain');
  });

  it('does not silently fall back to MetaMask when BridgeKey is selected and not installed', async () => {
    // Simulate window where only MetaMask is installed, but NOT BridgeKey
    window.ethereum = { isMetaMask: true, isBridgeKey: false };
    delete window.bridgekey;
    delete window.bridgeKey;

    const onSelect = vi.fn();
    render(
      <WalletModal
        isOpen={true}
        onClose={vi.fn()}
        onSelectWallet={onSelect}
      />
    );

    const bridgeKeyBtn = screen.getByRole('button', { name: /BridgeKey/i });
    await userEvent.click(bridgeKeyBtn);

    // Verify onSelectWallet was called with null provider for BridgeKey, NOT window.ethereum
    expect(onSelect).toHaveBeenCalledWith(null, 'BridgeKey', 'bridgekey');
  });
});
