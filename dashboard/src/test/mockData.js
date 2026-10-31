import { vi } from 'vitest';
import { ethers } from 'ethers';

export const REGISTRAR_ACCOUNT = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
export const DEPARTMENT_ACCOUNT = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
export const VERIFIER1_ACCOUNT = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
export const VERIFIER2_ACCOUNT = "0x90F79bf6EB2c4f870365E785982E1f101E93b906";
export const BIDDER1_ACCOUNT = "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65";
export const BIDDER2_ACCOUNT = "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc";
export const VISITOR_ACCOUNT = "0x976EA74026E726554dB657fA54763abd0C3a0aa9";

export const NOW = 1700000000;

export const mockTenders = [
  {
    id: 1,
    status: 1, // Open (Commit window)
    ceilingPrice: ethers.parseEther("0.05"),
    bidBond: ethers.parseEther("0.005"),
    commitDeadline: NOW + 3600,
    revealDeadline: NOW + 7200,
    escrowFundingDeadline: NOW + 10800,
    department: DEPARTMENT_ACCOUNT,
    winningBidder: ethers.ZeroAddress,
    winningAmount: 0n,
    totalCommits: 2,
    documentHash: "0x1111111111111111111111111111111111111111111111111111111111111111",
    category: "Infrastructure",
    procurementMethod: "open",
  },
  {
    id: 2,
    status: 1, // Open (Reveal window)
    ceilingPrice: ethers.parseEther("0.04"),
    bidBond: ethers.parseEther("0.004"),
    commitDeadline: NOW - 600,
    revealDeadline: NOW + 3600,
    escrowFundingDeadline: NOW + 7200,
    department: DEPARTMENT_ACCOUNT,
    winningBidder: ethers.ZeroAddress,
    winningAmount: 0n,
    totalCommits: 3,
    documentHash: "0x2222222222222222222222222222222222222222222222222222222222222222",
    category: "Technology",
    procurementMethod: "restricted",
  },
  {
    id: 3,
    status: 2, // Awarded
    ceilingPrice: ethers.parseEther("0.08"),
    bidBond: ethers.parseEther("0.008"),
    commitDeadline: NOW - 7200,
    revealDeadline: NOW - 3600,
    escrowFundingDeadline: NOW + 3600,
    department: DEPARTMENT_ACCOUNT,
    winningBidder: BIDDER1_ACCOUNT,
    winningAmount: ethers.parseEther("0.065"),
    totalCommits: 2,
    documentHash: "0x3333333333333333333333333333333333333333333333333333333333333333",
    category: "Services",
    procurementMethod: "direct",
  },
  {
    id: 4,
    status: 3, // Funded
    ceilingPrice: ethers.parseEther("0.1"),
    bidBond: ethers.parseEther("0.01"),
    commitDeadline: NOW - 10000,
    revealDeadline: NOW - 7000,
    escrowFundingDeadline: NOW - 4000,
    department: DEPARTMENT_ACCOUNT,
    winningBidder: BIDDER1_ACCOUNT,
    winningAmount: ethers.parseEther("0.09"),
    completedMilestones: 0,
    approvalThreshold: 2,
    documentHash: "0x4444444444444444444444444444444444444444444444444444444444444444",
    category: "Energy",
    procurementMethod: "open",
  },
  {
    id: 5,
    status: 6, // Cancelled
    ceilingPrice: ethers.parseEther("0.02"),
    bidBond: ethers.parseEther("0.002"),
    commitDeadline: NOW - 5000,
    revealDeadline: NOW - 2000,
    escrowFundingDeadline: NOW - 1000,
    department: DEPARTMENT_ACCOUNT,
    winningBidder: ethers.ZeroAddress,
    winningAmount: 0n,
    documentHash: "0x5555555555555555555555555555555555555555555555555555555555555555",
    category: "Infrastructure",
    procurementMethod: "open",
  },
];

