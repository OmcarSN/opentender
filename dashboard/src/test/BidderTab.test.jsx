import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ethers } from 'ethers';
import BidderTab from '../components/BidderTab';
import {
  mockTenders,
  mockMilestones,
  createMockContract,
  BIDDER1_ACCOUNT,
  NOW,
} from './mockData';

describe('BidderTab Component Tests', () => {
  const defaultProps = {
    account: BIDDER1_ACCOUNT,
    signerContract: createMockContract(),
    tenders: mockTenders,
    selectedTenderId: 1,
    onSelectTender: vi.fn(),
    claimableBalance: 0n,
    onRefresh: vi.fn(),
    setNotification: vi.fn(),
    isDataLoading: false,
    dataLoadError: null,
    chainId: 91562037,
    roles: { isBidder: true },
    latestBlockTimestamp: NOW,
  };

  it('renders tender selector and selects tender taking bids', async () => {
    const onSelectTender = vi.fn();
    render(<BidderTab {...defaultProps} onSelectTender={onSelectTender} />);

    expect(screen.getByText('Select Tender Taking Bids')).toBeInTheDocument();
    const selector = document.querySelector('.bid-tender-selector-panel select');
    expect(selector).toBeInTheDocument();

    expect(screen.getByText('Maximum price')).toBeInTheDocument();
    expect(screen.getByText('Deposit')).toBeInTheDocument();
  });

  it('generates random secret salt when clicking generate button', async () => {
    render(<BidderTab {...defaultProps} />);

    const saltInput = screen.getByPlaceholderText(/Auto-generated on submission/i);
    expect(saltInput.value).toBe('');

    const generateBtn = screen.getByRole('button', { name: /Generate New Secret Code/i });
    await userEvent.click(generateBtn);

    expect(saltInput.value).toMatch(/^0x[0-9a-fA-F]{64}$/);
  });

  it('validates bid amount against ceiling price', async () => {
    render(<BidderTab {...defaultProps} />);

    const priceInput = screen.getByPlaceholderText(/e\.g\. 0\.0425/i);

    // Enter amount higher than ceiling (0.06 > 0.05)
    await userEvent.type(priceInput, '0.06');

    const submitBtn = screen.getByRole('button', { name: /Place sealed bid/i });
    expect(submitBtn).toBeDisabled();
    expect(screen.getByText(/Price exceeds maximum of 0\.05 tMSTC/i)).toBeInTheDocument();

    // Clear and enter valid amount within ceiling (0.04)
    await userEvent.clear(priceInput);
    await userEvent.type(priceInput, '0.04');
    expect(submitBtn).not.toBeDisabled();
  });

  it('handles commit submission and backup file creation', async () => {
    const mockContract = createMockContract();
    const setNotification = vi.fn();

    render(
      <BidderTab
        {...defaultProps}
        signerContract={mockContract}
        setNotification={setNotification}
      />
    );

    const priceInput = screen.getByPlaceholderText(/e\.g\. 0\.0425/i);
    await userEvent.type(priceInput, '0.04');

    const submitBtn = screen.getByRole('button', { name: /Place sealed bid/i });
    await userEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockContract.commitBid).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(screen.getByText(/Saved backup file/i)).toBeInTheDocument();
    });
  });

  it('handles backup file import in opening phase', async () => {
    render(<BidderTab {...defaultProps} />);

    const validBackup = JSON.stringify({
      tenderId: 2,
      wallet: BIDDER1_ACCOUNT,
      amount: '0.035',
      salt: '0x' + 'ab'.repeat(32),
      chainId: 91562037,
    });

    const file = new File([validBackup], 'opentender-bid-2.json', { type: 'application/json' });
    const fileInput = document.getElementById('backup-file-input');

    await userEvent.upload(fileInput, file);

    await waitFor(() => {
      expect(screen.getByText(/Backup file loaded successfully/i)).toBeInTheDocument();
    });
  });

  it('rejects invalid or corrupted backup files', async () => {
    render(<BidderTab {...defaultProps} />);

    const corruptedFile = new File(['invalid JSON content'], 'corrupted.json', { type: 'application/json' });
    const fileInput = document.getElementById('backup-file-input');

    await userEvent.upload(fileInput, corruptedFile);

    await waitFor(() => {
      expect(screen.getByText(/Failed to read file/i)).toBeInTheDocument();
    });
  });

  it('validates and submits reveal bid', async () => {
    const mockContract = createMockContract();
    render(
      <BidderTab
        {...defaultProps}
        signerContract={mockContract}
      />
    );

    const revealPriceInput = screen.getByPlaceholderText('Filled from backup file');
    await userEvent.type(revealPriceInput, '0.035');

    const revealSaltInput = screen.getByPlaceholderText('0x... (filled from backup file)');
    await userEvent.type(revealSaltInput, '0x' + '11'.repeat(32));

    const revealBtn = screen.getByRole('button', { name: /Open my bid/i });

    // Wait for commitments to load so button becomes enabled
    await waitFor(() => {
      expect(revealBtn).not.toBeDisabled();
    });

    await userEvent.click(revealBtn);

    await waitFor(() => {
      expect(mockContract.revealBid).toHaveBeenCalled();
    });
  });

  it('prevents duplicate milestone proof submission when milestone is awaiting approval', async () => {
    // Tender 4 has completedMilestones: 1, milestone #1 is Submitted (status 1)
    const tendersWithMilestoneSubmitted = mockTenders.map((t) =>
      t.id === 4 ? { ...t, completedMilestones: 1 } : t
    );

    render(
      <BidderTab
        {...defaultProps}
        tenders={tendersWithMilestoneSubmitted}
      />
    );

    await waitFor(() => {
      const alerts = screen.getAllByText(/Milestone proof is already submitted and awaiting verifier approval/i);
      expect(alerts.length).toBeGreaterThan(0);
    });

    const submitProofBtn = screen.getByRole('button', { name: /Submit proof/i });
    expect(submitProofBtn).toBeDisabled();
  });

  it('displays claimable balance and handles pull withdrawal', async () => {
    const mockContract = createMockContract();
    render(
      <BidderTab
        {...defaultProps}
        signerContract={mockContract}
        claimableBalance={ethers.parseEther("0.05")}
      />
    );

    expect(screen.getByText(/0.0500 tMSTC/i)).toBeInTheDocument();

    const withdrawBtn = screen.getByRole('button', { name: /Withdraw/i });
    expect(withdrawBtn).not.toBeDisabled();

    await userEvent.click(withdrawBtn);

    await waitFor(() => {
      expect(mockContract.withdrawPullBalance).toHaveBeenCalled();
    });
  });

  it('disables withdrawal when claimable balance is zero', () => {
    render(<BidderTab {...defaultProps} claimableBalance={0n} />);

    const withdrawBtn = screen.getByRole('button', { name: /Withdraw/i });
    expect(withdrawBtn).toBeDisabled();
  });

  it('displays refundable deposits and handles claim deposit refund', async () => {
    const mockContract = createMockContract();
    render(
      <BidderTab
        {...defaultProps}
        signerContract={mockContract}
      />
    );

    await waitFor(() => {
      const refundBtns = screen.getAllByRole('button', { name: /Get my deposit back/i });
      expect(refundBtns.length).toBeGreaterThan(0);
    });

    const refundBtn = screen.getAllByRole('button', { name: /Get my deposit back/i })[0];
    fireEvent.click(refundBtn);

    await waitFor(() => {
      expect(mockContract.claimBondRefund).toHaveBeenCalled();
    });
  });
});
