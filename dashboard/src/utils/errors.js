import { ethers } from "ethers";
import { OpenTenderABI } from "../config";

const iface = new ethers.Interface(OpenTenderABI);

const ERROR_TRANSLATIONS = {
  GroupConflictDetected: "Blocked: Another affiliate company from your corporate group has already submitted a bid on this tender.",
  BidsNotYetPublic: "Security Shield Active: Bid values are cryptographically sealed and cannot be accessed before the reveal deadline.",
  AlreadyCommitted: "Blocked: You have already submitted a sealed bid commitment for this tender.",
  CommitHashMismatch: "Reveal Rejected: Bid amount or secret salt does not match your original sealed commitment.",
  BidExceedsCeiling: "Bid Rejected: Your revealed bid exceeds the tender's maximum ceiling price.",
  CommitPhaseClosed: "Submission Closed: The commitment window has ended for this tender.",
  RevealPhaseNotActive: "Phase Inactive: The reveal phase is not currently open.",
  RevealPhaseNotEnded: "Cannot Finalize: The reveal phase has not ended yet.",
  EscrowWindowExpired: "Funding Expired: The Department's escrow funding window has elapsed.",
  EscrowWindowNotExpired: "Window Active: Escrow funding window is still active.",
  MilestoneNotPending: "Default Blocked: Contractor has already submitted milestone evidence and cannot be defaulted while awaiting verifier review.",
  MilestoneNotSubmitted: "Milestone has not yet been submitted by the contractor.",
  AlreadyApprovedMilestone: "Duplicate Review: You have already approved this milestone.",
  NotAuthorizedVerifier: "Unauthorized: Your wallet is not an assigned verifier for this tender.",
  InvalidBidBond: "Validation Error: Bid bond must be strictly greater than zero.",
  BidderNotRegistered: "Unauthorized: Wallet address is not registered in the bidder registry.",
  BidderIsDebarred: "Debarred: This wallet is officially debarred from participating in public tenders.",
  NotTenderDepartment: "Unauthorized: Only the designated procuring Department can execute this action.",
  NotWinningContractor: "Unauthorized: Only the awarded contractor can submit milestone completion evidence.",
  BondAlreadyClaimed: "Already Claimed: Your bid bond deposit has already been refunded.",
  BondNotRefundable: "Not Refundable: Bid bond is not currently eligible for refund.",
  NothingToWithdraw: "Balance Empty: No claimable pull-payment balance available for withdrawal.",
  NativeTransferFailed: "Transfer Failed: Contract attempted native token payout which was rejected.",
  AccessControlUnauthorizedAccount: "Unauthorized: Your wallet lacks the required administrative role for this operation."
};

export function parseContractError(error) {
  if (!error) return "An unknown error occurred.";

  // 1. Try parsing custom error data with interface
  try {
    let data = error?.data || error?.info?.error?.data || error?.error?.data;
    if (!data && typeof error?.message === "string") {
      const match = error.message.match(/0x[0-9a-fA-F]{8,}/);
      if (match) data = match[0];
    }
    if (!data && typeof error?.info?.error?.message === "string") {
      const match = error.info.error.message.match(/0x[0-9a-fA-F]{8,}/);
      if (match) data = match[0];
    }

    if (typeof data === "string" && data.startsWith("0x")) {
      const parsed = iface.parseError(data);
      if (parsed && ERROR_TRANSLATIONS[parsed.name]) {
        return ERROR_TRANSLATIONS[parsed.name];
      }
    }
  } catch {
    // Continue to substring matching
  }

  // 2. Substring matching for error names in string representation
  const rawMsg = [
    error.message,
    error.shortMessage,
    error.reason,
    error.info?.error?.message,
    error.toString?.(),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  for (const [key, msg] of Object.entries(ERROR_TRANSLATIONS)) {
    if (rawMsg.includes(key.toLowerCase())) {
      return msg;
    }
  }

  if (
    rawMsg.includes("user rejected") ||
    rawMsg.includes("action_rejected") ||
    rawMsg.includes("user denied") ||
    error?.code === 4001 ||
    error?.code === "ACTION_REJECTED"
  ) {
    return "Connection request was cancelled in your wallet.";
  }

  if (rawMsg.includes("insufficient funds")) {
    return "Insufficient balance in wallet to cover required deposit and gas fees.";
  }

  if (rawMsg.includes("missing revert data")) {
    return "Transaction simulation failed. The bidding deadline may have passed or the contract conditions were not met.";
  }

  return error.reason || error.shortMessage || error.message || "Transaction reverted on-chain.";
}
