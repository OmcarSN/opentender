import React, { useState, useMemo } from "react";
import { ethers } from "ethers";
import { CURRENCY_SYMBOL, CHAIN_ID, getReadOnlyContract } from "../config";
import { parseContractError } from "../utils/errors";

const STATUS_NAMES = [
  "Draft / None",
  "Open (Commit / Reveal)",
  "Awarded (Pending Escrow)",
  "Funded (Milestone Execution)",
  "Completed",
  "Defaulted",
  "Cancelled",
  "Failed"
];

function getStatusBadgeClass(status) {
  switch (status) {
    case 1:
      return "badge-commit";
    case 2:
      return "badge-awarded";
    case 3:
      return "badge-funded";
    case 4:
      return "badge-completed";
    case 5:
      return "badge-defaulted";
    case 6:
      return "badge-cancelled";
    case 7:
      return "badge-failed";
    default:
      return "badge-secondary";
  }
}

export default function OfficerTab({
  account,
  roles,
  signerContract,
  tenders = [],
  selectedTenderId,
  selectedTenderDetails,
  onRefresh,
  setNotification,
  isDataLoading = false,
  dataLoadError = null,
  chainId = null,
  latestBlockTimestamp = 0
}) {
  const isWrongNetwork = chainId !== null && chainId !== CHAIN_ID;
  const currentBlockTime = latestBlockTimestamp > 0 ? latestBlockTimestamp : Math.floor(Date.now() / 1000);

  // Submitting tracker
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Department: Create Tender Form State
  const [ceilingPrice, setCeilingPrice] = useState("50");
  const [bidBond, setBidBond] = useState("2");
  const [commitMins, setCommitMins] = useState("3");
  const [revealMins, setRevealMins] = useState("3");
  const [escrowHours, setEscrowHours] = useState("1");
  const [graceHours, setGraceHours] = useState("24");
  const [penaltyBps, setPenaltyBps] = useState("200");
  const [docHash, setDocHash] = useState("MST_BUILDATHON_PROCUREMENT_V1");
  const [verifiersText, setVerifiersText] = useState(
    "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC, 0x90F79bf6EB2c4f870365E785982E1f101E93b906"
  );
  const [threshold, setThreshold] = useState("2");

  // Lifecycle control state
  const [actionTenderId, setActionTenderId] = useState(() => {
    if (selectedTenderId) return Number(selectedTenderId);
    if (tenders.length > 0) return Number(tenders[0].id);
    return "";
  });
  const [cancelReason, setCancelReason] = useState("Budget re-allocation");

  // Verifier state
  const fundedTenders = useMemo(() => tenders.filter((t) => t.status === 3), [tenders]);
  const [verifyTenderId, setVerifyTenderId] = useState(() => {
    if (fundedTenders.length > 0) return Number(fundedTenders[0].id);
    return "";
  });
  const [verifyMilestoneIdx, setVerifyMilestoneIdx] = useState(0);

  // Registrar state
  const [regDeptAddress, setRegDeptAddress] = useState("");
  const [regVerifierAddress, setRegVerifierAddress] = useState("");
  const [regBidderAddress, setRegBidderAddress] = useState("");
  const [regIdentityId, setRegIdentityId] = useState("PAN_MOCK_CORP_01");
  const [regGroupId, setRegGroupId] = useState("GROUP_ALPHA");
  const [debarAddress, setDebarAddress] = useState("");
  const [debarReason, setDebarReason] = useState("Violation of procurement compliance");

  // Selected Action Tender resolution
  const selectedActionTender = useMemo(() => {
    if (!actionTenderId) return null;
    return tenders.find((t) => Number(t.id) === Number(actionTenderId)) || null;
  }, [actionTenderId, tenders]);

  // Selected Verify Tender resolution
  const selectedVerifyTender = useMemo(() => {
    if (!verifyTenderId) return null;
    return tenders.find((t) => Number(t.id) === Number(verifyTenderId)) || null;
  }, [verifyTenderId, tenders]);

  // Authorization flags
  const isDeptRole = Boolean(roles?.isDepartment);
  const isVerifierRole = Boolean(roles?.isVerifier);
  const isRegistrarRole = Boolean(roles?.isRegistrar);
  const isTenderDepartment = Boolean(
    account &&
      selectedActionTender?.department &&
      account.toLowerCase() === selectedActionTender.department.toLowerCase()
  );

  // ==========================================================================
  // Form Validations: Create Tender
  // ==========================================================================
  const parsedCeiling = parseFloat(ceilingPrice);
  const isCeilingValid = !isNaN(parsedCeiling) && parsedCeiling > 0;

  const parsedBidBond = parseFloat(bidBond);
  const isBidBondValid = !isNaN(parsedBidBond) && parsedBidBond > 0;

  const parsedCommitMins = parseInt(commitMins, 10);
  const isCommitMinsValid = !isNaN(parsedCommitMins) && parsedCommitMins >= 1;

  const parsedRevealMins = parseInt(revealMins, 10);
  const isRevealMinsValid = !isNaN(parsedRevealMins) && parsedRevealMins >= 1;

  const parsedEscrowHours = parseInt(escrowHours, 10);
  const isEscrowHoursValid = !isNaN(parsedEscrowHours) && parsedEscrowHours >= 1;

  const parsedGraceHours = parseInt(graceHours, 10);
  const isGraceHoursValid = !isNaN(parsedGraceHours) && parsedGraceHours >= 1;

  const parsedPenaltyBps = parseInt(penaltyBps, 10);
  const isPenaltyBpsValid = !isNaN(parsedPenaltyBps) && parsedPenaltyBps >= 0 && parsedPenaltyBps <= 1000;

  const isDocHashValid = docHash.trim().length > 0;

  // Verifier addresses validation
  const { verifierAddresses, invalidVerifierTokens, hasDuplicateVerifiers } = useMemo(() => {
    const rawTokens = verifiersText
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const validAddrs = [];
    const invalidTokens = [];
    const seen = new Set();
    let duplicateFound = false;

    for (const token of rawTokens) {
      if (ethers.isAddress(token)) {
        const lower = token.toLowerCase();
        if (seen.has(lower)) {
          duplicateFound = true;
        } else {
          seen.add(lower);
          validAddrs.push(token);
        }
      } else {
        invalidTokens.push(token);
      }
    }

    return {
      verifierAddresses: validAddrs,
      invalidVerifierTokens: invalidTokens,
      hasDuplicateVerifiers: duplicateFound
    };
  }, [verifiersText]);

  const isVerifiersValid =
    verifierAddresses.length > 0 &&
    invalidVerifierTokens.length === 0 &&
    !hasDuplicateVerifiers;

  const parsedThreshold = parseInt(threshold, 10);
  const isThresholdValid =
    !isNaN(parsedThreshold) &&
    parsedThreshold >= 1 &&
    parsedThreshold <= verifierAddresses.length;

  const isCreateTenderValid =
    isCeilingValid &&
    isBidBondValid &&
    isCommitMinsValid &&
    isRevealMinsValid &&
    isEscrowHoursValid &&
    isGraceHoursValid &&
    isPenaltyBpsValid &&
    isDocHashValid &&
    isVerifiersValid &&
    isThresholdValid;

  // ==========================================================================
  // Form Validations: Registrar
  // ==========================================================================
  const isRegDeptValid = regDeptAddress.trim().length > 0 && ethers.isAddress(regDeptAddress.trim());
  const isRegVerifierValid = regVerifierAddress.trim().length > 0 && ethers.isAddress(regVerifierAddress.trim());
  const isRegBidderAddrValid = regBidderAddress.trim().length > 0 && ethers.isAddress(regBidderAddress.trim());
  const isRegGroupValid = regGroupId.trim().length > 0;
  const isRegIdentityValid = regIdentityId.trim().length > 0;
  const isRegBidderFormValid = isRegBidderAddrValid && isRegGroupValid && isRegIdentityValid;

  const isDebarAddrValid = debarAddress.trim().length > 0 && ethers.isAddress(debarAddress.trim());
  const isDebarReasonValid = debarReason.trim().length > 0;
  const isDebarFormValid = isDebarAddrValid && isDebarReasonValid;

  // ==========================================================================
  // Lifecycle Action Availability Helpers
  // ==========================================================================
  const finalizeEligibility = useMemo(() => {
    if (!selectedActionTender) {
      return { allowed: false, reason: "Select a target tender first" };
    }
    if (selectedActionTender.status !== 1) {
      return {
        allowed: false,
        reason: `Tender is in status ${STATUS_NAMES[selectedActionTender.status] || selectedActionTender.status}. Only Open tenders can be finalized.`
      };
    }
    if (currentBlockTime <= selectedActionTender.revealDeadline) {
      const waitSec = selectedActionTender.revealDeadline - currentBlockTime;
      const waitMin = Math.ceil(waitSec / 60);
      return {
        allowed: false,
        reason: `Reveal phase is currently active (~${waitMin}m remaining). Finalization unlocks after reveal deadline.`
      };
    }
    return {
      allowed: true,
      reason: "Reveal deadline has ended. Award finalization is ready to execute."
    };
  }, [selectedActionTender, currentBlockTime]);

  const fundEscrowEligibility = useMemo(() => {
    if (!selectedActionTender) {
      return { allowed: false, reason: "Select a target tender first" };
    }
    if (selectedActionTender.status !== 2) {
      return {
        allowed: false,
        reason: `Tender must be in Awarded status to fund escrow (currently ${STATUS_NAMES[selectedActionTender.status] || selectedActionTender.status}).`
      };
    }
    if (selectedActionTender.escrowDeadline && currentBlockTime > selectedActionTender.escrowDeadline) {
      return {
        allowed: false,
        reason: "Escrow funding window has expired on-chain."
      };
    }
    if (!isTenderDepartment) {
      return {
        allowed: false,
        reason: "Only the issuing Department wallet can fund contract escrow."
      };
    }
    return {
      allowed: true,
      reason: `Ready to fund winning price (${ethers.formatEther(selectedActionTender.winningAmount || 0n)} ${CURRENCY_SYMBOL}) into escrow.`
    };
  }, [selectedActionTender, currentBlockTime, isTenderDepartment]);

  const cancelEligibility = useMemo(() => {
    if (!selectedActionTender) {
      return { allowed: false, reason: "Select a target tender first" };
    }
    if (selectedActionTender.status !== 1) {
      return {
        allowed: false,
        reason: `Only Open tenders can be cancelled (currently ${STATUS_NAMES[selectedActionTender.status] || selectedActionTender.status}).`
      };
    }
    if (currentBlockTime > selectedActionTender.commitDeadline) {
      return {
        allowed: false,
        reason: "Commit deadline has passed; cancellation is closed on-chain."
      };
    }
    if (!isTenderDepartment) {
      return {
        allowed: false,
        reason: "Only the publishing Department wallet can cancel this tender."
      };
    }
    if (cancelReason.trim().length === 0) {
      return {
        allowed: false,
        reason: "Cancellation reason must not be empty."
      };
    }
    return {
      allowed: true,
      reason: "Within pre-commit window. Cancellation will unlock all committed bonds for refund."
    };
  }, [selectedActionTender, currentBlockTime, isTenderDepartment, cancelReason]);

  const defaultEligibility = useMemo(() => {
    if (!selectedActionTender) {
      return { allowed: false, reason: "Select a target tender first" };
    }
    if (selectedActionTender.status !== 3) {
      return {
        allowed: false,
        reason: `Only Funded tenders in active execution can default (currently ${STATUS_NAMES[selectedActionTender.status] || selectedActionTender.status}).`
      };
    }
    return {
      allowed: true,
      reason: "Enforces default if pending milestone passes due date + grace period. Performance bond forfeited, remaining escrow recovered."
    };
  }, [selectedActionTender]);

  // ==========================================================================
  // Milestone Verification Availability
  // ==========================================================================
  const isMilestoneIdxValid =
    !isNaN(verifyMilestoneIdx) && parseInt(verifyMilestoneIdx, 10) >= 0;

  const isVerifierActionAllowed =
    Boolean(selectedVerifyTender) &&
    selectedVerifyTender.status === 3 &&
    isMilestoneIdxValid &&
    isVerifierRole;

  // Pre-fill demo values (Never triggers a transaction automatically)
  function handleFillDemo() {
    setCeilingPrice("50");
    setBidBond("2");
    setCommitMins("3");
    setRevealMins("3");
    setEscrowHours("1");
    setGraceHours("24");
    setPenaltyBps("200");
    setDocHash("LIVE_BUILDATHON_DEMO_SPEC");
    setVerifiersText(
      "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC, 0x90F79bf6EB2c4f870365E785982E1f101E93b906"
    );
    setThreshold("2");
  }

  // ==========================================================================
  // Transaction Handlers (Preserved Handlers)
  // ==========================================================================
  async function handleCreateTender(e) {
    e.preventDefault();
    if (!signerContract || !isCreateTenderValid || isSubmitting) return;

    try {
      setIsSubmitting(true);
      setNotification({ active: true, title: "Creating New Tender On-Chain..." });

      const latestBlock = await signerContract.runner.provider.getBlock("latest").catch(() => null);
      const now = latestBlock ? Number(latestBlock.timestamp) : Math.floor(Date.now() / 1000);
      const commitDeadline = now + parsedCommitMins * 60;
      const revealDeadline = commitDeadline + parsedRevealMins * 60;
      const escrowWindow = parsedEscrowHours * 3600;
      const gracePeriod = parsedGraceHours * 3600;

      // Default to 2 milestones: 50% and 50%
      const milestones = [
        { percentageBps: 5000, dueDate: revealDeadline + 86400 * 5 },
        { percentageBps: 5000, dueDate: revealDeadline + 86400 * 10 }
      ];

      const documentHash =
        docHash.startsWith("0x") && docHash.length === 66
          ? docHash
          : ethers.id(docHash.trim());

      const tx = await signerContract.createTender(
        ethers.parseEther(ceilingPrice),
        ethers.parseEther(bidBond),
        commitDeadline,
        revealDeadline,
        escrowWindow,
        gracePeriod,
        parsedPenaltyBps,
        documentHash,
        milestones,
        verifierAddresses,
        parsedThreshold
      );

      setNotification({ active: true, title: "Mining Tender Creation...", hash: tx.hash });
      await tx.wait();

      setNotification({
        active: false,
        hash: tx.hash,
        title: "Tender Created Successfully!",
        success: "Tender specification has been published. Sealed bid commit phase is now active."
      });
      onRefresh();
    } catch (err) {
      const msg = parseContractError(err);
      setNotification({ active: false, title: "Tender Creation Failed", error: msg });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleFinalizeAward() {
    if (!signerContract || !finalizeEligibility.allowed || isSubmitting) return;
    try {
      setIsSubmitting(true);
      setNotification({ active: true, title: `Finalizing Award for Tender #${actionTenderId}...` });
      const tx = await signerContract.finalizeAward(actionTenderId);
      setNotification({ active: true, title: "Confirming award...", hash: tx.hash });
      await tx.wait();
      setNotification({
        active: false,
        hash: tx.hash,
        title: "Tender Finalized & Awarded",
        success: "Winning bidder determined. Non-reveal bonds forfeited to Department pull balance."
      });
      onRefresh();
    } catch (err) {
      const msg = parseContractError(err);
      setNotification({ active: false, title: "Finalization Failed", error: msg });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleFundEscrow() {
    if (!signerContract || !fundEscrowEligibility.allowed || isSubmitting) return;
    try {
      setIsSubmitting(true);
      setNotification({ active: true, title: `Funding Escrow for Tender #${actionTenderId}...` });
      const details = await getReadOnlyContract().getTenderDetails(actionTenderId);
      const winningAmount = details.winningAmount;

      const tx = await signerContract.fundEscrow(actionTenderId, { value: winningAmount });
      setNotification({ active: true, title: "Locking funds in escrow...", hash: tx.hash });
      await tx.wait();
      setNotification({
        active: false,
        hash: tx.hash,
        title: "Escrow Funded!",
        success: `Successfully funded ${ethers.formatEther(winningAmount)} ${CURRENCY_SYMBOL} into smart contract escrow.`
      });
      onRefresh();
    } catch (err) {
      const msg = parseContractError(err);
      setNotification({ active: false, title: "Escrow Funding Failed", error: msg });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCancelTender() {
    if (!signerContract || !cancelEligibility.allowed || isSubmitting) return;
    try {
      setIsSubmitting(true);
      setNotification({ active: true, title: `Cancelling Tender #${actionTenderId}...` });
      const tx = await signerContract.cancelTender(actionTenderId, cancelReason);
      setNotification({ active: true, title: "Confirming cancellation...", hash: tx.hash });
      await tx.wait();
      setNotification({
        active: false,
        hash: tx.hash,
        title: "Tender Cancelled",
        success: "Tender cancelled. Committed bid bonds are now unlocked for pull refund."
      });
      onRefresh();
    } catch (err) {
      const msg = parseContractError(err);
      setNotification({ active: false, title: "Cancellation Failed", error: msg });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDeclareDefault() {
    if (!signerContract || !defaultEligibility.allowed || isSubmitting) return;
    try {
      setIsSubmitting(true);
      setNotification({ active: true, title: `Declaring Default on Tender #${actionTenderId}...` });
      const tx = await signerContract.declareDefault(actionTenderId);
      setNotification({ active: true, title: "Executing default...", hash: tx.hash });
      await tx.wait();
      setNotification({
        active: false,
        hash: tx.hash,
        title: "Contractor Default Declared",
        success: "Performance bond forfeited, remaining escrow recovered, contractor debarred."
      });
      onRefresh();
    } catch (err) {
      const msg = parseContractError(err);
      setNotification({ active: false, title: "Default Declaration Failed", error: msg });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleApproveMilestone() {
    if (!signerContract || !isVerifierActionAllowed || isSubmitting) return;
    try {
      setIsSubmitting(true);
      setNotification({
        active: true,
        title: `Signing Off Milestone #${verifyMilestoneIdx} for Tender #${verifyTenderId}...`
      });
      const tx = await signerContract.approveMilestone(verifyTenderId, parseInt(verifyMilestoneIdx, 10));
      setNotification({ active: true, title: "Recording verification...", hash: tx.hash });
      await tx.wait();
      setNotification({
        active: false,
        hash: tx.hash,
        title: "Milestone Approved!",
        success: "Your verifier sign-off was registered. If threshold was met, funds were automatically released."
      });
      onRefresh();
    } catch (err) {
      const msg = parseContractError(err);
      setNotification({ active: false, title: "Milestone Approval Failed", error: msg });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRegisterDepartment() {
    if (!signerContract || !isRegDeptValid || isSubmitting) return;
    try {
      setIsSubmitting(true);
      setNotification({ active: true, title: "Granting DEPARTMENT_ROLE..." });
      const tx = await signerContract.registerDepartment(regDeptAddress.trim());
      await tx.wait();
      setNotification({
        active: false,
        title: "Department Registered",
        success: `Granted DEPARTMENT_ROLE to ${regDeptAddress.trim()}`
      });
      setRegDeptAddress("");
      onRefresh();
    } catch (err) {
      setNotification({ active: false, title: "Registration Failed", error: parseContractError(err) });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRegisterVerifier() {
    if (!signerContract || !isRegVerifierValid || isSubmitting) return;
    try {
      setIsSubmitting(true);
      setNotification({ active: true, title: "Granting VERIFIER_ROLE..." });
      const tx = await signerContract.registerVerifier(regVerifierAddress.trim());
      await tx.wait();
      setNotification({
        active: false,
        title: "Verifier Registered",
        success: `Granted VERIFIER_ROLE to ${regVerifierAddress.trim()}`
      });
      setRegVerifierAddress("");
      onRefresh();
    } catch (err) {
      setNotification({ active: false, title: "Registration Failed", error: parseContractError(err) });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRegisterBidder() {
    if (!signerContract || !isRegBidderFormValid || isSubmitting) return;
    try {
      setIsSubmitting(true);
      setNotification({ active: true, title: "Registering Bidder Credentials..." });
      const tx = await signerContract.registerBidder(
        regBidderAddress.trim(),
        ethers.id(regIdentityId.trim()),
        ethers.id(regGroupId.trim())
      );
      await tx.wait();
      setNotification({
        active: false,
        title: "Bidder Registered",
        success: `Bidder ${regBidderAddress.trim()} registered with Group ID: ${regGroupId.trim()}`
      });
      setRegBidderAddress("");
      onRefresh();
    } catch (err) {
      setNotification({ active: false, title: "Registration Failed", error: parseContractError(err) });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDebarBidder() {
    if (!signerContract || !isDebarFormValid || isSubmitting) return;
    try {
      setIsSubmitting(true);
      setNotification({ active: true, title: "Debarring Bidder..." });
      const tx = await signerContract.debarBidder(debarAddress.trim(), debarReason.trim());
      await tx.wait();
      setNotification({
        active: false,
        title: "Bidder Debarred",
        success: `Wallet ${debarAddress.trim()} is now formally debarred from tender participation.`
      });
      setDebarAddress("");
      onRefresh();
    } catch (err) {
      setNotification({ active: false, title: "Debarment Failed", error: parseContractError(err) });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="tab-pane officer-tab">
      <div className="officer-grid">
        {/* ================================================================= */}
        {/* Panel 1: Department: Create Tender                                */}
        {/* ================================================================= */}
        <div className="panel">
          <div className="panel-header">
            <div>
              <h3>Publish Public Tender</h3>
              <p className="field-hint" style={{ marginTop: "0.2rem" }}>
                Define procurement specifications, ceiling price, and multi-verifier escrow quorum.
              </p>
            </div>
            <button
              type="button"
              className="btn-mini btn-secondary"
              onClick={handleFillDemo}
              title="Populate testnet parameters without submitting"
            >
              Fill Demo Values
            </button>
          </div>

          {!isDeptRole && (
            <div className="portal-alert warning" style={{ margin: "1rem 0" }}>
              <span className="portal-alert-icon">⚠️</span>
              <div>
                <strong>Department Role Required</strong>
                <p>
                  {account ? (
                    <>
                      Connected wallet <code>{`${account.slice(0, 6)}...${account.slice(-4)}`}</code> does not hold{" "}
                      <code>DEPARTMENT_ROLE</code> on-chain. Tender creation will revert unless authorized.
                    </>
                  ) : (
                    <>
                      No wallet connected. Publishing a tender requires a wallet authorized with{" "}
                      <code>DEPARTMENT_ROLE</code>.
                    </>
                  )}
                </p>
              </div>
            </div>
          )}

          <form onSubmit={handleCreateTender} className="form-card">
            <div className="form-row">
              <div className="form-group col-half">
                <label>Ceiling Price ({CURRENCY_SYMBOL})</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={ceilingPrice}
                  onChange={(e) => setCeilingPrice(e.target.value)}
                  placeholder="e.g. 50"
                  required
                />
                {!isCeilingValid && (
                  <div className="field-validation-error">Ceiling price must be greater than 0.</div>
                )}
              </div>
              <div className="form-group col-half">
                <label>Bid Bond Deposit ({CURRENCY_SYMBOL})</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={bidBond}
                  onChange={(e) => setBidBond(e.target.value)}
                  placeholder="e.g. 2"
                  required
                />
                {!isBidBondValid && (
                  <div className="field-validation-error">Bid bond must be greater than 0.</div>
                )}
              </div>
            </div>

            <div className="form-row">
              <div className="form-group col-half">
                <label>Commit Duration (Minutes)</label>
                <input
                  type="number"
                  min="1"
                  value={commitMins}
                  onChange={(e) => setCommitMins(e.target.value)}
                  placeholder="e.g. 3"
                  required
                />
                {!isCommitMinsValid && (
                  <div className="field-validation-error">Commit duration must be at least 1 minute.</div>
                )}
              </div>
              <div className="form-group col-half">
                <label>Reveal Duration (Minutes)</label>
                <input
                  type="number"
                  min="1"
                  value={revealMins}
                  onChange={(e) => setRevealMins(e.target.value)}
                  placeholder="e.g. 3"
                  required
                />
                {!isRevealMinsValid && (
                  <div className="field-validation-error">Reveal duration must be at least 1 minute.</div>
                )}
              </div>
            </div>

            <div className="form-row">
              <div className="form-group col-half">
                <label>Escrow Window (Hours)</label>
                <input
                  type="number"
                  min="1"
                  value={escrowHours}
                  onChange={(e) => setEscrowHours(e.target.value)}
                  placeholder="e.g. 1"
                  required
                />
                {!isEscrowHoursValid && (
                  <div className="field-validation-error">Escrow window must be at least 1 hour.</div>
                )}
              </div>
              <div className="form-group col-half">
                <label>Grace Period (Hours)</label>
                <input
                  type="number"
                  min="1"
                  value={graceHours}
                  onChange={(e) => setGraceHours(e.target.value)}
                  placeholder="e.g. 24"
                  required
                />
                {!isGraceHoursValid && (
                  <div className="field-validation-error">Grace period must be at least 1 hour.</div>
                )}
              </div>
            </div>

            <div className="form-group">
              <label>Daily Penalty (BPS: 200 = 2%/day)</label>
              <input
                type="number"
                min="0"
                max="1000"
                value={penaltyBps}
                onChange={(e) => setPenaltyBps(e.target.value)}
                placeholder="0 - 1000"
                required
              />
              <div className="field-hint">
                Late delivery deduction: 100 BPS = 1% per full day late (contract maximum: 1000 BPS / 10% daily).
              </div>
              {!isPenaltyBpsValid && (
                <div className="field-validation-error">
                  Penalty rate must be between 0 and 1000 BPS (0% - 10%/day).
                </div>
              )}
            </div>

            <div className="form-group">
              <label>Specification Dossier Hash / Title</label>
              <input
                type="text"
                value={docHash}
                onChange={(e) => setDocHash(e.target.value)}
                placeholder="e.g. MST_BUILDATHON_PROCUREMENT_V1 or 0x..."
                required
              />
              <div className="field-hint">
                Plaintext titles are automatically hashed via keccak256 into a canonical bytes32 digest.
              </div>
              {!isDocHashValid && (
                <div className="field-validation-error">Document hash or title is required.</div>
              )}
            </div>

            <div className="form-group">
              <label>Authorized Verifiers (Comma-Separated Addresses)</label>
              <textarea
                rows="2"
                value={verifiersText}
                onChange={(e) => setVerifiersText(e.target.value)}
                placeholder="0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC, 0x90F79bf6EB2c4f870365E785982E1f101E93b906"
                required
              />
              <div className="field-hint">
                {verifierAddresses.length > 0 ? (
                  <span>
                    ✓ {verifierAddresses.length} valid verifier address{verifierAddresses.length > 1 ? "es" : ""}{" "}
                    parsed
                  </span>
                ) : (
                  <span>Enter valid 42-character 0x Ethereum addresses.</span>
                )}
              </div>
              {invalidVerifierTokens.length > 0 && (
                <div className="field-validation-error">
                  Invalid address format: <code>{invalidVerifierTokens.join(", ")}</code>
                </div>
              )}
              {hasDuplicateVerifiers && (
                <div className="field-validation-error">Duplicate verifier addresses are not permitted.</div>
              )}
            </div>

            <div className="form-group">
              <label>Approval Threshold (M-of-N)</label>
              <input
                type="number"
                min="1"
                max={Math.max(1, verifierAddresses.length)}
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                placeholder="1"
                required
              />
              <div className="field-hint">
                Requires at least {threshold || 1} out of {verifierAddresses.length || 0} verifiers to sign off
                before milestone escrow payout releases.
              </div>
              {!isThresholdValid && (
                <div className="field-validation-error">
                  Threshold must be between 1 and the number of valid verifiers ({verifierAddresses.length}).
                </div>
              )}
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-block"
              disabled={isSubmitting || !isCreateTenderValid}
            >
              {isSubmitting ? "Publishing Tender On-Chain..." : "Publish Public Tender"}
            </button>
          </form>
        </div>

        {/* ================================================================= */}
        {/* Panel 2: Department: Tender Lifecycle Execution                   */}
        {/* ================================================================= */}
        <div className="panel">
          <div className="panel-header">
            <div>
              <h3>Tender Lifecycle Management</h3>
              <p className="field-hint" style={{ marginTop: "0.2rem" }}>
                Enforce award finalization, escrow lockup, cancellation, and contractor default.
              </p>
            </div>
            <span className="badge badge-dept">Department Role</span>
          </div>

          <div className="form-card">
            <div className="form-group">
              <label>Select Target Tender</label>
              <select
                value={actionTenderId}
                onChange={(e) => setActionTenderId(e.target.value ? Number(e.target.value) : "")}
                disabled={isDataLoading || isWrongNetwork || tenders.length === 0}
              >
                {isDataLoading && <option value="">⏳ Loading on-chain tenders from network...</option>}
                {dataLoadError && <option value="">⚠️ Network read error: could not fetch tenders</option>}
                {isWrongNetwork && <option value="">⚠️ Wrong network: connect to correct chain</option>}
                {!isDataLoading && !dataLoadError && !isWrongNetwork && tenders.length === 0 && (
                  <option value="">No tenders published on this network yet</option>
                )}
                {!isDataLoading && !dataLoadError && !isWrongNetwork && tenders.length > 0 && (
                  <>
                    <option value="">-- Select Target Tender --</option>
                    {tenders.map((t) => (
                      <option key={t.id} value={t.id}>
                        Tender #{t.id} ({STATUS_NAMES[t.status] || `Status ${t.status}`})
                      </option>
                    ))}
                  </>
                )}
              </select>
            </div>

            {/* Target Tender Summary Box */}
            {selectedActionTender ? (
              <div className="tender-summary-box">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <strong>Tender #{selectedActionTender.id} Overview</strong>
                  <span className={`badge ${getStatusBadgeClass(selectedActionTender.status)}`}>
                    {STATUS_NAMES[selectedActionTender.status] || `Status ${selectedActionTender.status}`}
                  </span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.4rem", marginTop: "0.25rem" }}>
                  <div>
                    <span style={{ color: "var(--text-muted)" }}>Dept: </span>
                    <code style={{ fontSize: "0.75rem" }}>
                      {selectedActionTender.department
                        ? `${selectedActionTender.department.slice(0, 6)}...${selectedActionTender.department.slice(-4)}`
                        : "--"}
                    </code>
                    {isTenderDepartment && (
                      <span className="field-validation-success" style={{ marginLeft: "0.3rem", fontSize: "0.7rem" }}>
                        (You)
                      </span>
                    )}
                  </div>
                  <div>
                    <span style={{ color: "var(--text-muted)" }}>Ceiling: </span>
                    <span>
                      {ethers.formatEther(selectedActionTender.ceilingPrice || 0n)} {CURRENCY_SYMBOL}
                    </span>
                  </div>
                  {selectedActionTender.winningBidder && selectedActionTender.winningBidder !== ethers.ZeroAddress && (
                    <div style={{ gridColumn: "span 2" }}>
                      <span style={{ color: "var(--text-muted)" }}>Winning Bidder: </span>
                      <code style={{ fontSize: "0.75rem" }}>{selectedActionTender.winningBidder}</code>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="field-status-box" style={{ marginBottom: "0.75rem" }}>
                <span className="status-indicator-dot pending"></span>
                <span>Please select a target tender above to evaluate lifecycle action availability.</span>
              </div>
            )}

            <div className="lifecycle-actions-stack">
              {/* Finalize Award */}
              <div className="action-row">
                <div className="action-row-content">
                  <strong>Finalize Award</strong>
                  <p className="field-hint">
                    Evaluates lowest valid bid, assigns contractor, and forfeits unrevealed bonds to Department pull balance.
                  </p>
                  <div
                    className={finalizeEligibility.allowed ? "field-validation-success" : "field-hint"}
                    style={{ marginTop: "0.3rem", fontSize: "0.75rem" }}
                  >
                    {finalizeEligibility.allowed ? `✓ ${finalizeEligibility.reason}` : `ℹ️ ${finalizeEligibility.reason}`}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-outline action-row-btn"
                  onClick={handleFinalizeAward}
                  disabled={isSubmitting || !finalizeEligibility.allowed}
                >
                  Finalize Award
                </button>
              </div>

              {/* Fund Escrow */}
              <div className="action-row">
                <div className="action-row-content">
                  <strong>Fund Contract Escrow</strong>
                  <p className="field-hint">
                    Transfers winning tender price from Department wallet into smart contract milestone escrow.
                  </p>
                  <div
                    className={fundEscrowEligibility.allowed ? "field-validation-success" : "field-hint"}
                    style={{ marginTop: "0.3rem", fontSize: "0.75rem" }}
                  >
                    {fundEscrowEligibility.allowed
                      ? `✓ ${fundEscrowEligibility.reason}`
                      : `ℹ️ ${fundEscrowEligibility.reason}`}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-primary action-row-btn"
                  onClick={handleFundEscrow}
                  disabled={isSubmitting || !fundEscrowEligibility.allowed}
                >
                  Fund Escrow
                </button>
              </div>

              {/* Cancel Tender */}
              <div className="action-row" style={{ flexDirection: "column", alignItems: "stretch" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem" }}>
                  <div className="action-row-content">
                    <strong>Cancel Tender (Pre-Commit Deadline)</strong>
                    <p className="field-hint">
                      Cancels tender before sealed bid commit deadline. Unlocks all committed bid bonds for pull refund.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-warning action-row-btn"
                    onClick={handleCancelTender}
                    disabled={isSubmitting || !cancelEligibility.allowed}
                  >
                    Cancel Tender
                  </button>
                </div>
                <div style={{ marginTop: "0.5rem" }}>
                  <input
                    type="text"
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    placeholder="Public reason for cancellation (required)"
                    style={{ width: "100%", fontSize: "0.82rem" }}
                  />
                  <div
                    className={cancelEligibility.allowed ? "field-validation-success" : "field-hint"}
                    style={{ marginTop: "0.3rem", fontSize: "0.75rem" }}
                  >
                    {cancelEligibility.allowed ? `✓ ${cancelEligibility.reason}` : `ℹ️ ${cancelEligibility.reason}`}
                  </div>
                </div>
              </div>

              {/* Declare Default */}
              <div className="action-row">
                <div className="action-row-content">
                  <strong>Declare Contractor Default</strong>
                  <p className="field-hint">
                    Enforces default if pending milestone passes due date + grace period. Performance bond forfeited, remaining escrow recovered.
                  </p>
                  <div
                    className={defaultEligibility.allowed ? "field-validation-success" : "field-hint"}
                    style={{ marginTop: "0.3rem", fontSize: "0.75rem" }}
                  >
                    {defaultEligibility.allowed ? `✓ ${defaultEligibility.reason}` : `ℹ️ ${defaultEligibility.reason}`}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-danger action-row-btn"
                  onClick={handleDeclareDefault}
                  disabled={isSubmitting || !defaultEligibility.allowed}
                >
                  Declare Default
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ================================================================= */}
      {/* Verifier & Registrar Sections                                     */}
      {/* ================================================================= */}
      <div className="officer-grid secondary-officer-grid">
        {/* =============================================================== */}
        {/* Verifier Panel: Milestone Verification                          */}
        {/* =============================================================== */}
        <div className="panel">
          <div className="panel-header">
            <div>
              <h3>Milestone Verification</h3>
              <p className="field-hint" style={{ marginTop: "0.2rem" }}>
                Auditors and engineers verify delivered completion proofs to release milestone escrow.
              </p>
            </div>
            <span className="badge badge-verifier">Verifier Role</span>
          </div>

          <div className="form-card">
            {!isVerifierRole && (
              <div className="portal-alert warning" style={{ marginBottom: "1rem" }}>
                <span className="portal-alert-icon">⚠️</span>
                <div>
                  <strong>Verifier Role Required</strong>
                  <p>
                    {account ? (
                      <>
                        Connected wallet <code>{`${account.slice(0, 6)}...${account.slice(-4)}`}</code> does not hold{" "}
                        <code>VERIFIER_ROLE</code>.
                      </>
                    ) : (
                      <>No wallet connected. Milestone sign-offs require registered verifier credentials.</>
                    )}
                  </p>
                </div>
              </div>
            )}

            <div className="form-row">
              <div className="form-group col-half">
                <label>Tender ID</label>
                <select
                  value={verifyTenderId}
                  onChange={(e) => setVerifyTenderId(e.target.value ? Number(e.target.value) : "")}
                  disabled={isDataLoading || isWrongNetwork || fundedTenders.length === 0}
                >
                  {isDataLoading && <option value="">⏳ Loading tenders...</option>}
                  {dataLoadError && <option value="">⚠️ Network read error</option>}
                  {isWrongNetwork && <option value="">⚠️ Wrong network</option>}
                  {!isDataLoading && !dataLoadError && !isWrongNetwork && fundedTenders.length === 0 && (
                    <option value="">No tenders currently in Funded milestone delivery status</option>
                  )}
                  {!isDataLoading && !dataLoadError && !isWrongNetwork && fundedTenders.length > 0 && (
                    <>
                      <option value="">-- Select Funded Tender --</option>
                      {fundedTenders.map((t) => (
                        <option key={t.id} value={t.id}>
                          Tender #{t.id} (Funded)
                        </option>
                      ))}
                    </>
                  )}
                </select>
                {!selectedVerifyTender && fundedTenders.length > 0 && (
                  <div className="field-hint">Select a funded tender to approve milestone delivery.</div>
                )}
              </div>

              <div className="form-group col-half">
                <label>Milestone Index (0-based)</label>
                <input
                  type="number"
                  min="0"
                  value={verifyMilestoneIdx}
                  onChange={(e) => setVerifyMilestoneIdx(e.target.value)}
                  placeholder="0"
                  required
                />
                {!isMilestoneIdxValid && (
                  <div className="field-validation-error">Milestone index must be a non-negative integer.</div>
                )}
              </div>
            </div>

            <div className="field-status-box" style={{ marginBottom: "1rem" }}>
              <span className={`status-indicator-dot ${isVerifierActionAllowed ? "active" : "pending"}`}></span>
              <span>
                {isVerifierActionAllowed
                  ? `Ready to sign off milestone #${verifyMilestoneIdx} on Tender #${verifyTenderId}.`
                  : !selectedVerifyTender
                  ? "Select a funded tender with active milestone proofs."
                  : !isVerifierRole
                  ? "Connected wallet lacks VERIFIER_ROLE."
                  : "Check milestone index parameters."}
              </span>
            </div>

            <button
              type="button"
              className="btn btn-success btn-block"
              onClick={handleApproveMilestone}
              disabled={isSubmitting || !isVerifierActionAllowed}
            >
              {isSubmitting ? "Submitting Milestone Approval..." : "Sign Off Milestone Approval"}
            </button>
          </div>
        </div>

        {/* =============================================================== */}
        {/* Registrar Panel: Entity Registration & Governance               */}
        {/* =============================================================== */}
        <div className="panel">
          <div className="panel-header">
            <div>
              <h3>Entity Registration &amp; Governance</h3>
              <p className="field-hint" style={{ marginTop: "0.2rem" }}>
                Manage role grants, anti-collusion bidding clusters, and regulatory debarments.
              </p>
            </div>
            <span className="badge badge-registrar">Registrar Role</span>
          </div>

          <div className="form-card registrar-controls">
            {!isRegistrarRole && (
              <div className="portal-alert warning" style={{ marginBottom: "0.5rem" }}>
                <span className="portal-alert-icon">⚠️</span>
                <div>
                  <strong>Registrar Authority Required</strong>
                  <p>
                    {account ? (
                      <>
                        Connected wallet <code>{`${account.slice(0, 6)}...${account.slice(-4)}`}</code> does not hold{" "}
                        <code>REGISTRAR_ROLE</code> or <code>DEFAULT_ADMIN_ROLE</code>.
                      </>
                    ) : (
                      <>No wallet connected. Role grants and debarments require registrar authority.</>
                    )}
                  </p>
                </div>
              </div>
            )}

            {/* Register Department */}
            <div className="reg-section">
              <label className="reg-section-label">Grant Department Role</label>
              <div className="inline-reg-row">
                <input
                  type="text"
                  placeholder="Department Wallet Address (0x...)"
                  value={regDeptAddress}
                  onChange={(e) => setRegDeptAddress(e.target.value)}
                />
                <button
                  type="button"
                  className="btn btn-outline action-row-btn"
                  onClick={handleRegisterDepartment}
                  disabled={isSubmitting || !isRegDeptValid}
                >
                  Grant Department
                </button>
              </div>
              {regDeptAddress.length > 0 && !isRegDeptValid && (
                <div className="field-validation-error">Must be a valid 42-character 0x Ethereum address.</div>
              )}
            </div>

            {/* Register Verifier */}
            <div className="reg-section">
              <label className="reg-section-label">Grant Verifier Role</label>
              <div className="inline-reg-row">
                <input
                  type="text"
                  placeholder="Verifier Wallet Address (0x...)"
                  value={regVerifierAddress}
                  onChange={(e) => setRegVerifierAddress(e.target.value)}
                />
                <button
                  type="button"
                  className="btn btn-outline action-row-btn"
                  onClick={handleRegisterVerifier}
                  disabled={isSubmitting || !isRegVerifierValid}
                >
                  Grant Verifier
                </button>
              </div>
              {regVerifierAddress.length > 0 && !isRegVerifierValid && (
                <div className="field-validation-error">Must be a valid 42-character 0x Ethereum address.</div>
              )}
            </div>

            {/* Register Bidder with Group ID */}
            <div className="bidder-reg-box">
              <label>Register Authorized Bidder (with Anti-Collusion Group Identifier):</label>
              <div className="form-row">
                <div style={{ flex: 1 }}>
                  <input
                    type="text"
                    placeholder="Bidder Address (0x...)"
                    value={regBidderAddress}
                    onChange={(e) => setRegBidderAddress(e.target.value)}
                  />
                  {regBidderAddress.length > 0 && !isRegBidderAddrValid && (
                    <div className="field-validation-error">Invalid 0x address.</div>
                  )}
                </div>
                <div style={{ flex: 1 }}>
                  <input
                    type="text"
                    placeholder="Corporate Group ID (e.g. GROUP_ALPHA)"
                    value={regGroupId}
                    onChange={(e) => setRegGroupId(e.target.value)}
                  />
                  {regGroupId.trim().length === 0 && (
                    <div className="field-validation-error">Group ID required.</div>
                  )}
                </div>
              </div>
              <button
                type="button"
                className="btn btn-outline btn-block"
                onClick={handleRegisterBidder}
                disabled={isSubmitting || !isRegBidderFormValid}
              >
                Register Bidder &amp; Assign Corporate Group
              </button>
            </div>

            {/* Debar Bidder */}
            <div className="reg-section">
              <label className="reg-section-label">Debar Non-Compliant Bidder</label>
              <div className="inline-reg-row debar-row">
                <input
                  type="text"
                  placeholder="Debar Bidder Address (0x...)"
                  value={debarAddress}
                  onChange={(e) => setDebarAddress(e.target.value)}
                />
                <button
                  type="button"
                  className="btn btn-danger action-row-btn"
                  onClick={handleDebarBidder}
                  disabled={isSubmitting || !isDebarFormValid}
                >
                  Debar Bidder
                </button>
              </div>
              {debarAddress.length > 0 && !isDebarAddrValid && (
                <div className="field-validation-error">Must be a valid 42-character 0x Ethereum address.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