export const mockMilestones = [
  {
    percentageBps: 3000,
    dueDate: NOW + 86400,
    submittedAt: 0,
    evidenceHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
    approvalCount: 0,
    status: 0, // Pending
    payoutAmount: 0n,
    penaltyDeducted: 0n,
  },
  {
    percentageBps: 3000,
    dueDate: NOW + 172800,
    submittedAt: NOW - 100,
    evidenceHash: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
    approvalCount: 1,
    status: 1, // Submitted
    payoutAmount: 0n,
    penaltyDeducted: 0n,
  },
  {
    percentageBps: 4000,
    dueDate: NOW + 259200,
    submittedAt: NOW - 500,
    evidenceHash: "0x9876543210fedcba9876543210fedcba9876543210fedcba9876543210fedcba",
    approvalCount: 2,
    status: 2, // Approved
    payoutAmount: ethers.parseEther("0.036"),
    penaltyDeducted: 0n,
  },
];

export const mockRevealedBids = [
  {
    bidder: BIDDER2_ACCOUNT,
    amount: ethers.parseEther("0.035"),
    valid: true,
  },
  {
    bidder: BIDDER1_ACCOUNT,
    amount: ethers.parseEther("0.038"),
    valid: true,
  },
];

export const mockCommittedBidders = [
  {
    bidder: BIDDER1_ACCOUNT,
    commitHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    commitTime: NOW - 3000,
  },
  {
    bidder: BIDDER2_ACCOUNT,
    commitHash: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    commitTime: NOW - 2500,
  },
];

export const mockPlatformStats = {
  tendersCount: 5,
  registeredBidders: 12,
  tvl: ethers.parseEther("0.19"),
  completedTenders: 1,
};

