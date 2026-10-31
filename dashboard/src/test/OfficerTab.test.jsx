import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OfficerTab from '../components/OfficerTab';
import { getReadOnlyContract } from '../config';
import {
  mockTenders,
  mockMilestones,
  createMockContract,
  REGISTRAR_ACCOUNT,
  DEPARTMENT_ACCOUNT,
  VERIFIER1_ACCOUNT,
  BIDDER1_ACCOUNT,
  NOW,
} from './mockData';

describe('OfficerTab Component Tests', () => {
  const defaultProps = {
    account: DEPARTMENT_ACCOUNT,
    signerContract: createMockContract(),
    tenders: mockTenders,
    roles: { isDepartment: true, isRegistrar: true, isVerifier: true },
    onRefresh: vi.fn(),
    setNotification: vi.fn(),
    isWrongNetwork: false,
    chainId: 91562037,
    latestBlockTimestamp: NOW,
  };

  it('populates demo values when clicking Fill demo values button without sending transactions', async () => {
    const mockContract = createMockContract();
    render(<OfficerTab {...defaultProps} signerContract={mockContract} />);

    const fillDemoBtn = screen.getByRole('button', { name: /Fill demo values/i });
    await userEvent.click(fillDemoBtn);

    const titleInput = screen.getByPlaceholderText(/e\.g\. Demo road repair/i);
    expect(titleInput.value).toContain('Demo road repair');

    const ceilingInput = screen.getByPlaceholderText(/e\.g\. 0\.02/i);
    expect(ceilingInput.value).toBe('0.02');

    // No smart contract methods should be invoked during demo filling
    expect(mockContract.createTender).not.toHaveBeenCalled();
  });

  it('validates tender parameters and submits createTender', async () => {
    const mockContract = createMockContract();
    render(<OfficerTab {...defaultProps} signerContract={mockContract} />);

    // Click fill demo values to get valid tender parameters
    const fillDemoBtn = screen.getByRole('button', { name: /Fill demo values/i });
    await userEvent.click(fillDemoBtn);

    const publishBtn = screen.getByRole('button', { name: /Publish tender/i });
    expect(publishBtn).not.toBeDisabled();

    await userEvent.click(publishBtn);

    await waitFor(() => {
      expect(mockContract.createTender).toHaveBeenCalled();
    });
  });

  it('handles Choose the winner (Finalize Award) action', async () => {
    const mockContract = createMockContract();
    // Tender #2 is in reveal window, but let's test a tender whose revealDeadline has passed (like Tender #3 or a mock tender)
    const tendersWithReadyToAward = [
      {
        ...mockTenders[1],
        id: 10,
        commitDeadline: NOW - 2000,
        revealDeadline: NOW - 500, // passed reveal deadline
        status: 1, // Open
      },
    ];

    render(
      <OfficerTab
        {...defaultProps}
        tenders={tendersWithReadyToAward}
        signerContract={mockContract}
      />
    );

    const awardBtn = screen.getByRole('button', { name: /Choose the winner/i });
    await userEvent.click(awardBtn);

    await waitFor(() => {
      expect(mockContract.finalizeAward).toHaveBeenCalledWith(10);
    });
  });

  it('handles Fund Escrow action for awarded tender', async () => {
    const mockContract = createMockContract();
    const tendersWithAwarded = [
      {
        ...mockTenders[2],
        id: 20,
        status: 2, // Awarded
        escrowDeadline: NOW + 3600, // escrow window active
      },
    ];

    render(
      <OfficerTab
        {...defaultProps}
        tenders={tendersWithAwarded}
        signerContract={mockContract}
      />
    );

    const fundBtn = screen.getByRole('button', { name: /Deposit the contract money/i });
    await userEvent.click(fundBtn);

    await waitFor(() => {
      expect(mockContract.fundEscrow).toHaveBeenCalledWith(20, expect.anything());
    });
  });

  it('handles Cancel tender before commit deadline', async () => {
    const mockContract = createMockContract();
    const tendersWithOpenCommit = [
      {
        ...mockTenders[0],
        id: 30,
        department: DEPARTMENT_ACCOUNT,
        status: 1,
        commitDeadline: NOW + 3600, // before commit deadline
      },
    ];

    render(
      <OfficerTab
        {...defaultProps}
        account={DEPARTMENT_ACCOUNT}
        roles={{ isDepartment: true }}
        tenders={tendersWithOpenCommit}
        signerContract={mockContract}
      />
    );

    const cancelBtn = screen.getByRole('button', { name: /Cancel this tender/i });
    await userEvent.click(cancelBtn);

    await waitFor(() => {
      expect(mockContract.cancelTender).toHaveBeenCalledWith(30, expect.anything());
    });
  });

  it('handles Cancel unfunded tender after escrow timeout', async () => {
    const mockContract = createMockContract();
    const tendersWithExpiredEscrow = [
      {
        ...mockTenders[2],
        id: 40,
        department: DEPARTMENT_ACCOUNT,
        status: 2, // Awarded
        escrowDeadline: NOW - 100, // escrow funding deadline expired
      },
    ];

    render(
      <OfficerTab
        {...defaultProps}
        account={DEPARTMENT_ACCOUNT}
        roles={{ isDepartment: true }}
        tenders={tendersWithExpiredEscrow}
        signerContract={mockContract}
      />
    );

    const cancelTimeoutBtn = screen.getByRole('button', { name: /Cancel: not funded in time/i });
    await userEvent.click(cancelTimeoutBtn);

    await waitFor(() => {
      expect(mockContract.cancelUnfundedTender).toHaveBeenCalledWith(40);
    });
  });

  it('handles Declare missed deadline when milestone grace period expires', async () => {
    const mockContract = createMockContract();
    const tendersWithDefault = [
      {
        ...mockTenders[3],
        id: 50,
        department: DEPARTMENT_ACCOUNT,
        status: 3, // Funded
        completedMilestones: 0,
        gracePeriod: 3600,
      },
    ];

    // Mock milestone #0 as overdue in read-only contract for this test
    const roContract = getReadOnlyContract();
    roContract.getMilestones.mockResolvedValueOnce([
      {
        percentageBps: 3000,
        dueDate: NOW - 5000, // overdue
        submittedAt: 0,
        evidenceHash: '0x00',
        approvalCount: 0,
        status: 0, // Pending
        payoutAmount: 0n,
        penaltyDeducted: 0n,
      },
    ]);

    render(
      <OfficerTab
        {...defaultProps}
        account={DEPARTMENT_ACCOUNT}
        roles={{ isDepartment: true }}
        tenders={tendersWithDefault}
        signerContract={mockContract}
      />
    );

    await waitFor(() => {
      const defaultBtn = screen.getByRole('button', { name: /Declare missed deadline/i });
      expect(defaultBtn).toBeInTheDocument();
    });

    const defaultBtn = screen.getByRole('button', { name: /Declare missed deadline/i });
    await userEvent.click(defaultBtn);

    await waitFor(() => {
      expect(mockContract.declareDefault).toHaveBeenCalledWith(50);
    });
  });

  it('approves submitted milestone work in Verifier section', async () => {
    const mockContract = createMockContract();
    const roContract = getReadOnlyContract();
    roContract.getMilestones.mockResolvedValue(mockMilestones);

    const tendersWithMilestoneSubmitted = mockTenders.map((t) =>
      t.id === 4 ? { ...t, completedMilestones: 1 } : t
    );

    render(
      <OfficerTab
        {...defaultProps}
        account={VERIFIER1_ACCOUNT}
        roles={{ isVerifier: true }}
        tenders={tendersWithMilestoneSubmitted}
        signerContract={mockContract}
      />
    );

    await waitFor(() => {
      const approveBtns = screen.queryAllByRole('button', { name: /Approve this stage/i });
      expect(approveBtns.length).toBeGreaterThan(0);
    });

    const approveBtn = screen.getAllByRole('button', { name: /Approve this stage/i })[0];
    await userEvent.click(approveBtn);

    await waitFor(() => {
      expect(mockContract.approveMilestone).toHaveBeenCalled();
    });
  });

  it('handles Department participant registration by Admin', async () => {
    const mockContract = createMockContract();
    render(
      <OfficerTab
        {...defaultProps}
        account={REGISTRAR_ACCOUNT}
        roles={{ isRegistrar: true }}
        signerContract={mockContract}
      />
    );

    const addressInput = screen.getByPlaceholderText(/Wallet Address \(0x\.\.\.\)/i);
    await userEvent.type(addressInput, DEPARTMENT_ACCOUNT);

    const roleSelect = screen.getAllByRole('combobox').find((select) =>
      select.innerHTML.includes('Department')
    );
    await userEvent.selectOptions(roleSelect, 'Department');

    const addBtn = screen.getByRole('button', { name: /Add participant/i });
    await userEvent.click(addBtn);

    await waitFor(() => {
      expect(mockContract.registerDepartment).toHaveBeenCalledWith(DEPARTMENT_ACCOUNT);
    });
  });

  it('handles Verifier participant registration by Admin', async () => {
    const mockContract = createMockContract();
    render(
      <OfficerTab
        {...defaultProps}
        account={REGISTRAR_ACCOUNT}
        roles={{ isRegistrar: true }}
        signerContract={mockContract}
      />
    );

    const addressInput = screen.getByPlaceholderText(/Wallet Address \(0x\.\.\.\)/i);
    await userEvent.type(addressInput, VERIFIER1_ACCOUNT);

    const roleSelect = screen.getAllByRole('combobox').find((select) =>
      select.innerHTML.includes('Verifier')
    );
    await userEvent.selectOptions(roleSelect, 'Verifier');

    const addBtn = screen.getByRole('button', { name: /Add participant/i });
    await userEvent.click(addBtn);

    await waitFor(() => {
      expect(mockContract.registerVerifier).toHaveBeenCalledWith(VERIFIER1_ACCOUNT);
    });
  });

  it('handles Bidder registration with group and identity hashing by Admin', async () => {
    const mockContract = createMockContract();
    render(
      <OfficerTab
        {...defaultProps}
        account={REGISTRAR_ACCOUNT}
        roles={{ isRegistrar: true }}
        signerContract={mockContract}
      />
    );

    const addressInput = screen.getByPlaceholderText(/Wallet Address \(0x\.\.\.\)/i);
    await userEvent.type(addressInput, BIDDER1_ACCOUNT);

    const roleSelect = screen.getAllByRole('combobox').find((select) =>
      select.innerHTML.includes('Bidder')
    );
    await userEvent.selectOptions(roleSelect, 'Bidder');

    const groupInput = screen.getByPlaceholderText(/e\.g\. Acme Infrastructure Group/i);
    await userEvent.type(groupInput, 'Acme Group');

    const regRefInput = screen.getByPlaceholderText(/e\.g\. CORP-REG-987654/i);
    await userEvent.type(regRefInput, 'REG-123456');

    const addBtn = screen.getByRole('button', { name: /Add participant/i });
    await userEvent.click(addBtn);

    await waitFor(() => {
      expect(mockContract.registerBidder).toHaveBeenCalledWith(
        BIDDER1_ACCOUNT,
        expect.stringMatching(/^0x[0-9a-fA-F]{64}$/),
        expect.stringMatching(/^0x[0-9a-fA-F]{64}$/)
      );
    });
  });

  it('handles Bidder debarment by Admin', async () => {
    const mockContract = createMockContract();
    render(
      <OfficerTab
        {...defaultProps}
        account={REGISTRAR_ACCOUNT}
        roles={{ isRegistrar: true }}
        signerContract={mockContract}
      />
    );

    const addressInput = screen.getByPlaceholderText(/Bidder Address \(0x\.\.\.\)/i);
    await userEvent.type(addressInput, BIDDER1_ACCOUNT);

    const reasonInput = screen.getByPlaceholderText(/e\.g\. Collusion or tender default/i);
    await userEvent.type(reasonInput, 'Collusive bidding violation');

    const blockBtn = screen.getByRole('button', { name: /Block bidder/i });
    await userEvent.click(blockBtn);

    await waitFor(() => {
      expect(mockContract.debarBidder).toHaveBeenCalledWith(
        BIDDER1_ACCOUNT,
        'Collusive bidding violation'
      );
    });
  });
});
