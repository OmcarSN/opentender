import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PublicAuditTab from '../components/PublicAuditTab';
import {
  mockTenders,
  mockMilestones,
  mockRevealedBids,
  mockCommittedBidders,
  mockPlatformStats,
  createMockContract,
  BIDDER1_ACCOUNT,
  NOW,
} from './mockData';

describe('PublicAuditTab Component Tests', () => {
  const defaultProps = {
    contract: createMockContract(),
    tenders: mockTenders,
    selectedTenderId: 1,
    onSelectTender: vi.fn(),
    tenderDetails: mockTenders[0],
    milestones: mockMilestones,
    revealedBids: mockRevealedBids,
    committedBidders: mockCommittedBidders,
    platformStats: mockPlatformStats,
    events: [
      {
        name: 'BidCommitted',
        tenderId: 1,
        description: 'Sealed bid committed on tender #1',
        time: '1 hour ago',
        txHash: '0xtx1',
      },
    ],
    latestBlockTimestamp: NOW,
    isDataLoading: false,
    dataLoadError: null,
    onRetry: vi.fn(),
  };

  it('renders platform stats and populated tender cards', () => {
    render(<PublicAuditTab {...defaultProps} />);

    // Platform statistics
    expect(screen.getByText('Registered bidders')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument(); // 12 registered bidders

    // Tenders cards rendered
    expect(screen.getAllByText(/Tender #1/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Tender #2/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Tender #3/).length).toBeGreaterThan(0);
  });

  it('handles tender card selection', async () => {
    const onSelectTender = vi.fn();
    render(<PublicAuditTab {...defaultProps} onSelectTender={onSelectTender} />);

    const cards = document.querySelectorAll('.tender-cards-list .tender-summary-card');
    expect(cards.length).toBeGreaterThan(1);

    await userEvent.click(cards[1]);
    expect(onSelectTender).toHaveBeenCalledWith(expect.any(Number));
  });

  it.skip('filters tender cards using search input', async () => {
    render(<PublicAuditTab {...defaultProps} />);

    const searchInput = screen.getByRole('textbox', { name: /Search tenders/i });
    expect(screen.getAllByText(/Tender #1/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Tender #2/).length).toBeGreaterThan(0);

    await userEvent.type(searchInput, 'Technology');
    // Only tender #2 is Technology
    const tenderCards = document.querySelectorAll('.tender-cards-list .tender-summary-card');
    expect(tenderCards.length).toBe(1);
    expect(tenderCards[0].textContent).toContain('Tender #2');
  });

  it.skip('filters tender cards by category dropdown', async () => {
    render(<PublicAuditTab {...defaultProps} />);

    const categorySelect = screen.getByRole('combobox', { name: /Category filter/i });
    await userEvent.selectOptions(categorySelect, 'infrastructure');

    // Tenders #1 and #5 are Infrastructure
    const tenderCards = document.querySelectorAll('.tender-cards-list .tender-summary-card');
    expect(tenderCards.length).toBe(2);
    expect(screen.getAllByText(/Tender #1/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Tender #5/).length).toBeGreaterThan(0);
  });

  it.skip('filters tender cards by procurement method', async () => {
    render(<PublicAuditTab {...defaultProps} />);

    const procurementSelect = screen.getByRole('combobox', { name: /Procurement filter/i });
    await userEvent.selectOptions(procurementSelect, 'direct');

    // Only tender #3 has direct procurement
    const tenderCards = document.querySelectorAll('.tender-cards-list .tender-summary-card');
    expect(tenderCards.length).toBe(1);
    expect(tenderCards[0].textContent).toContain('Tender #3');
  });

  it.skip('resets all filters when clicking Reset Filters button', async () => {
    render(<PublicAuditTab {...defaultProps} />);

    const searchInput = screen.getByRole('textbox', { name: /Search tenders/i });
    await userEvent.type(searchInput, 'NonExistentTitleXYZ');

    expect(screen.getByText('No tenders match your filters')).toBeInTheDocument();

    const resetButtons = screen.getAllByRole('button', { name: /Reset Filters/i });
    await userEvent.click(resetButtons[0]);

    expect(screen.getAllByText(/Tender #1/).length).toBeGreaterThan(0);
    expect(searchInput).toHaveValue('');
  });

  it('renders empty state when no tenders exist', () => {
    render(<PublicAuditTab {...defaultProps} tenders={[]} />);
    expect(screen.getByText('No tenders yet')).toBeInTheDocument();
  });

  it('renders error state and triggers onRetry callback', async () => {
    const onRetry = vi.fn();
    render(
      <PublicAuditTab
        {...defaultProps}
        dataLoadError="Network timeout error"
        onRetry={onRetry}
      />
    );

    expect(screen.getByText(/Can't reach the blockchain right now/i)).toBeInTheDocument();
    const retryBtn = screen.getByRole('button', { name: /Retry Connection/i });
    await userEvent.click(retryBtn);

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('opens, runs verification, and closes Try to cheat modal', async () => {
    render(<PublicAuditTab {...defaultProps} />);

    // Open Cheat Modal
    const cheatBtn = screen.getByRole('button', { name: /Try to cheat/i });
    await userEvent.click(cheatBtn);

    expect(screen.getByText('Try to cheat tests')).toBeInTheDocument();
    expect(screen.getByText(/Test A: Peek at the hidden bids/i)).toBeInTheDocument();
    expect(screen.getByText(/Test B: Change a submitted bid/i)).toBeInTheDocument();

    // Rerun tests button
    const rerunBtn = screen.getByRole('button', { name: /(Rerun Tests|Testing...)/i });
    expect(rerunBtn).toBeInTheDocument();

    // Close button
    const closeBtn = screen.getByRole('button', { name: '×' });
    await userEvent.click(closeBtn);

    expect(screen.queryByText('Try to cheat tests')).not.toBeInTheDocument();
  });

  it('renders payment stages and milestone statuses correctly', () => {
    render(<PublicAuditTab {...defaultProps} />);

    expect(screen.getByText('Payment stages')).toBeInTheDocument();
    expect(screen.getByText('Stage #1')).toBeInTheDocument();
    expect(screen.getByText('Stage #2')).toBeInTheDocument();
    expect(screen.getByText('Stage #3')).toBeInTheDocument();
  });

  it('renders activity event sentences correctly', () => {
    render(<PublicAuditTab {...defaultProps} />);

    expect(screen.getByText('Activity')).toBeInTheDocument();
    expect(screen.getByText('A bidder submitted a sealed bid.')).toBeInTheDocument();
  });

  describe('Cheat Test B: Duplicate Bid Protection Verification', () => {
    it('Case A: blocks duplicate commit with AlreadyCommitted when commit phase is open', async () => {
      const mockContract = createMockContract();
      // provider.call rejects with AlreadyCommitted custom error
      mockContract.runner.provider.call = vi.fn().mockRejectedValue({
        message: 'execution reverted: AlreadyCommitted',
        data: '0x64dbd987',
      });

      render(
        <PublicAuditTab
          {...defaultProps}
          contract={mockContract}
          selectedTenderId={1}
          tenders={[mockTenders[0]]}
          tenderDetails={mockTenders[0]} // Status 1, commitDeadline in future
          committedBidders={mockCommittedBidders}
        />
      );

      const cheatBtn = screen.getByRole('button', { name: /Try to cheat/i });
      await userEvent.click(cheatBtn);

      await waitFor(() => {
        expect(screen.getByText(/Blocked: a company cannot bid twice/i)).toBeInTheDocument();
      });
    });

    it('Case B: displays commit phase is closed when commitDeadline has passed', async () => {
      const mockContract = createMockContract();
      const closedTender = {
        ...mockTenders[0],
        commitDeadline: NOW - 500, // Past commit deadline
      };

      render(
        <PublicAuditTab
          {...defaultProps}
          contract={mockContract}
          selectedTenderId={1}
          tenders={[closedTender]}
          tenderDetails={closedTender}
          committedBidders={mockCommittedBidders}
        />
      );

      const cheatBtn = screen.getByRole('button', { name: /Try to cheat/i });
      await userEvent.click(cheatBtn);

      await waitFor(() => {
        expect(
          screen.getByText(/Cannot verify duplicate-bid protection: commit phase is closed/i)
        ).toBeInTheDocument();
      });
      // Ensure provider.call was NOT called
      expect(mockContract.runner.provider.call).not.toHaveBeenCalled();
    });

    it('Case C: displays no bids yet to test when tender has zero commits', async () => {
      const mockContract = createMockContract();
      const emptyTender = {
        ...mockTenders[0],
        totalCommits: 0,
      };

      render(
        <PublicAuditTab
          {...defaultProps}
          contract={mockContract}
          selectedTenderId={1}
          tenders={[emptyTender]}
          tenderDetails={emptyTender}
          committedBidders={[]}
          revealedBids={[]}
          events={[]}
        />
      );

      const cheatBtn = screen.getByRole('button', { name: /Try to cheat/i });
      await userEvent.click(cheatBtn);

      await waitFor(() => {
        expect(screen.getByText(/No bids yet to test/i)).toBeInTheDocument();
      });
      expect(mockContract.runner.provider.call).not.toHaveBeenCalled();
    });

    it('Case D: displays loading tender data when data is still loading', async () => {
      render(
        <PublicAuditTab
          {...defaultProps}
          selectedTenderId={1}
          tenders={[mockTenders[0]]}
          tenderDetails={mockTenders[0]}
          isDataLoading={true}
        />
      );

      const cheatBtn = screen.getByRole('button', { name: /Try to cheat/i });
      await userEvent.click(cheatBtn);

      await waitFor(() => {
        expect(screen.getByText(/Loading tender data\.\.\./i)).toBeInTheDocument();
      });
      expect(screen.queryByText(/No bids yet to test/i)).not.toBeInTheDocument();
    });

    it('Case E: handles RPC timeout with useful error message and restores button usability', async () => {
      const mockContract = createMockContract();
      mockContract.runner.provider.call = vi.fn().mockImplementation(() => {
        return new Promise((_, reject) => {
          setTimeout(() => reject(new Error('RPC_TIMEOUT')), 10);
        });
      });

      render(
        <PublicAuditTab
          {...defaultProps}
          contract={mockContract}
          selectedTenderId={1}
          tenderDetails={mockTenders[0]}
          committedBidders={mockCommittedBidders}
        />
      );

      const cheatBtn = screen.getByRole('button', { name: /Try to cheat/i });
      await userEvent.click(cheatBtn);

      await waitFor(() => {
        expect(screen.getByText(/Inconclusive: RPC request timed out/i)).toBeInTheDocument();
      });

      // Verify the button becomes usable again and is not stuck in Testing...
      const rerunBtn = screen.getByRole('button', { name: /Rerun Tests/i });
      expect(rerunBtn).toBeEnabled();
    });

    it('Case F: marks unknown contract revert as inconclusive rather than false security success', async () => {
      const mockContract = createMockContract();
      mockContract.runner.provider.call = vi.fn().mockRejectedValue({
        message: 'execution reverted: SomeUnknownRevertReason',
        data: '0x12345678',
      });

      render(
        <PublicAuditTab
          {...defaultProps}
          contract={mockContract}
          selectedTenderId={1}
          tenderDetails={mockTenders[0]}
          committedBidders={mockCommittedBidders}
        />
      );

      const cheatBtn = screen.getByRole('button', { name: /Try to cheat/i });
      await userEvent.click(cheatBtn);

      await waitFor(() => {
        expect(screen.getByText(/Inconclusive: Contract reverted with unexpected error/i)).toBeInTheDocument();
      });
      expect(screen.queryByText(/Blocked: a company cannot bid twice/i)).not.toBeInTheDocument();
    });

    it('Case G: displays duplicate-bid protection was not verified if RPC call succeeds without revert', async () => {
      const mockContract = createMockContract();
      mockContract.runner.provider.call = vi.fn().mockResolvedValue('0x');

      render(
        <PublicAuditTab
          {...defaultProps}
          contract={mockContract}
          selectedTenderId={1}
          tenderDetails={mockTenders[0]}
          committedBidders={mockCommittedBidders}
        />
      );

      const cheatBtn = screen.getByRole('button', { name: /Try to cheat/i });
      await userEvent.click(cheatBtn);

      await waitFor(() => {
        expect(screen.getByText(/Duplicate-bid protection was not verified/i)).toBeInTheDocument();
      });
      expect(screen.queryByText(/Blocked: a company cannot bid twice/i)).not.toBeInTheDocument();
    });
  });

  describe('Clickable Tender Cards & Selection', () => {
    it('clicking on a tender card container invokes onSelectTender and updates details', async () => {
      const onSelectTender = vi.fn();
      render(<PublicAuditTab {...defaultProps} onSelectTender={onSelectTender} />);

      const cards = document.querySelectorAll('.tender-cards-list .tender-summary-card');
      expect(cards.length).toBeGreaterThan(1);

      await userEvent.click(cards[1]);
      expect(onSelectTender).toHaveBeenCalledWith(4);
    });

    it('pressing Enter or Space on a focused tender card selects the tender', async () => {
      const onSelectTender = vi.fn();
      render(<PublicAuditTab {...defaultProps} onSelectTender={onSelectTender} />);

      const card = screen.getByRole('button', { name: /Select Tender #3/i });
      fireEvent.keyDown(card, { key: 'Enter' });
      expect(onSelectTender).toHaveBeenCalledWith(3);

      fireEvent.keyDown(card, { key: ' ' });
      expect(onSelectTender).toHaveBeenCalledWith(3);
    });

    it('updates detail view title and progress when switching to another tender', async () => {
      const { rerender } = render(<PublicAuditTab {...defaultProps} selectedTenderId={1} />);
      expect(screen.getByRole('heading', { name: /Tender #1/i })).toBeInTheDocument();

      rerender(<PublicAuditTab {...defaultProps} selectedTenderId={3} tenderDetails={mockTenders[2]} />);
      expect(screen.getByRole('heading', { name: /Tender #3/i })).toBeInTheDocument();
      expect(screen.getAllByText(/Winner chosen, waiting for the contract money/i).length).toBeGreaterThan(0);
    });
  });

  describe.skip('Search & Filter Interactions & Edge Cases', () => {
    it('applies multiple active filters simultaneously (search + category + procurement)', async () => {
      render(<PublicAuditTab {...defaultProps} />);

      const searchInput = screen.getByRole('textbox', { name: /Search tenders/i });
      const categorySelect = screen.getByRole('combobox', { name: /Category filter/i });
      const procurementSelect = screen.getByRole('combobox', { name: /Procurement filter/i });

      await userEvent.type(searchInput, '0x1111');
      await userEvent.selectOptions(categorySelect, 'infrastructure');
      await userEvent.selectOptions(procurementSelect, 'open');

      const cards = document.querySelectorAll('.tender-cards-list .tender-summary-card');
      expect(cards.length).toBe(1);
      expect(cards[0].textContent).toContain('Tender #1');
    });

    it('resets all filters from the empty-state button when search yields no matches', async () => {
      render(<PublicAuditTab {...defaultProps} />);

      const searchInput = screen.getByRole('textbox', { name: /Search tenders/i });
      await userEvent.type(searchInput, 'NonExistentXYZ999');

      expect(screen.getByText('No tenders match your filters')).toBeInTheDocument();
      const emptyResetBtns = screen.getAllByRole('button', { name: /Reset Filters/i });
      await userEvent.click(emptyResetBtns[emptyResetBtns.length - 1]);

      expect(searchInput).toHaveValue('');
      const cards = document.querySelectorAll('.tender-cards-list .tender-summary-card');
      expect(cards.length).toBe(mockTenders.length);
    });
  });

  describe('Activity & Transaction Links & Platform-wide Isolation', () => {
    it('isolates tender-specific events and excludes platform-wide events', () => {
      const mixedEvents = [
        {
          name: 'BidCommitted',
          tenderId: 1,
          description: 'Sealed bid on tender #1',
          time: '5m ago',
          txHash: '0xhash1',
        },
        {
          name: 'BidCommitted',
          tenderId: 2,
          description: 'Sealed bid on tender #2',
          time: '10m ago',
          txHash: '0xhash2',
        },
        {
          name: 'BidderRegistered',
          tenderId: null,
          isPlatformWide: true,
          description: 'Bidder registered globally',
          time: '20m ago',
          txHash: '0xhash3',
        },
        {
          name: 'DepartmentRegistered',
          description: 'Department registered on platform',
          time: '30m ago',
          txHash: '0xhash4',
        },
      ];

      render(<PublicAuditTab {...defaultProps} selectedTenderId={1} events={mixedEvents} />);

      expect(screen.getByText('A bidder submitted a sealed bid.')).toBeInTheDocument();
      expect(screen.queryByText(/Bidder registered globally/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Department registered on platform/i)).not.toBeInTheDocument();
    });

    it('renders transaction links with correct href, target, and rel', () => {
      const eventsWithTx = [
        {
          name: 'TenderCreated',
          tenderId: 1,
          description: 'Tender created on-chain',
          time: '1m ago',
          txHash: '0xabc123def456',
        },
      ];

      render(<PublicAuditTab {...defaultProps} selectedTenderId={1} events={eventsWithTx} />);

      const txLink = screen.getByRole('link', { name: /Tx ↗/i });
      expect(txLink).toBeInTheDocument();
      expect(txLink).toHaveAttribute('href', expect.stringContaining('/tx/0xabc123def456'));
      expect(txLink).toHaveAttribute('target', '_blank');
      expect(txLink).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('displays empty message when tender has no activity recorded', () => {
      render(<PublicAuditTab {...defaultProps} selectedTenderId={1} events={[]} />);
      expect(screen.getByText('No activity recorded for this tender yet.')).toBeInTheDocument();
    });
  });

  describe('Empty & Loading States for Bids & Milestones', () => {
    it('displays empty message when pre-reveal tender has no bids', () => {
      render(
        <PublicAuditTab
          {...defaultProps}
          selectedTenderId={1}
          tenderDetails={mockTenders[0]}
          committedBidders={[]}
        />
      );
      expect(screen.getByText('No bids yet')).toBeInTheDocument();
    });

    it('displays empty message when post-reveal tender has no bids', () => {
      render(
        <PublicAuditTab
          {...defaultProps}
          selectedTenderId={3}
          tenderDetails={mockTenders[2]}
          revealedBids={[]}
          committedBidders={[]}
        />
      );
      expect(screen.getByText('No bids yet')).toBeInTheDocument();
    });

    it('displays empty message when tender has no payment stages defined', () => {
      render(<PublicAuditTab {...defaultProps} milestones={[]} />);
      expect(screen.getByText('No payment stages defined.')).toBeInTheDocument();
    });
  });

  describe('Modal Control Interactions', () => {
    it('closes modal when clicking footer Close button', async () => {
      render(<PublicAuditTab {...defaultProps} />);

      const cheatBtn = screen.getByRole('button', { name: /Try to cheat/i });
      await userEvent.click(cheatBtn);
      expect(screen.getByText('Try to cheat tests')).toBeInTheDocument();

      const footerCloseBtn = screen.getByRole('button', { name: /^Close$/i });
      await userEvent.click(footerCloseBtn);
      expect(screen.queryByText('Try to cheat tests')).not.toBeInTheDocument();
    });

    it('closes modal when clicking backdrop outside dialog', async () => {
      render(<PublicAuditTab {...defaultProps} />);

      const cheatBtn = screen.getByRole('button', { name: /Try to cheat/i });
      await userEvent.click(cheatBtn);

      const backdrop = document.querySelector('.modal-backdrop');
      expect(backdrop).toBeInTheDocument();
      await userEvent.click(backdrop);

      expect(screen.queryByText('Try to cheat tests')).not.toBeInTheDocument();
    });

    it('does not close modal when clicking inside dialog', async () => {
      render(<PublicAuditTab {...defaultProps} />);

      const cheatBtn = screen.getByRole('button', { name: /Try to cheat/i });
      await userEvent.click(cheatBtn);

      const dialog = document.querySelector('.cheat-modal-dialog');
      await userEvent.click(dialog);

      expect(screen.getByText('Try to cheat tests')).toBeInTheDocument();
    });
  });

  describe('Cheat Test A: Bid Privacy Verification Suite', () => {
    it('Test A Case 1: blocks peek with BidsNotYetPublic when reveal deadline has not passed', async () => {
      const mockContract = createMockContract();
      mockContract.getRevealedBids = vi.fn().mockRejectedValue({
        message: 'execution reverted: BidsNotYetPublic',
        data: '0x85b6b756',
      });

      render(
        <PublicAuditTab
          {...defaultProps}
          contract={mockContract}
          selectedTenderId={1}
          tenderDetails={mockTenders[0]}
        />
      );

      const cheatBtn = screen.getByRole('button', { name: /Try to cheat/i });
      await userEvent.click(cheatBtn);

      await waitFor(() => {
        expect(
          screen.getByText(/Blocked: the contract refuses to show bids before the opening/i)
        ).toBeInTheDocument();
      });
    });

    it('Test A Case 2: reports bids already public when reveal deadline has passed', async () => {
      const mockContract = createMockContract();
      const pastRevealTender = {
        ...mockTenders[0],
        revealDeadline: NOW - 500,
      };

      render(
        <PublicAuditTab
          {...defaultProps}
          contract={mockContract}
          selectedTenderId={1}
          tenders={[pastRevealTender]}
          tenderDetails={pastRevealTender}
        />
      );

      const cheatBtn = screen.getByRole('button', { name: /Try to cheat/i });
      await userEvent.click(cheatBtn);

      await waitFor(() => {
        expect(
          screen.getByText(/Bids are already public for this tender/i)
        ).toBeInTheDocument();
      });
      expect(mockContract.getRevealedBids).not.toHaveBeenCalled();
    });

    it('Test A Case 3: reports privacy protection not verified if contract returns bids before reveal deadline', async () => {
      const mockContract = createMockContract();
      // Returns bids without reverting before reveal deadline
      mockContract.getRevealedBids = vi.fn().mockResolvedValue(mockRevealedBids);

      render(
        <PublicAuditTab
          {...defaultProps}
          contract={mockContract}
          selectedTenderId={1}
          tenderDetails={mockTenders[0]}
        />
      );

      const cheatBtn = screen.getByRole('button', { name: /Try to cheat/i });
      await userEvent.click(cheatBtn);

      await waitFor(() => {
        expect(
          screen.getByText(/Privacy protection was not verified: contract returned bids before the reveal deadline/i)
        ).toBeInTheDocument();
      });
      expect(screen.queryByText(/Blocked: the contract refuses to show bids/i)).not.toBeInTheDocument();
    });

    it('Test A Case 4: reports inconclusive on RPC timeout', async () => {
      const mockContract = createMockContract();
      mockContract.getRevealedBids = vi.fn().mockImplementation(() => {
        return new Promise((_, reject) => {
          setTimeout(() => reject(new Error('RPC_TIMEOUT')), 10);
        });
      });

      render(
        <PublicAuditTab
          {...defaultProps}
          contract={mockContract}
          selectedTenderId={1}
          tenderDetails={mockTenders[0]}
        />
      );

      const cheatBtn = screen.getByRole('button', { name: /Try to cheat/i });
      await userEvent.click(cheatBtn);

      await waitFor(() => {
        expect(
          screen.getAllByText(/Inconclusive: RPC request timed out/i).length
        ).toBeGreaterThan(0);
      });
    });

    it('Test A Case 5: reports inconclusive on network or communication error', async () => {
      const mockContract = createMockContract();
      mockContract.getRevealedBids = vi.fn().mockRejectedValue(new Error('Failed to fetch from RPC endpoint'));

      render(
        <PublicAuditTab
          {...defaultProps}
          contract={mockContract}
          selectedTenderId={1}
          tenderDetails={mockTenders[0]}
        />
      );

      const cheatBtn = screen.getByRole('button', { name: /Try to cheat/i });
      await userEvent.click(cheatBtn);

      await waitFor(() => {
        expect(
          screen.getByText(/Inconclusive: RPC communication error/i)
        ).toBeInTheDocument();
      });
      expect(screen.queryByText(/Blocked: the contract refuses to show bids/i)).not.toBeInTheDocument();
    });

    it('Test A Case 6: reports inconclusive on unexpected revert', async () => {
      const mockContract = createMockContract();
      mockContract.getRevealedBids = vi.fn().mockRejectedValue({
        message: 'execution reverted: Panic(1)',
        data: '0x4e487b71',
      });

      render(
        <PublicAuditTab
          {...defaultProps}
          contract={mockContract}
          selectedTenderId={1}
          tenderDetails={mockTenders[0]}
        />
      );

      const cheatBtn = screen.getByRole('button', { name: /Try to cheat/i });
      await userEvent.click(cheatBtn);

      await waitFor(() => {
        expect(
          screen.getByText(/Inconclusive: Contract reverted with unexpected error/i)
        ).toBeInTheDocument();
      });
      expect(screen.queryByText(/Blocked: the contract refuses to show bids/i)).not.toBeInTheDocument();
    });
  });

  describe('Cheat Test B: Additional Security Precondition Cases', () => {
    it('Case H: distinguishes zero bids from unavailable bidder commitment data', async () => {
      const mockContract = createMockContract();
      const tenderWithCommits = {
        ...mockTenders[0],
        totalCommits: 3, // Tender says 3 commits exist
      };

      // But committedBidders, revealedBids, winningBidder, and events are missing/empty
      render(
        <PublicAuditTab
          {...defaultProps}
          contract={mockContract}
          selectedTenderId={1}
          tenderDetails={tenderWithCommits}
          committedBidders={[]}
          revealedBids={[]}
          events={[]}
        />
      );

      const cheatBtn = screen.getByRole('button', { name: /Try to cheat/i });
      await userEvent.click(cheatBtn);

      await waitFor(() => {
        expect(
          screen.getByText(/Inconclusive: Bidder commitment data unavailable to test/i)
        ).toBeInTheDocument();
      });
      expect(screen.queryByText(/No bids yet to test/i)).not.toBeInTheDocument();
    });

    it('Case I: displays cannot verify duplicate-bid protection when tender status is not open', async () => {
      const mockContract = createMockContract();
      const awardedTender = {
        ...mockTenders[2], // Status 2 (Awarded)
      };

      render(
        <PublicAuditTab
          {...defaultProps}
          contract={mockContract}
          selectedTenderId={3}
          tenderDetails={awardedTender}
          committedBidders={mockCommittedBidders}
        />
      );

      const cheatBtn = screen.getByRole('button', { name: /Try to cheat/i });
      await userEvent.click(cheatBtn);

      await waitFor(() => {
        expect(
          screen.getByText(/Cannot verify duplicate-bid protection: tender is not in open status/i)
        ).toBeInTheDocument();
      });
      expect(mockContract.runner.provider.call).not.toHaveBeenCalled();
    });

    it('Case J: handles unavailable provider cleanly', async () => {
      const mockContract = createMockContract();
      mockContract.runner.provider = null;
      mockContract.runner = null;

      render(
        <PublicAuditTab
          {...defaultProps}
          contract={mockContract}
          selectedTenderId={1}
          tenderDetails={mockTenders[0]}
          committedBidders={mockCommittedBidders}
        />
      );

      const cheatBtn = screen.getByRole('button', { name: /Try to cheat/i });
      await userEvent.click(cheatBtn);

      await waitFor(() => {
        expect(screen.getByText(/Inconclusive: Provider is unavailable/i)).toBeInTheDocument();
      });
    });

    it('Case K: re-running tests recovers button and triggers verification again', async () => {
      const mockContract = createMockContract();
      mockContract.runner.provider.call = vi.fn().mockRejectedValue({
        message: 'execution reverted: AlreadyCommitted',
        data: '0x64dbd987',
      });

      render(
        <PublicAuditTab
          {...defaultProps}
          contract={mockContract}
          selectedTenderId={1}
          tenderDetails={mockTenders[0]}
          committedBidders={mockCommittedBidders}
        />
      );

      const cheatBtn = screen.getByRole('button', { name: /Try to cheat/i });
      await userEvent.click(cheatBtn);

      await waitFor(() => {
        expect(screen.getByText(/Blocked: a company cannot bid twice/i)).toBeInTheDocument();
      });

      const rerunBtn = screen.getByRole('button', { name: /Rerun Tests/i });
      expect(rerunBtn).toBeEnabled();

      await userEvent.click(rerunBtn);

      await waitFor(() => {
        expect(mockContract.runner.provider.call).toHaveBeenCalledTimes(2);
      });
      expect(rerunBtn).toBeEnabled();
    });
  });

  describe('Tender Selection & Data Isolation Across Tenders', () => {
    it('does not leak previous tender bids and payment stages when switching tenders', async () => {
      // Tender 1 has mockCommittedBidders and mockMilestones.
      // Tender 2 has no bids and no milestones.
      const mockContract = createMockContract();
      mockContract.getMilestones = vi.fn().mockResolvedValue([]);
      mockContract.getRevealedBids = vi.fn().mockRejectedValue({
        message: 'execution reverted: BidsNotYetPublic',
        data: '0x85b6b756',
      });

      const { rerender } = render(
        <PublicAuditTab
          {...defaultProps}
          contract={mockContract}
          selectedTenderId={1}
          tenderDetails={mockTenders[0]}
          milestones={mockMilestones}
          committedBidders={mockCommittedBidders}
        />
      );

      // Tender 1 details rendered
      expect(screen.getByText('Stage #1')).toBeInTheDocument();
      expect(screen.getByText(/0x15d3\.\.\.6A65/i)).toBeInTheDocument();

      // Now switch to Tender 2, while parent props still hold Tender 1's tenderDetails and milestones
      rerender(
        <PublicAuditTab
          {...defaultProps}
          contract={mockContract}
          selectedTenderId={2}
          tenderDetails={mockTenders[0]} // Mismatched prop from previous tender
          milestones={mockMilestones}     // Mismatched prop from previous tender
          committedBidders={mockCommittedBidders} // Mismatched prop
        />
      );

      // Verify that Tender 1's milestones and bids are NOT leaked under Tender 2
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /Tender #2/i })).toBeInTheDocument();
      });
      expect(screen.queryByText(/0x15d3\.\.\.6A65/i)).not.toBeInTheDocument();
      expect(screen.queryByText('Stage #1')).not.toBeInTheDocument();
    });

    it('does not use previous tender bidder in Cheat Test B when switching tenders', async () => {
      const mockContract = createMockContract();
      mockContract.runner.provider.call = vi.fn().mockRejectedValue({
        message: 'execution reverted: AlreadyCommitted',
        data: '0x64dbd987',
      });

      const openTender2 = {
        ...mockTenders[1],
        id: 2,
        commitDeadline: NOW + 3600,
        revealDeadline: NOW + 7200,
        totalCommits: 2,
      };

      // Render with selectedTenderId: 2, but tenderDetails prop is for tender #1
      // activeTender is tender #2 which has totalCommits: 2 but no bidders loaded yet
      render(
        <PublicAuditTab
          {...defaultProps}
          contract={mockContract}
          selectedTenderId={2}
          tenders={[openTender2]}
          tenderDetails={mockTenders[0]} // Belongs to tender 1
          committedBidders={mockCommittedBidders} // Belongs to tender 1
          events={[]} // No events for tender 2
        />
      );

      const cheatBtn = screen.getByRole('button', { name: /Try to cheat/i });
      await userEvent.click(cheatBtn);

      // Since committedBidders belonged to Tender 1, Test B must NOT use it for Tender 2!
      await waitFor(() => {
        expect(
          screen.getByText(/Inconclusive: Bidder commitment data unavailable to test/i)
        ).toBeInTheDocument();
      });
      expect(mockContract.runner.provider.call).not.toHaveBeenCalled();
    });
  });

  describe('Keyboard Accessibility & Modal Controls', () => {
    it('closes Try to cheat modal when Escape key is pressed', async () => {
      render(<PublicAuditTab {...defaultProps} />);

      const cheatBtn = screen.getByRole('button', { name: /Try to cheat/i });
      await userEvent.click(cheatBtn);
      expect(screen.getByText('Try to cheat tests')).toBeInTheDocument();

      fireEvent.keyDown(window, { key: 'Escape' });
      expect(screen.queryByText('Try to cheat tests')).not.toBeInTheDocument();
    });
  });

  describe('Comprehensive Loading and Connection Error States', () => {
    it('displays loading message in tenders catalog when tenders are loading', () => {
      render(<PublicAuditTab {...defaultProps} tenders={[]} isDataLoading={true} />);
      expect(screen.getByText('Loading tenders from blockchain...')).toBeInTheDocument();
    });

    it('displays connection error message in tenders catalog when dataLoadError is present', () => {
      render(
        <PublicAuditTab
          {...defaultProps}
          tenders={[]}
          dataLoadError="Unable to query RPC endpoint"
        />
      );
      expect(
        screen.getByText('Unable to load tenders due to connection error.')
      ).toBeInTheDocument();
    });

    it('displays Loading bids and Loading payment stages when isDataLoading is true', () => {
      render(
        <PublicAuditTab
          {...defaultProps}
          selectedTenderId={1}
          tenderDetails={mockTenders[0]}
          isDataLoading={true}
        />
      );

      expect(screen.getByText('Loading bids...')).toBeInTheDocument();
      expect(screen.getByText('Loading payment stages...')).toBeInTheDocument();
    });
  });

  describe.skip('Search Trimming and Status Querying', () => {
    it('matches tenders when search query contains untrimmed whitespace', async () => {
      render(<PublicAuditTab {...defaultProps} />);

      const searchInput = screen.getByRole('textbox', { name: /Search tenders/i });
      await userEvent.type(searchInput, '   Technology   ');

      const cards = document.querySelectorAll('.tender-cards-list .tender-summary-card');
      expect(cards.length).toBe(1);
      expect(cards[0].textContent).toContain('Tender #2');
    });

    it('matches tenders when searching by status label', async () => {
      render(<PublicAuditTab {...defaultProps} />);

      const searchInput = screen.getByRole('textbox', { name: /Search tenders/i });
      await userEvent.type(searchInput, 'Opening bids');

      // Tender #2 is in reveal window -> "Opening bids"
      const cards = document.querySelectorAll('.tender-cards-list .tender-summary-card');
      expect(cards.length).toBe(1);
      expect(cards[0].textContent).toContain('Tender #2');
    });

    it('filters tenders by scale attribute if present', async () => {
      const tendersWithScale = [
        { ...mockTenders[0], id: 10, scale: 'direct' },
        { ...mockTenders[1], id: 20, procurementScale: 'restricted' },
      ];

      render(<PublicAuditTab {...defaultProps} tenders={tendersWithScale} />);

      const procurementSelect = screen.getByRole('combobox', { name: /Procurement filter/i });
      await userEvent.selectOptions(procurementSelect, 'direct');

      const cards = document.querySelectorAll('.tender-cards-list .tender-summary-card');
      expect(cards.length).toBe(1);
      expect(cards[0].textContent).toContain('Tender #10');
    });
  });

  describe('Platform-Wide Event Isolation & Event Sentence Formatting', () => {
    it('strictly rejects all platform-wide event types even if given a tenderId', () => {
      const platformEvents = [
        { name: 'ParticipantRegistered', tenderId: 1, description: 'Participant added' },
        { name: 'RoleGranted', tenderId: 1, description: 'Role granted' },
        { name: 'RoleRevoked', tenderId: 1, description: 'Role revoked' },
        { name: 'Paused', tenderId: 1, description: 'Contract paused' },
        { name: 'Unpaused', tenderId: 1, description: 'Contract unpaused' },
        { name: 'BalanceWithdrawn', tenderId: 1, description: 'Balance withdrawn' },
        { name: 'BalanceCredited', tenderId: 1, description: 'Balance credited' },
      ];

      render(<PublicAuditTab {...defaultProps} selectedTenderId={1} events={platformEvents} />);
      expect(
        screen.getByText('No activity recorded for this tender yet.')
      ).toBeInTheDocument();
    });

    it('formats all 13 tender-specific event names into accurate human-readable sentences', () => {
      const allTenderEvents = [
        { name: 'TenderCreated', tenderId: 1, txHash: '0x1' },
        { name: 'BidCommitted', tenderId: 1, txHash: '0x2' },
        { name: 'BidRevealed', tenderId: 1, txHash: '0x3' },
        { name: 'TenderAwarded', tenderId: 1, txHash: '0x4' },
        { name: 'TenderFailed', tenderId: 1, txHash: '0x5' },
        { name: 'TenderCancelled', tenderId: 1, txHash: '0x6' },
        { name: 'EscrowFunded', tenderId: 1, txHash: '0x7' },
        { name: 'MilestoneSubmitted', tenderId: 1, txHash: '0x8' },
        { name: 'MilestoneApproved', tenderId: 1, txHash: '0x9' },
        { name: 'MilestoneReleased', tenderId: 1, txHash: '0x10' },
        { name: 'TenderCompleted', tenderId: 1, txHash: '0x11' },
        { name: 'TenderDefaulted', tenderId: 1, txHash: '0x12' },
        { name: 'BondRefundClaimed', tenderId: 1, txHash: '0x13' },
      ];

      render(<PublicAuditTab {...defaultProps} selectedTenderId={1} events={allTenderEvents} />);

      expect(screen.getByText('Tender was created and published on-chain.')).toBeInTheDocument();
      expect(screen.getByText('A bidder submitted a sealed bid.')).toBeInTheDocument();
      expect(screen.getByText('A bidder revealed their sealed bid.')).toBeInTheDocument();
      expect(screen.getByText('Contract was awarded to the lowest valid bidder.')).toBeInTheDocument();
      expect(screen.getByText('Tender failed with no valid bids.')).toBeInTheDocument();
      expect(screen.getByText('Tender was cancelled by the department.')).toBeInTheDocument();
      expect(screen.getByText('Contract escrow was funded by the department.')).toBeInTheDocument();
      expect(screen.getByText('Contractor submitted milestone completion evidence.')).toBeInTheDocument();
      expect(screen.getByText('Milestone evidence was approved by an authorized verifier.')).toBeInTheDocument();
      expect(screen.getByText('Milestone payment release was executed on-chain.')).toBeInTheDocument();
      expect(screen.getByText('All milestones completed and tender closed.')).toBeInTheDocument();
      expect(screen.getByText('Contractor defaulted on project deadlines.')).toBeInTheDocument();
      expect(screen.getByText('Bidder claimed their bid deposit refund.')).toBeInTheDocument();
    });
  });
});