export function createMockContract(overrides = {}) {
  const claimBondRefundStaticCall = vi.fn().mockImplementation(async (id) => {
    if (Number(id) === 3 || Number(id) === 5) return true;
    const err = new Error("BondNotRefundable()");
    err.data = "0x";
    throw err;
  });

  const claimBondRefund = vi.fn().mockResolvedValue({
    hash: "0xtx_claim_refund_hash",
    wait: vi.fn().mockResolvedValue({ status: 1 }),
  });
  claimBondRefund.staticCall = claimBondRefundStaticCall;

  return {
    getAddress: vi.fn().mockResolvedValue("0x493Bb88ad309346aA84E237aC84c8612eD1852d8"),
    interface: {
      encodeFunctionData: vi.fn().mockReturnValue("0xencoded_call_data"),
      parseError: vi.fn().mockReturnValue({ name: "CustomError", args: [] }),
    },
    runner: {
      provider: {
        getBlock: vi.fn().mockResolvedValue({ timestamp: NOW, number: 12345 }),
        getBlockNumber: vi.fn().mockResolvedValue(12345),
        getBalance: vi.fn().mockResolvedValue(ethers.parseEther("2.5")),
        call: vi.fn().mockRejectedValue(new Error("execution reverted: AlreadyCommitted")),
      },
    },
    getTenderDetails: vi.fn().mockImplementation(async (id) => {
      const found = mockTenders.find((t) => Number(t.id) === Number(id));
      return found || mockTenders[0];
    }),
    getTenderVerifiers: vi.fn().mockResolvedValue([VERIFIER1_ACCOUNT, VERIFIER2_ACCOUNT]),
    hasVerifierApproved: vi.fn().mockResolvedValue(false),
    getMilestones: vi.fn().mockResolvedValue(mockMilestones),
    getRevealedBids: vi.fn().mockImplementation(async (id) => {
      const tid = Number(id);
      const tender = mockTenders.find((t) => Number(t.id) === tid);
      if (tender && NOW <= Number(tender.revealDeadline)) {
        const err = new Error("execution reverted: BidsNotYetPublic");
        err.data = "0x85b6b756";
        throw err;
      }
      return mockRevealedBids;
    }),
    getCommitment: vi.fn().mockImplementation(async (id, account) => {
      const tid = Number(id);
      if (account?.toLowerCase() === BIDDER1_ACCOUNT.toLowerCase()) {
        if (tid === 1) {
          return { committed: false, revealed: false, bondClaimed: false, commitTime: 0 };
        }
        if (tid === 2) {
          return { committed: true, revealed: false, bondClaimed: false, commitTime: NOW - 1000 };
        }
        if (tid === 3) {
          return { committed: true, revealed: true, bondClaimed: false, commitTime: NOW - 2000 };
        }
        if (tid === 4) {
          return { committed: true, revealed: true, bondClaimed: false, commitTime: NOW - 3000 };
        }
        if (tid === 5) {
          return { committed: true, revealed: false, bondClaimed: false, commitTime: NOW - 4000 };
        }
      }
      return { committed: false, revealed: false, bondClaimed: false, commitTime: 0 };
    }),
    claimBondRefund,
    commitBid: vi.fn().mockResolvedValue({
      hash: "0xtx_commit_hash",
      wait: vi.fn().mockResolvedValue({ status: 1 }),
    }),
    revealBid: vi.fn().mockResolvedValue({
      hash: "0xtx_reveal_hash",
      wait: vi.fn().mockResolvedValue({ status: 1 }),
    }),
    submitMilestoneProof: vi.fn().mockResolvedValue({
      hash: "0xtx_proof_hash",
      wait: vi.fn().mockResolvedValue({ status: 1 }),
    }),
    withdrawPullBalance: vi.fn().mockResolvedValue({
      hash: "0xtx_withdraw_hash",
      wait: vi.fn().mockResolvedValue({ status: 1 }),
    }),
    createTender: vi.fn().mockResolvedValue({
      hash: "0xtx_create_tender_hash",
      wait: vi.fn().mockResolvedValue({ status: 1 }),
    }),
    finalizeAward: vi.fn().mockResolvedValue({
      hash: "0xtx_finalize_hash",
      wait: vi.fn().mockResolvedValue({ status: 1 }),
    }),
    fundEscrow: vi.fn().mockResolvedValue({
      hash: "0xtx_fund_escrow_hash",
      wait: vi.fn().mockResolvedValue({ status: 1 }),
    }),
    cancelTenderBeforeCommit: vi.fn().mockResolvedValue({
      hash: "0xtx_cancel_before_commit_hash",
      wait: vi.fn().mockResolvedValue({ status: 1 }),
    }),
    cancelTender: vi.fn().mockResolvedValue({
      hash: "0xtx_cancel_tender_hash",
      wait: vi.fn().mockResolvedValue({ status: 1 }),
    }),
    cancelIfFundingTimeout: vi.fn().mockResolvedValue({
      hash: "0xtx_cancel_timeout_hash",
      wait: vi.fn().mockResolvedValue({ status: 1 }),
    }),
    cancelUnfundedTender: vi.fn().mockResolvedValue({
      hash: "0xtx_cancel_unfunded_hash",
      wait: vi.fn().mockResolvedValue({ status: 1 }),
    }),
    claimDefault: vi.fn().mockResolvedValue({
      hash: "0xtx_claim_default_hash",
      wait: vi.fn().mockResolvedValue({ status: 1 }),
    }),
    declareDefault: vi.fn().mockResolvedValue({
      hash: "0xtx_declare_default_hash",
      wait: vi.fn().mockResolvedValue({ status: 1 }),
    }),
    approveMilestone: vi.fn().mockResolvedValue({
      hash: "0xtx_approve_milestone_hash",
      wait: vi.fn().mockResolvedValue({ status: 1 }),
    }),
    registerDepartment: vi.fn().mockResolvedValue({
      hash: "0xtx_reg_dept_hash",
      wait: vi.fn().mockResolvedValue({ status: 1 }),
    }),
    registerVerifier: vi.fn().mockResolvedValue({
      hash: "0xtx_reg_verifier_hash",
      wait: vi.fn().mockResolvedValue({ status: 1 }),
    }),
    registerBidder: vi.fn().mockResolvedValue({
      hash: "0xtx_reg_bidder_hash",
      wait: vi.fn().mockResolvedValue({ status: 1 }),
    }),
    debarBidder: vi.fn().mockResolvedValue({
      hash: "0xtx_debar_hash",
      wait: vi.fn().mockResolvedValue({ status: 1 }),
    }),
    ...overrides,
  };
}
