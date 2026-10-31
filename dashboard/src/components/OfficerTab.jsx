import React, { useState, useMemo, useEffect } from "react";
import { ethers } from "ethers";
import { CURRENCY_SYMBOL, CHAIN_ID, CHAIN_NAME, DEMO_VERIFIERS, getReadOnlyContract } from "../config";
import { parseContractError } from "../utils/errors";

function formatCountdown(targetTime, now) {
  if (!targetTime) return "None";
  const diff = Number(targetTime) - Number(now);
  if (diff <= 0) return "Ended";
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
  return `${h > 0 ? `${h}h ` : ""}${m}m ${s < 10 ? `0${s}` : s}s`;
}

function formatMinutesSeconds(seconds) {
  if (seconds <= 0) return "00:00";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
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
  latestBlockTimestamp = 0,
}) {
  const isWrongNetwork = chainId !== null && chainId !== CHAIN_ID;
  const currentBlockTime =
    latestBlockTimestamp > 0 ? latestBlockTimestamp : Math.floor(Date.now() / 1000);

  // Submitting tracker
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittingTenderId, setSubmittingTenderId] = useState(null);

  // ==========================================================================
  // DEPARTMENT SECTION (Kept unchanged from previous prompt)
  // ==========================================================================
  const [projectTitle, setProjectTitle] = useState("Demo road repair");
  const [ceilingPrice, setCeilingPrice] = useState("0.02");
  const [bidBond, setBidBond] = useState("0.002");
  const [commitMins, setCommitMins] = useState("3");
  const [revealMins, setRevealMins] = useState("3");

  const [penaltyPercent, setPenaltyPercent] = useState("2");
  const [escrowHours, setEscrowHours] = useState("1");
  const [graceHours, setGraceHours] = useState("1");
  const [verifiersText, setVerifiersText] = useState(DEMO_VERIFIERS);
  const [threshold, setThreshold] = useState("2");

  const isDeptRole = Boolean(roles?.isDepartment);
  const isVerifierRole = Boolean(roles?.isVerifier);
  const isRegistrarRole = Boolean(roles?.isRegistrar);

  function handleFillDemoValues() {
    setProjectTitle("Demo road repair");
    setCeilingPrice("0.02");
    setBidBond("0.002");
    setCommitMins("3");
    setRevealMins("3");
    setPenaltyPercent("2");
    setEscrowHours("1");
    setGraceHours("1");
    setVerifiersText(DEMO_VERIFIERS);
    setThreshold("2");
  }

  const parsedPrice = parseFloat(ceilingPrice);
  const isPricePositive = !isNaN(parsedPrice) && parsedPrice > 0;

  const parsedDeposit = parseFloat(bidBond);
  const isDepositPositive = !isNaN(parsedDeposit) && parsedDeposit > 0;
  const isDepositLessThanPrice = isPricePositive && isDepositPositive && parsedDeposit < parsedPrice;

  const parsedCommitMins = parseInt(commitMins, 10);
  const isCommitMinsValid = !isNaN(parsedCommitMins) && parsedCommitMins >= 1;

  const parsedRevealMins = parseInt(revealMins, 10);
  const isRevealMinsValid = !isNaN(parsedRevealMins) && parsedRevealMins >= 1;

  const parsedEscrowHours = parseInt(escrowHours, 10);
  const isEscrowHoursValid = !isNaN(parsedEscrowHours) && parsedEscrowHours >= 1;

  const parsedGraceHours = parseInt(graceHours, 10);
  const isGraceHoursValid = !isNaN(parsedGraceHours) && parsedGraceHours >= 1;

  const parsedPenalty = parseFloat(penaltyPercent);
  const isPenaltyValid = !isNaN(parsedPenalty) && parsedPenalty >= 0 && parsedPenalty <= 10;

  const isTitleValid = projectTitle.trim().length > 0;

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
      hasDuplicateVerifiers: duplicateFound,
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

  const isFormValid =
    isTitleValid &&
    isPricePositive &&
    isDepositPositive &&
    isDepositLessThanPrice &&
    isCommitMinsValid &&
    isRevealMinsValid &&
    isEscrowHoursValid &&
    isGraceHoursValid &&
    isPenaltyValid &&
    isVerifiersValid &&
    isThresholdValid;

  const canPublishTender =
    account &&
    isDeptRole &&
    !isWrongNetwork &&
    isFormValid &&
    !isSubmitting;

  let publishDisabledReason = null;
  if (!account || !isDeptRole) {
    publishDisabledReason = "Connect a department wallet to use this section.";
  } else if (isWrongNetwork) {
    publishDisabledReason = `Wrong Network — Switch to ${CHAIN_NAME}`;
  } else if (!isTitleValid) {
    publishDisabledReason = "Enter a project title.";
  } else if (!isPricePositive) {
    publishDisabledReason = "Maximum price must be greater than 0.";
  } else if (!isDepositPositive) {
    publishDisabledReason = "Deposit must be greater than 0.";
  } else if (!isDepositLessThanPrice) {
    publishDisabledReason = "Deposit must be strictly less than maximum price.";
  } else if (!isCommitMinsValid || !isRevealMinsValid) {
    publishDisabledReason = "Bidding and opening durations must be at least 1 minute.";
  } else if (!isVerifiersValid) {
    publishDisabledReason = "Enter valid, non-duplicate verifier addresses.";
  } else if (!isThresholdValid) {
    publishDisabledReason = `Approvals needed must be between 1 and ${verifierAddresses.length}.`;
  } else if (isSubmitting) {
    publishDisabledReason = "Publishing tender...";
  }

  async function handlePublishTender(e) {
    e.preventDefault();
    if (!canPublishTender || !signerContract) return;

    try {
      setIsSubmitting(true);
      setNotification({ active: true, title: "Publishing tender on-chain..." });

      const blockNow = latestBlockTimestamp > 0 ? Number(latestBlockTimestamp) : Math.floor(Date.now() / 1000);
      const now = blockNow + 60;
      const commitDeadline = now + parsedCommitMins * 60;
      const revealDeadline = commitDeadline + parsedRevealMins * 60;
      const escrowWindow = parsedEscrowHours * 3600;
      const gracePeriod = parsedGraceHours * 3600;
      const penaltyBps = Math.round(parsedPenalty * 100);

      const milestones = [
        { percentageBps: 3000, dueDate: revealDeadline + 20 * 60 },
        { percentageBps: 3000, dueDate: revealDeadline + 40 * 60 },
        { percentageBps: 4000, dueDate: revealDeadline + 60 * 60 },
      ];

      const titleText = projectTitle.trim();
      const documentHash = ethers.keccak256(ethers.toUtf8Bytes(titleText));

      const tx = await signerContract.createTender(
        ethers.parseEther(ceilingPrice),
        ethers.parseEther(bidBond),
        commitDeadline,
        revealDeadline,
        escrowWindow,
        gracePeriod,
        penaltyBps,
        documentHash,
        milestones,
        verifierAddresses,
        parsedThreshold
      );

      setNotification({ active: true, title: "Mining tender creation on-chain...", hash: tx.hash });
      const receipt = await tx.wait();

      let createdTenderId = null;
      if (receipt && receipt.logs) {
        for (const log of receipt.logs) {
          try {
            const parsed = signerContract.interface.parseLog(log);
            if (parsed && parsed.name === "TenderCreated") {
              createdTenderId = Number(parsed.args.tenderId);
              break;
            }
          } catch {
            // ignore
          }
        }
      }
      if (!createdTenderId) {
        try {
          const readOnly = getReadOnlyContract();
          createdTenderId = Number(await readOnly.tenderCount());
        } catch {
          createdTenderId = tenders.length + 1;
        }
      }

      if (createdTenderId) {
        localStorage.setItem(`opentender_title_${createdTenderId}`, titleText);
      }
      localStorage.setItem(`opentender_title_hash_${documentHash.toLowerCase()}`, titleText);

      setNotification({
        active: false,
        hash: tx.hash,
        title: "Tender Published Successfully!",
        success: `Tender #${createdTenderId || ""} ("${titleText}") published. Sealed bidding is active.`,
      });

      if (onRefresh) onRefresh();
    } catch (err) {
      const msg = parseContractError(err);
      setNotification({ active: false, title: "Failed to publish tender", error: msg });
    } finally {
      setIsSubmitting(false);
    }
  }

  // My tenders section
  const myTenders = useMemo(() => {
    if (!account || !tenders) return [];
    return tenders.filter(
      (t) => t.department && t.department.toLowerCase() === account.toLowerCase()
    );
  }, [account, tenders]);

  const [tenderMilestonesMap, setTenderMilestonesMap] = useState({});

  useEffect(() => {
    let isMounted = true;
    async function fetchMilestones() {
      if (!account || !myTenders || myTenders.length === 0) {
        if (isMounted) setTenderMilestonesMap({});
        return;
      }
      const fundedDeptTenders = myTenders.filter((t) => t.status === 3);
      if (fundedDeptTenders.length === 0) return;

      try {
        const contract = getReadOnlyContract();
        const results = {};
        await Promise.all(
          fundedDeptTenders.map(async (t) => {
            try {
              const ms = await contract.getMilestones(t.id);
              results[t.id] = ms.map((m) => ({
                percentageBps: Number(m.percentageBps),
                dueDate: Number(m.dueDate),
                submittedAt: Number(m.submittedAt),
                evidenceHash: m.evidenceHash,
                approvalCount: Number(m.approvalCount),
                status: Number(m.status),
                payoutAmount: m.payoutAmount,
                penaltyDeducted: m.penaltyDeducted,
              }));
            } catch {
              // ignore
            }
          })
        );
        if (isMounted) setTenderMilestonesMap(results);
      } catch {
        // ignore
      }
    }
    fetchMilestones();
  }, [account, myTenders, latestBlockTimestamp]);

  async function handleFinalizeAward(tenderId) {
    if (!signerContract || isSubmitting) return;
    try {
      setSubmittingTenderId(tenderId);
      setIsSubmitting(true);
      setNotification({ active: true, title: `Finalizing award for Tender #${tenderId}...` });

      const tx = await signerContract.finalizeAward(tenderId);
      setNotification({ active: true, title: "Confirming winner on-chain...", hash: tx.hash });
      await tx.wait();

      setNotification({
        active: false,
        hash: tx.hash,
        title: "Winner Chosen!",
        success: `Tender #${tenderId} award finalized. Awaiting escrow funding.`,
      });
      if (onRefresh) onRefresh();
    } catch (err) {
      setNotification({ active: false, title: "Finalization Failed", error: parseContractError(err) });
    } finally {
      setIsSubmitting(false);
      setSubmittingTenderId(null);
    }
  }

  async function handleFundEscrow(tenderId, winningAmount) {
    if (!signerContract || isSubmitting) return;
    try {
      setSubmittingTenderId(tenderId);
      setIsSubmitting(true);
      setNotification({ active: true, title: `Funding escrow for Tender #${tenderId}...` });

      const tx = await signerContract.fundEscrow(tenderId, { value: winningAmount });
      setNotification({ active: true, title: "Locking funds in escrow...", hash: tx.hash });
      await tx.wait();

      setNotification({
        active: false,
        hash: tx.hash,
        title: "Escrow Funded!",
        success: `Successfully funded ${ethers.formatEther(winningAmount)} ${CURRENCY_SYMBOL} into escrow. Work can now begin.`,
      });
      if (onRefresh) onRefresh();
    } catch (err) {
      setNotification({ active: false, title: "Funding Failed", error: parseContractError(err) });
    } finally {
      setIsSubmitting(false);
      setSubmittingTenderId(null);
    }
  }

  async function handleCancelUnfundedTender(tenderId) {
    if (!signerContract || isSubmitting) return;
    try {
      setSubmittingTenderId(tenderId);
      setIsSubmitting(true);
      setNotification({ active: true, title: `Cancelling unfunded Tender #${tenderId}...` });

      const tx = await signerContract.cancelUnfundedTender(tenderId);
      setNotification({ active: true, title: "Confirming cancellation...", hash: tx.hash });
      await tx.wait();

      setNotification({
        active: false,
        hash: tx.hash,
        title: "Tender Cancelled",
        success: `Tender #${tenderId} was cancelled because escrow was not funded in time.`,
      });
      if (onRefresh) onRefresh();
    } catch (err) {
      setNotification({ active: false, title: "Cancellation Failed", error: parseContractError(err) });
    } finally {
      setIsSubmitting(false);
      setSubmittingTenderId(null);
    }
  }

  async function handleCancelTender(tenderId) {
    if (!signerContract || isSubmitting) return;
    try {
      setSubmittingTenderId(tenderId);
      setIsSubmitting(true);
      setNotification({ active: true, title: `Cancelling Tender #${tenderId}...` });

      const tx = await signerContract.cancelTender(tenderId, "Cancelled by department");
      setNotification({ active: true, title: "Confirming cancellation...", hash: tx.hash });
      await tx.wait();

      setNotification({
        active: false,
        hash: tx.hash,
        title: "Tender Cancelled",
        success: `Tender #${tenderId} cancelled by department. Deposits unlocked for refund.`,
      });
      if (onRefresh) onRefresh();
    } catch (err) {
      setNotification({ active: false, title: "Cancellation Failed", error: parseContractError(err) });
    } finally {
      setIsSubmitting(false);
      setSubmittingTenderId(null);
    }
  }

  async function handleDeclareDefault(tenderId) {
    if (!signerContract || isSubmitting) return;
    try {
      setSubmittingTenderId(tenderId);
      setIsSubmitting(true);
      setNotification({ active: true, title: `Declaring default for Tender #${tenderId}...` });

      const tx = await signerContract.declareDefault(tenderId);
      setNotification({ active: true, title: "Declaring default on-chain...", hash: tx.hash });
      await tx.wait();

      setNotification({
        active: false,
        hash: tx.hash,
        title: "Default Declared",
        success: `Contractor default recorded for Tender #${tenderId}. Remaining escrow recovered.`,
      });
      if (onRefresh) onRefresh();
    } catch (err) {
      setNotification({ active: false, title: "Default Declaration Failed", error: parseContractError(err) });
    } finally {
      setIsSubmitting(false);
      setSubmittingTenderId(null);
    }
  }

  function getTenderTitle(t) {
    if (!t) return "";
    const byId = localStorage.getItem(`opentender_title_${t.id}`);
    if (byId) return byId;
    if (t.documentHash) {
      const byHash = localStorage.getItem(`opentender_title_hash_${t.documentHash.toLowerCase()}`);
      if (byHash) return byHash;
    }
    return "";
  }

  function getTenderStatus(t, now) {
    if (!t) return { label: "", countdown: null };
    const status = Number(t.status);
    if (status === 1) {
      if (now <= Number(t.commitDeadline)) {
        return {
          label: "Taking sealed bids",
          countdown: formatCountdown(Number(t.commitDeadline), now),
        };
      }
      if (now <= Number(t.revealDeadline)) {
        return {
          label: "Opening bids",
          countdown: formatCountdown(Number(t.revealDeadline), now),
        };
      }
      return {
        label: "Ready to choose the winner",
        countdown: null,
      };
    }
    if (status === 2) return { label: "Winner chosen, waiting for the contract money", countdown: null };
    if (status === 3) return { label: "Work in progress", countdown: null };
    if (status === 4) return { label: "Completed and paid", countdown: null };
    if (status === 5) return { label: "No valid bids", countdown: null };
    if (status === 6) return { label: "Cancelled", countdown: null };
    if (status === 7) return { label: "Contractor missed the deadline", countdown: null };
    return { label: "Unknown", countdown: null };
  }

  function getNextAction(t, now, milestones = []) {
    const status = Number(t.status);

    if (status === 1) {
      if (now <= Number(t.commitDeadline)) {
        return {
          description: "Cancel tender before the bidding phase ends and unlock deposits.",
          buttonText: "Cancel this tender",
          action: () => handleCancelTender(t.id),
          disabled: false,
          buttonClass: "btn-warning",
        };
      }
      if (now <= Number(t.revealDeadline)) {
        const waitSec = Number(t.revealDeadline) - now;
        return {
          description: "Bids are currently being unsealed on-chain.",
          buttonText: `Opening ends in ${formatMinutesSeconds(waitSec)}`,
          action: null,
          disabled: true,
          buttonClass: "btn-secondary",
        };
      }
      return {
        description: "Bidding and opening have concluded. Select the winning contractor.",
        buttonText: "Choose the winner",
        action: () => handleFinalizeAward(t.id),
        disabled: false,
        buttonClass: "btn-primary",
      };
    }

    if (status === 2) {
      const winningAmtStr = `${ethers.formatEther(t.winningAmount || 0n)} ${CURRENCY_SYMBOL}`;
      if (now <= Number(t.escrowDeadline)) {
        return {
          description: "Winner chosen. Fund the contract escrow to start milestone work.",
          buttonText: `Deposit the contract money (${winningAmtStr})`,
          action: () => handleFundEscrow(t.id, t.winningAmount),
          disabled: false,
          buttonClass: "btn-primary",
        };
      }
      return {
        description: "Escrow funding window has expired on-chain.",
        buttonText: "Cancel: not funded in time",
        action: () => handleCancelUnfundedTender(t.id),
        disabled: false,
        buttonClass: "btn-danger",
      };
    }

    if (status === 3) {
      const currentMilestoneIdx = Number(t.completedMilestones || 0);
      const m = milestones && milestones[currentMilestoneIdx];

      if (m) {
        const isWaiting = m.status === 0;
        const defaultEligibleTime = Number(m.dueDate) + Number(t.gracePeriod);

        if (isWaiting && now > defaultEligibleTime) {
          return {
            description: "Contractor has missed the milestone deadline and grace period.",
            buttonText: "Declare missed deadline",
            action: () => handleDeclareDefault(t.id),
            disabled: false,
            buttonClass: "btn-danger",
          };
        }

        if (m.status === 1) {
          return {
            description: "Contractor submitted proof; waiting for verifier review.",
            buttonText: "Waiting for verifier review",
            action: null,
            disabled: true,
            buttonClass: "btn-secondary",
          };
        }

        if (now <= Number(m.dueDate)) {
          const diff = Number(m.dueDate) - now;
          return {
            description: `Contractor is executing Milestone #${currentMilestoneIdx + 1}.`,
            buttonText: `Milestone in progress (Due in ${formatMinutesSeconds(diff)})`,
            action: null,
            disabled: true,
            buttonClass: "btn-secondary",
          };
        }

        const diff = defaultEligibleTime - now;
        return {
          description: "Milestone due date passed. Grace period is running.",
          buttonText: `Grace period active (${formatMinutesSeconds(diff)} left)`,
          action: null,
          disabled: true,
          buttonClass: "btn-secondary",
        };
      }

      return {
        description: "Milestone execution in progress.",
        buttonText: "Work in progress",
        action: null,
        disabled: true,
        buttonClass: "btn-secondary",
      };
    }

    if (status === 4) {
      return {
        description: "All milestones delivered and approved.",
        buttonText: "Tender completed",
        action: null,
        disabled: true,
        buttonClass: "btn-secondary",
      };
    }

    if (status === 5) {
      return {
        description: "Tender concluded with no valid bids.",
        buttonText: "No valid bids",
        action: null,
        disabled: true,
        buttonClass: "btn-secondary",
      };
    }

    if (status === 6) {
      return {
        description: "Tender was cancelled by department.",
        buttonText: "Tender cancelled",
        action: null,
        disabled: true,
        buttonClass: "btn-secondary",
      };
    }

    if (status === 7) {
      return {
        description: "Contractor defaulted on delivery deadline.",
        buttonText: "Contractor defaulted",
        action: null,
        disabled: true,
        buttonClass: "btn-secondary",
      };
    }

    return {
      description: "No action available.",
      buttonText: "No action",
      action: null,
      disabled: true,
      buttonClass: "btn-secondary",
    };
  }

  // ==========================================================================
  // STEP 1: Verifier Section State & Work Queries
  // ==========================================================================
  const [pendingVerifications, setPendingVerifications] = useState([]);
  const [isCheckingVerifications, setIsCheckingVerifications] = useState(false);
  const [approvingStageKey, setApprovingStageKey] = useState(null);

  useEffect(() => {
    let isMounted = true;
    async function checkVerifierWork() {
      if (!account || !isVerifierRole || !tenders || tenders.length === 0) {
        if (isMounted) setPendingVerifications([]);
        return;
      }

      const funded = tenders.filter((t) => t.status === 3);
      if (funded.length === 0) {
        if (isMounted) setPendingVerifications([]);
        return;
      }

      try {
        setIsCheckingVerifications(true);
        const contract = getReadOnlyContract();
        const pending = [];

        await Promise.all(
          funded.map(async (t) => {
            try {
              // 1. Is this wallet one of the tender's verifiers?
              const verifiers = await contract.getTenderVerifiers(t.id);
              const isOneOfVerifiers = verifiers.some(
                (v) => v.toLowerCase() === account.toLowerCase()
              );
              if (!isOneOfVerifiers) return;

              // 2. Fetch milestones for this tender
              const milestones = await contract.getMilestones(t.id);
              const stageIndex = Number(t.completedMilestones || 0);
              const currentStage = milestones[stageIndex];

              // 3. Current stage has status "Work submitted" (status === 1)
              if (!currentStage || Number(currentStage.status) !== 1) return;

              // 4. This wallet has not approved it yet
              const hasApproved = await contract.hasVerifierApproved(t.id, stageIndex, account);
              if (hasApproved) return;

              pending.push({
                tenderId: Number(t.id),
                stageIndex: stageIndex,
                stageNumber: stageIndex + 1,
                evidenceHash: currentStage.evidenceHash,
                approvalCount: Number(currentStage.approvalCount),
                approvalThreshold: Number(t.approvalThreshold),
              });
            } catch {
              // ignore single tender read error
            }
          })
        );

        if (isMounted) {
          pending.sort((a, b) => a.tenderId - b.tenderId);
          setPendingVerifications(pending);
          setIsCheckingVerifications(false);
        }
      } catch {
        if (isMounted) setIsCheckingVerifications(false);
      }
    }

    checkVerifierWork();
  }, [account, isVerifierRole, tenders, latestBlockTimestamp]);

  async function handleApproveWork(tenderId, stageIndex) {
    if (!signerContract || isSubmitting) return;
    const stageKey = `${tenderId}-${stageIndex}`;
    try {
      setApprovingStageKey(stageKey);
      setIsSubmitting(true);
      setNotification({
        active: true,
        title: `Approving Stage #${stageIndex + 1} for Tender #${tenderId}...`,
      });

      const tx = await signerContract.approveMilestone(tenderId, stageIndex);
      setNotification({ active: true, title: "Recording approval on-chain...", hash: tx.hash });
      await tx.wait();

      setNotification({
        active: false,
        hash: tx.hash,
        title: "Stage Approved!",
        success: `Your approval for Tender #${tenderId} (Stage #${stageIndex + 1}) was registered on-chain.`,
      });

      if (onRefresh) onRefresh();
    } catch (err) {
      setNotification({
        active: false,
        title: "Approval Failed",
        error: parseContractError(err),
      });
    } finally {
      setIsSubmitting(false);
      setApprovingStageKey(null);
    }
  }

  // ==========================================================================
  // STEP 2: Admin Section State & Handlers
  // ==========================================================================
  // Form 1: Add a participant
  const [participantAddress, setParticipantAddress] = useState("");
  const [participantRole, setParticipantRole] = useState("Bidder");
  const [companyGroupName, setCompanyGroupName] = useState("");
  const [companyRegRef, setCompanyRegRef] = useState("");

  // Form 2: Block a bidder
  const [blockBidderAddress, setBlockBidderAddress] = useState("");
  const [blockBidderReason, setBlockBidderReason] = useState("");

  const isParticipantAddressValid =
    participantAddress.trim().length > 0 && ethers.isAddress(participantAddress.trim());

  const isBidderFieldsValid =
    participantRole !== "Bidder" ||
    (companyGroupName.trim().length > 0 && companyRegRef.trim().length > 0);

  const isAddParticipantValid = isParticipantAddressValid && isBidderFieldsValid;

  const isBlockBidderAddressValid =
    blockBidderAddress.trim().length > 0 && ethers.isAddress(blockBidderAddress.trim());
  const isBlockBidderReasonValid = blockBidderReason.trim().length > 0;
  const isBlockBidderValid = isBlockBidderAddressValid && isBlockBidderReasonValid;

  async function handleAddParticipant(e) {
    e.preventDefault();
    if (!signerContract || !isAddParticipantValid || isSubmitting) return;

    try {
      setIsSubmitting(true);
      const targetAddress = participantAddress.trim();

      if (participantRole === "Department") {
        setNotification({ active: true, title: `Granting Department role to ${targetAddress.slice(0, 6)}...` });
        const tx = await signerContract.registerDepartment(targetAddress);
        await tx.wait();
        setNotification({
          active: false,
          title: "Department Registered",
          success: `Granted Department role to ${targetAddress}`,
        });
      } else if (participantRole === "Verifier") {
        setNotification({ active: true, title: `Granting Verifier role to ${targetAddress.slice(0, 6)}...` });
        const tx = await signerContract.registerVerifier(targetAddress);
        await tx.wait();
        setNotification({
          active: false,
          title: "Verifier Registered",
          success: `Granted Verifier role to ${targetAddress}`,
        });
      } else if (participantRole === "Bidder") {
        setNotification({ active: true, title: `Registering bidder ${targetAddress.slice(0, 6)}...` });

        // Both are hashed with keccak256 in the browser
        const groupId = ethers.keccak256(ethers.toUtf8Bytes(companyGroupName.trim()));
        const identityHash = ethers.keccak256(ethers.toUtf8Bytes(companyRegRef.trim()));

        const tx = await signerContract.registerBidder(targetAddress, identityHash, groupId);
        await tx.wait();
        setNotification({
          active: false,
          title: "Bidder Registered",
          success: `Registered bidder ${targetAddress} under group "${companyGroupName.trim()}".`,
        });
      }

      setParticipantAddress("");
      setCompanyGroupName("");
      setCompanyRegRef("");
      if (onRefresh) onRefresh();
    } catch (err) {
      setNotification({
        active: false,
        title: "Failed to Add Participant",
        error: parseContractError(err),
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleBlockBidder(e) {
    e.preventDefault();
    if (!signerContract || !isBlockBidderValid || isSubmitting) return;

    try {
      setIsSubmitting(true);
      const targetAddress = blockBidderAddress.trim();
      const reason = blockBidderReason.trim();

      setNotification({ active: true, title: `Debarring bidder ${targetAddress.slice(0, 6)}...` });
      const tx = await signerContract.debarBidder(targetAddress, reason);
      await tx.wait();

      setNotification({
        active: false,
        title: "Bidder Blocked",
        success: `Wallet ${targetAddress} has been blocked from tender bidding. Reason: ${reason}`,
      });

      setBlockBidderAddress("");
      setBlockBidderReason("");
      if (onRefresh) onRefresh();
    } catch (err) {
      setNotification({
        active: false,
        title: "Failed to Block Bidder",
        error: parseContractError(err),
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  // ==========================================================================
  // Render
  // ==========================================================================
  return (
    <div className="tab-pane officer-tab">
      {/* ================================================================= */}
      {/* 1. Department Section (Kept unchanged)                             */}
      {/* ================================================================= */}
      <div className="officer-grid">
        {/* Panel 1: Department: publish a tender */}
        <div className="panel">
          <div className="panel-header">
            <div>
              <h3>Department: publish a tender</h3>
              <p className="panel-sub" style={{ marginTop: "0.2rem" }}>
                Define procurement specifications, ceiling price, and multi-verifier escrow quorum.
              </p>
            </div>
            <button
              type="button"
              className="btn-mini btn-secondary"
              onClick={handleFillDemoValues}
              disabled={!isDeptRole || !account}
              title="Populate demo values for testing"
            >
              Fill demo values
            </button>
          </div>

          {!isDeptRole && (
            <div className="portal-alert alert-warning" style={{ margin: "1rem 0" }}>
              <span className="portal-alert-icon">⚠️</span>
              <div className="portal-alert-body">
                <strong>Department Access Required:</strong> Connect a department wallet to use this section.
              </div>
            </div>
          )}

          <form onSubmit={handlePublishTender} className="form-card">
            <div className="form-group">
              <label>Project title</label>
              <input
                type="text"
                placeholder="e.g. Demo road repair"
                value={projectTitle}
                disabled={!isDeptRole || !account || isWrongNetwork}
                onChange={(e) => setProjectTitle(e.target.value)}
                required
              />
              <div className="field-hint">
                Hashed with keccak256 into documentHash and saved locally by tender ID.
              </div>
              {!isTitleValid && (
                <div className="field-validation-error">Project title is required.</div>
              )}
            </div>

            <div className="form-row">
              <div className="form-group col-half">
                <label>Maximum price ({CURRENCY_SYMBOL})</label>
                <input
                  type="number"
                  step="0.0001"
                  min="0.0001"
                  placeholder="e.g. 0.02"
                  value={ceilingPrice}
                  disabled={!isDeptRole || !account || isWrongNetwork}
                  onChange={(e) => setCeilingPrice(e.target.value)}
                  required
                />
                {!isPricePositive && (
                  <div className="field-validation-error">Maximum price must be greater than 0.</div>
                )}
              </div>
              <div className="form-group col-half">
                <label>Deposit ({CURRENCY_SYMBOL})</label>
                <input
                  type="number"
                  step="0.0001"
                  min="0.0001"
                  placeholder="e.g. 0.002"
                  value={bidBond}
                  disabled={!isDeptRole || !account || isWrongNetwork}
                  onChange={(e) => setBidBond(e.target.value)}
                  required
                />
                {!isDepositPositive && (
                  <div className="field-validation-error">Deposit must be greater than 0.</div>
                )}
                {isDepositPositive && !isDepositLessThanPrice && (
                  <div className="field-validation-error">Deposit must be strictly less than maximum price.</div>
                )}
              </div>
            </div>

            <div className="form-row">
              <div className="form-group col-half">
                <label>Bidding time (minutes)</label>
                <input
                  type="number"
                  min="1"
                  placeholder="e.g. 3"
                  value={commitMins}
                  disabled={!isDeptRole || !account || isWrongNetwork}
                  onChange={(e) => setCommitMins(e.target.value)}
                  required
                />
                {!isCommitMinsValid && (
                  <div className="field-validation-error">Bidding time must be at least 1 minute.</div>
                )}
              </div>
              <div className="form-group col-half">
                <label>Opening time (minutes)</label>
                <input
                  type="number"
                  min="1"
                  placeholder="e.g. 3"
                  value={revealMins}
                  disabled={!isDeptRole || !account || isWrongNetwork}
                  onChange={(e) => setRevealMins(e.target.value)}
                  required
                />
                {!isRevealMinsValid && (
                  <div className="field-validation-error">Opening time must be at least 1 minute.</div>
                )}
              </div>
            </div>

            <details className="advanced-salt-details" style={{ marginTop: "0.25rem" }}>
              <summary className="advanced-salt-summary">
                <span>Advanced Settings</span>
                <span className="details-chevron">▾</span>
              </summary>
              <div className="advanced-salt-content">
                <div className="form-group" style={{ marginBottom: "0.85rem" }}>
                  <label>Late penalty per day in PERCENT (max 10%)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="10"
                    placeholder="2"
                    value={penaltyPercent}
                    disabled={!isDeptRole || !account || isWrongNetwork}
                    onChange={(e) => setPenaltyPercent(e.target.value)}
                    required
                  />
                  <div className="field-hint">
                    Default 2% per day (sent as 200 basis points; contract maximum 10%).
                  </div>
                  {!isPenaltyValid && (
                    <div className="field-validation-error">
                      Penalty must be between 0% and 10% per day.
                    </div>
                  )}
                </div>

                <div className="form-row" style={{ marginBottom: "0.85rem" }}>
                  <div className="form-group col-half">
                    <label>Funding window in hours</label>
                    <input
                      type="number"
                      min="1"
                      placeholder="1"
                      value={escrowHours}
                      disabled={!isDeptRole || !account || isWrongNetwork}
                      onChange={(e) => setEscrowHours(e.target.value)}
                      required
                    />
                    {!isEscrowHoursValid && (
                      <div className="field-validation-error">Funding window must be at least 1 hour.</div>
                    )}
                  </div>
                  <div className="form-group col-half">
                    <label>Grace period in hours</label>
                    <input
                      type="number"
                      min="1"
                      placeholder="1"
                      value={graceHours}
                      disabled={!isDeptRole || !account || isWrongNetwork}
                      onChange={(e) => setGraceHours(e.target.value)}
                      required
                    />
                    {!isGraceHoursValid && (
                      <div className="field-validation-error">Grace period must be at least 1 hour.</div>
                    )}
                  </div>
                </div>

                <div className="form-group" style={{ marginBottom: "0.85rem" }}>
                  <label>Verifiers (Comma-Separated Addresses)</label>
                  <textarea
                    rows="2"
                    value={verifiersText}
                    disabled={!isDeptRole || !account || isWrongNetwork}
                    onChange={(e) => setVerifiersText(e.target.value)}
                    placeholder={DEMO_VERIFIERS}
                    required
                  />
                  <div className="field-hint">
                    {verifierAddresses.length > 0 ? (
                      <span>
                        ✓ {verifierAddresses.length} valid verifier address{verifierAddresses.length > 1 ? "es" : ""}{" "}
                        parsed from DEMO_VERIFIERS
                      </span>
                    ) : (
                      <span>Enter valid 42-character 0x addresses.</span>
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

                <div className="form-group" style={{ marginBottom: "0.85rem" }}>
                  <label>Approvals needed</label>
                  <input
                    type="number"
                    min="1"
                    max={Math.max(1, verifierAddresses.length)}
                    value={threshold}
                    disabled={!isDeptRole || !account || isWrongNetwork}
                    onChange={(e) => setThreshold(e.target.value)}
                    placeholder="2"
                    required
                  />
                  <div className="field-hint">
                    Requires {threshold || 2} of {verifierAddresses.length || 0} verifier approvals to release escrow.
                  </div>
                  {!isThresholdValid && (
                    <div className="field-validation-error">
                      Approvals needed must be between 1 and the number of verifiers ({verifierAddresses.length}).
                    </div>
                  )}
                </div>

                <div className="form-group">
                  <label>Payment Plan</label>
                  <div className="milestone-plain-text-box" style={{ fontSize: "0.84rem", padding: "0.75rem 0.9rem" }}>
                    Stage 1: 30% (reveal deadline + 20 min), Stage 2: 30% (+40 min), Stage 3: 40% (+60 min)
                  </div>
                </div>
              </div>
            </details>

            <div className="action-button-row">
              <button
                type="submit"
                className="btn btn-primary btn-block"
                disabled={!canPublishTender}
              >
                {isSubmitting ? "Publishing tender on-chain..." : "Publish tender"}
              </button>
              {publishDisabledReason && (
                <div className="btn-disabled-reason">
                  <span className="reason-bullet">ℹ</span> {publishDisabledReason}
                </div>
              )}
            </div>
          </form>
        </div>

        {/* Panel 2: My tenders */}
        <div className="panel">
          <div className="panel-header">
            <div>
              <h3>My tenders</h3>
              <p className="panel-sub" style={{ marginTop: "0.2rem" }}>
                Manage all procurement tenders published by your department wallet.
              </p>
            </div>
            <span className="badge badge-dept">Department Role</span>
          </div>

          {!account || !isDeptRole ? (
            <div className="my-tenders-content-wrap">
              <div className="portal-alert alert-warning">
                <span className="portal-alert-icon">⚠️</span>
                <div className="portal-alert-body">
                  <strong>Department Access Required:</strong> Connect a department wallet to manage your tenders.
                </div>
              </div>
              <div className="dept-workflow-card">
                <div className="dept-workflow-title">Department Lifecycle Workflow</div>
                <div className="dept-workflow-steps">
                  <div className="dept-workflow-step">
                    <span className="step-badge">1</span>
                    <div>
                      <strong>Publish Tender Specifications</strong>
                      <p>Define ceiling price, bid bond deposit, and multi-verifier quorum.</p>
                    </div>
                  </div>
                  <div className="dept-workflow-step">
                    <span className="step-badge">2</span>
                    <div>
                      <strong>Collect Sealed Commitments</strong>
                      <p>Registered bidders submit cryptographic commitments privately.</p>
                    </div>
                  </div>
                  <div className="dept-workflow-step">
                    <span className="step-badge">3</span>
                    <div>
                      <strong>Open Bids &amp; Fund Escrow</strong>
                      <p>Winning contractor is determined on-chain and contract escrow is locked.</p>
                    </div>
                  </div>
                  <div className="dept-workflow-step">
                    <span className="step-badge">4</span>
                    <div>
                      <strong>Milestone Escrow Governance</strong>
                      <p>Independent verifiers approve completed deliverables before payments unlock.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : myTenders.length === 0 ? (
            <div className="my-tenders-content-wrap">
              <div className="empty-tender-notice">
                No tenders published by your department wallet yet. Use the form on the left to publish your first tender.
              </div>
              <div className="dept-workflow-card">
                <div className="dept-workflow-title">Department Lifecycle Workflow</div>
                <div className="dept-workflow-steps">
                  <div className="dept-workflow-step">
                    <span className="step-badge">1</span>
                    <div>
                      <strong>Publish Tender Specifications</strong>
                      <p>Define ceiling price, bid bond deposit, and multi-verifier quorum.</p>
                    </div>
                  </div>
                  <div className="dept-workflow-step">
                    <span className="step-badge">2</span>
                    <div>
                      <strong>Collect Sealed Commitments</strong>
                      <p>Registered bidders submit cryptographic commitments privately.</p>
                    </div>
                  </div>
                  <div className="dept-workflow-step">
                    <span className="step-badge">3</span>
                    <div>
                      <strong>Open Bids &amp; Fund Escrow</strong>
                      <p>Winning contractor is determined on-chain and contract escrow is locked.</p>
                    </div>
                  </div>
                  <div className="dept-workflow-step">
                    <span className="step-badge">4</span>
                    <div>
                      <strong>Milestone Escrow Governance</strong>
                      <p>Independent verifiers approve completed deliverables before payments unlock.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="my-tenders-list">
              {myTenders.map((t) => {
                const statusInfo = getTenderStatus(t, currentBlockTime);
                const tenderTitle = getTenderTitle(t);
                const nextAction = getNextAction(t, currentBlockTime, tenderMilestonesMap[t.id] || []);
                const isThisSubmitting = isSubmitting && submittingTenderId === t.id;

                return (
                  <div key={t.id} className="my-tender-card">
                    <div className="my-tender-header">
                      <div>
                        <h4 className="my-tender-title">
                          Tender #{t.id} {tenderTitle ? `— "${tenderTitle}"` : `(${t.documentHash ? t.documentHash.slice(0, 10) : ""})`}
                        </h4>
                        <div className="my-tender-status-row">
                          <span className="my-tender-status-badge">
                            {statusInfo.label}
                          </span>
                          {statusInfo.countdown && (
                            <span className="my-tender-countdown highlight-timer">
                              {statusInfo.countdown}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="my-tender-meta">
                        <div>
                          Max: <strong>{ethers.formatEther(t.ceilingPrice)} {CURRENCY_SYMBOL}</strong>
                        </div>
                        <div>
                          Deposit: <strong>{ethers.formatEther(t.bidBond)} {CURRENCY_SYMBOL}</strong>
                        </div>
                      </div>
                    </div>

                    <div className="my-tender-action-box">
                      <div className="action-description">
                        {nextAction.description}
                      </div>
                      <button
                        type="button"
                        className={`btn btn-block ${nextAction.buttonClass || "btn-primary"}`}
                        disabled={nextAction.disabled || isThisSubmitting || isWrongNetwork}
                        onClick={nextAction.action || undefined}
                      >
                        {isThisSubmitting ? "Processing action..." : nextAction.buttonText}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ================================================================= */}
      {/* STEP 1: Verifier Section & STEP 2: Admin Section                  */}
      {/* ================================================================= */}
      <div className="officer-grid secondary-officer-grid" style={{ marginTop: "1.75rem" }}>
        {/* STEP 1: Verifier Section */}
        <div className="panel">
          <div className="panel-header">
            <div>
              <h3>Verifier: approve work</h3>
              <p className="panel-sub" style={{ marginTop: "0.2rem" }}>
                Review submitted completion proofs and approve milestone payments.
              </p>
            </div>
            <span className="badge badge-verifier">Verifier Role</span>
          </div>

          {!isVerifierRole ? (
            <div className="single-grey-line role-auth-box">
              <div className="role-auth-icon-wrap verifier-auth-icon">
                <span className="role-auth-glyph">🛡️</span>
              </div>
              <div className="role-auth-title">Verifier Role Required</div>
              <div className="role-auth-text">
                Connect a verifier wallet to approve work
              </div>
              <div className="role-auth-hint">
                Only wallets designated in a tender's verifier quorum can inspect submitted proofs and authorize milestone releases.
              </div>
            </div>
          ) : isCheckingVerifications ? (
            <div className="empty-tender-notice">Checking submitted work...</div>
          ) : pendingVerifications.length === 0 ? (
            <div className="empty-tender-notice">No work is waiting for your approval.</div>
          ) : (
            <div className="verifier-cards-list">
              {pendingVerifications.map((item) => {
                const isThisSubmitting = isSubmitting && approvingStageKey === `${item.tenderId}-${item.stageIndex}`;
                return (
                  <div key={`${item.tenderId}-${item.stageIndex}`} className="verifier-item-card">
                    <div className="verifier-item-header">
                      <div>
                        <h4 className="verifier-item-title">
                          Tender #{item.tenderId} — Stage #{item.stageNumber}
                        </h4>
                        <div className="verifier-fingerprint">
                          Proof fingerprint: <code>{item.evidenceHash ? `${item.evidenceHash.slice(0, 10)}...${item.evidenceHash.slice(-6)}` : "None"}</code>
                        </div>
                      </div>
                      <div className="verifier-approvals-pill">
                        Approvals: <strong>{item.approvalCount} of {item.approvalThreshold}</strong>
                      </div>
                    </div>

                    <div className="verifier-action-row">
                      <button
                        type="button"
                        className="btn btn-success btn-block"
                        disabled={isSubmitting || isWrongNetwork}
                        onClick={() => handleApproveWork(item.tenderId, item.stageIndex)}
                      >
                        {isThisSubmitting ? "Approving stage..." : "Approve this stage"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* STEP 2: Admin Section */}
        <div className="panel">
          <div className="panel-header">
            <div>
              <h3>Admin: participants &amp; compliance</h3>
              <p className="panel-sub" style={{ marginTop: "0.2rem" }}>
                Add verified participants and enforce bidding compliance.
              </p>
            </div>
            <span className="badge badge-registrar">Admin Role</span>
          </div>

          {!isRegistrarRole ? (
            <div className="single-grey-line role-auth-box">
              <div className="role-auth-icon-wrap admin-auth-icon">
                <span className="role-auth-glyph">⚙️</span>
              </div>
              <div className="role-auth-title">Admin Role Required</div>
              <div className="role-auth-text">
                Connect an admin wallet to manage participants
              </div>
              <div className="role-auth-hint">
                Only the designated registrar address can add verified participants, register bidders, and enforce compliance debarment.
              </div>
            </div>
          ) : (
            <div className="admin-forms-stack">
              {/* Form 1: Add a participant */}
              <form onSubmit={handleAddParticipant} className="form-card admin-sub-card">
                <h4 className="admin-subheading">Add a participant</h4>

                <div className="form-group">
                  <label>Participant Address</label>
                  <input
                    type="text"
                    placeholder="Wallet Address (0x...)"
                    value={participantAddress}
                    disabled={isSubmitting || isWrongNetwork}
                    onChange={(e) => setParticipantAddress(e.target.value)}
                    required
                  />
                  {participantAddress.length > 0 && !isParticipantAddressValid && (
                    <div className="field-validation-error">Must be a valid 42-character 0x address.</div>
                  )}
                </div>

                <div className="form-group">
                  <label>Role</label>
                  <select
                    value={participantRole}
                    disabled={isSubmitting || isWrongNetwork}
                    onChange={(e) => setParticipantRole(e.target.value)}
                  >
                    <option value="Bidder">Bidder</option>
                    <option value="Department">Department</option>
                    <option value="Verifier">Verifier</option>
                  </select>
                </div>

                {participantRole === "Bidder" && (
                  <>
                    <div className="form-group">
                      <label>Company group name</label>
                      <input
                        type="text"
                        placeholder="e.g. Acme Infrastructure Group"
                        value={companyGroupName}
                        disabled={isSubmitting || isWrongNetwork}
                        onChange={(e) => setCompanyGroupName(e.target.value)}
                        required
                      />
                      <div className="field-hint">
                        Companies owned by the same group must use the same group name. They cannot bid against each other on the same tender
                      </div>
                    </div>

                    <div className="form-group">
                      <label>Company registration reference</label>
                      <input
                        type="text"
                        placeholder="e.g. CORP-REG-987654"
                        value={companyRegRef}
                        disabled={isSubmitting || isWrongNetwork}
                        onChange={(e) => setCompanyRegRef(e.target.value)}
                        required
                      />
                      <div className="field-hint">
                        Stored only as a fingerprint. Do not enter personal data
                      </div>
                    </div>
                  </>
                )}

                <button
                  type="submit"
                  className="btn btn-primary btn-block"
                  disabled={isSubmitting || !isAddParticipantValid || isWrongNetwork}
                >
                  {isSubmitting ? "Adding participant..." : "Add participant"}
                </button>
              </form>

              <div className="admin-divider" />

              {/* Form 2: Block a bidder */}
              <form onSubmit={handleBlockBidder} className="form-card admin-sub-card">
                <h4 className="admin-subheading">Block a bidder</h4>

                <div className="form-group">
                  <label>Bidder Address</label>
                  <input
                    type="text"
                    placeholder="Bidder Address (0x...)"
                    value={blockBidderAddress}
                    disabled={isSubmitting || isWrongNetwork}
                    onChange={(e) => setBlockBidderAddress(e.target.value)}
                    required
                  />
                  {blockBidderAddress.length > 0 && !isBlockBidderAddressValid && (
                    <div className="field-validation-error">Must be a valid 42-character 0x address.</div>
                  )}
                </div>

                <div className="form-group">
                  <label>Reason</label>
                  <input
                    type="text"
                    placeholder="e.g. Collusion or tender default"
                    value={blockBidderReason}
                    disabled={isSubmitting || isWrongNetwork}
                    onChange={(e) => setBlockBidderReason(e.target.value)}
                    required
                  />
                </div>

                <button
                  type="submit"
                  className="btn btn-danger btn-block"
                  disabled={isSubmitting || !isBlockBidderValid || isWrongNetwork}
                >
                  {isSubmitting ? "Blocking bidder..." : "Block bidder"}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
