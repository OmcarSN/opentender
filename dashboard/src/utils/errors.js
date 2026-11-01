import { ethers } from "ethers";
import { OpenTenderABI } from "../config";

const iface = new ethers.Interface(OpenTenderABI);

export const ERROR_TRANSLATIONS = {
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

/**
 * Robust error decoder for OpenTender transactions and wallet operations
 * @param {any} error The error thrown by ethers or wallet provider
 * @param {"transaction"|"connection"|"general"} [context="general"]
 * @returns {string} User-friendly error message
 */
export function parseContractError(error, context = "general") {
  if (!error) return "An unknown error occurred.";

  // 1. Try parsing custom error data with contract interface
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
    // Continue to fallback checks
  }

  // 2. Substring matching for custom error names in string representation
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

  // 3. User cancellation / rejection
  if (
    rawMsg.includes("user rejected") ||
    rawMsg.includes("action_rejected") ||
    rawMsg.includes("user denied") ||
    rawMsg.includes("rejected by user") ||
    error?.code === 4001 ||
    error?.code === "ACTION_REJECTED"
  ) {
    if (context === "connection" || rawMsg.includes("requestaccounts") || rawMsg.includes("connect")) {
      return "Connection request was cancelled in your wallet.";
    }
    return "Transaction signature was cancelled in your wallet.";
  }

  // 4. Pending request already in progress
  if (error?.code === -32002 || rawMsg.includes("already pending")) {
    return "A request is already pending in your wallet extension. Please open BridgeKey Wallet to approve or reject it.";
  }

  // 5. Wallet locked / account unavailable
  if (error?.code === 4100 || rawMsg.includes("locked") || rawMsg.includes("unlock")) {
    return "Your wallet is currently locked. Please unlock BridgeKey Wallet and try again.";
  }

  // 6. Insufficient balance for value + gas
  if (rawMsg.includes("insufficient funds") || rawMsg.includes("exceeds balance")) {
    return "Insufficient balance in your wallet to cover required deposit and gas fees.";
  }

  // 7. Wrong network
  if (rawMsg.includes("wrong network") || rawMsg.includes("chain mismatch") || rawMsg.includes("chain_mismatch")) {
    return "Your wallet is on the wrong network. Please switch to MST Testnet.";
  }

  // 8. Timeout
  if (rawMsg.includes("timed out") || rawMsg.includes("timeout")) {
    return "Operation timed out. Please check your wallet or explorer before retrying.";
  }

  // 9. Revert data missing / simulation failure
  if (rawMsg.includes("missing revert data")) {
    return "Transaction simulation failed. The bidding deadline may have passed or the contract conditions were not met.";
  }

  // 10. Nonce or replacement error
  if (rawMsg.includes("replacement fee too low") || rawMsg.includes("nonce too low")) {
    return "Transaction was replaced or cancelled in your wallet with a conflicting nonce.";
  }

  return error.reason || error.shortMessage || error.message || "Transaction reverted on-chain.";
}
