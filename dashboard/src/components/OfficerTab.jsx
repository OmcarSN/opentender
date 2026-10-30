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
  // STEP 1: Department: Publish Tender Form State
  // ==========================================================================
  const [projectTitle, setProjectTitle] = useState("Demo road repair");
  const [ceilingPrice, setCeilingPrice] = useState("0.02");
  const [bidBond, setBidBond] = useState("0.002");
  const [commitMins, setCommitMins] = useState("3");
  const [revealMins, setRevealMins] = useState("3");

  // ==========================================================================
  // STEP 2: Collapsed Advanced Section Defaults
  // ==========================================================================
  const [penaltyPercent, setPenaltyPercent] = useState("2"); // percent (default 2, sent as 200 bps)
  const [escrowHours, setEscrowHours] = useState("1"); // hours (default 1)
  const [graceHours, setGraceHours] = useState("1"); // hours (default 1)
  const [verifiersText, setVerifiersText] = useState(DEMO_VERIFIERS);
  const [threshold, setThreshold] = useState("2"); // default 2

  // Authorization flags
  const isDeptRole = Boolean(roles?.isDepartment);
  const isVerifierRole = Boolean(roles?.isVerifier);
  const isRegistrarRole = Boolean(roles?.isRegistrar);

  // Verifier state (Milestone Verification panel)
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

  const selectedVerifyTender = useMemo(() => {
    if (!verifyTenderId) return null;
    return tenders.find((t) => Number(t.id) === Number(verifyTenderId)) || null;
  }, [verifyTenderId, tenders]);

  useEffect(() => {
    if (fundedTenders.length > 0) {
      const exists = fundedTenders.some((t) => Number(t.id) === Number(verifyTenderId));
      if (!verifyTenderId || !exists) {
        setVerifyTenderId(Number(fundedTenders[fundedTenders.length - 1].id));
      }
    }
  }, [fundedTenders, verifyTenderId]);

  // ==========================================================================
  // STEP 1: "Fill demo values" Handler
  // ==========================================================================
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

  // ==========================================================================
  // STEP 3: Validation Before Sending
  // ==========================================================================
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

  // Compute disabled reason for publish button
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

  // ==========================================================================
  // Publish Tender Handler (Step 1 & Step 3)
  // ==========================================================================
  async function handlePublishTender(e) {
    e.preventDefault();
    if (!canPublishTender || !signerContract) return;

    try {
      setIsSubmitting(true);
      setNotification({ active: true, title: "Publishing tender on-chain..." });

      // Deadlines computed from latest BLOCK timestamp + 60s margin
      const blockNow = latestBlockTimestamp > 0 ? Number(latestBlockTimestamp) : Math.floor(Date.now() / 1000);
      const now = blockNow + 60;
      const commitDeadline = now + parsedCommitMins * 60;
      const revealDeadline = commitDeadline + parsedRevealMins * 60;
      const escrowWindow = parsedEscrowHours * 3600;
      const gracePeriod = parsedGraceHours * 3600;
      const penaltyBps = Math.round(parsedPenalty * 100);

      // 3 milestones: 30%, 30%, 40%
      const milestones = [
        { percentageBps: 3000, dueDate: revealDeadline + 20 * 60 },
        { percentageBps: 3000, dueDate: revealDeadline + 40 * 60 },
        { percentageBps: 4000, dueDate: revealDeadline + 60 * 60 },
      ];

      // Document hash: keccak256 of UTF-8 title text
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

      // Find created tender ID from receipt logs or fallback
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
            // ignore non-matching logs
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

      // Save title in localStorage by tender id and hash
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

  // ==========================================================================
  // STEP 4: Section "My tenders" Data & Handlers
  // ==========================================================================
  const myTenders = useMemo(() => {
    if (!account || !tenders) return [];
    return tenders.filter(
      (t) => t.department && t.department.toLowerCase() === account.toLowerCase()
    );
  }, [account, tenders]);

  // Fetch milestones for my funded tenders
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
                status: Number(m.status), // 0: Pending, 1: Submitted, 2: Approved
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

  // Lifecycle actions for My tenders
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

  // Retrieve stored title from localStorage
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

  // Exact status label matching Tenders page
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

  // Determine ONLY the next valid action per Step 4
  function getNextAction(t, now, milestones = []) {
    const status = Number(t.status);

    // 1. Open
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
      // after revealDeadline
      return {
        description: "Bidding and opening have concluded. Select the winning contractor.",
        buttonText: "Choose the winner",
        action: () => handleFinalizeAward(t.id),
        disabled: false,
        buttonClass: "btn-primary",
      };
    }

    // 2. Awarded
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
      // after escrowDeadline
      return {
        description: "Escrow funding window has expired on-chain.",
        buttonText: "Cancel: not funded in time",
        action: () => handleCancelUnfundedTender(t.id),
        disabled: false,
        buttonClass: "btn-danger",
      };
    }

    // 3. Funded
    if (status === 3) {
      const currentMilestoneIdx = Number(t.completedMilestones || 0);
      const m = milestones && milestones[currentMilestoneIdx];

      if (m) {
        const isWaiting = m.status === 0; // Pending / Waiting
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

        // In grace period
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

    // 4. Completed
    if (status === 4) {
      return {
        description: "All milestones delivered and approved.",
        buttonText: "Tender completed",
        action: null,
        disabled: true,
        buttonClass: "btn-secondary",
      };
    }

    // 5. Failed
    if (status === 5) {
      return {
        description: "Tender concluded with no valid bids.",
        buttonText: "No valid bids",
        action: null,
        disabled: true,
        buttonClass: "btn-secondary",
      };
    }

    // 6. Cancelled
    if (status === 6) {
      return {
        description: "Tender was cancelled by department.",
        buttonText: "Tender cancelled",
        action: null,
        disabled: true,
        buttonClass: "btn-secondary",
      };
    }

    // 7. Defaulted
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
  // Milestone Verification & Registrar Handlers (Preserved & Untouched)
  // ==========================================================================
  const isMilestoneIdxValid =
    !isNaN(verifyMilestoneIdx) && parseInt(verifyMilestoneIdx, 10) >= 0;

  const isVerifierActionAllowed =
    Boolean(selectedVerifyTender) &&
    selectedVerifyTender.status === 3 &&
    isMilestoneIdxValid &&
    isVerifierRole;

  async function handleApproveMilestone() {
    if (!signerContract || !isVerifierActionAllowed || isSubmitting) return;
    try {
      setIsSubmitting(true);
      setNotification({
        active: true,
        title: `Signing Off Milestone #${verifyMilestoneIdx} for Tender #${verifyTenderId}...`,
      });
      const tx = await signerContract.approveMilestone(verifyTenderId, parseInt(verifyMilestoneIdx, 10));
      setNotification({ active: true, title: "Recording verification...", hash: tx.hash });
      await tx.wait();
      setNotification({
        active: false,
        hash: tx.hash,
        title: "Milestone Approved!",
        success: "Your verifier sign-off was registered. If threshold was met, funds were automatically released.",
      });
      if (onRefresh) onRefresh();
    } catch (err) {
      setNotification({ active: false, title: "Milestone Approval Failed", error: parseContractError(err) });
    } finally {
      setIsSubmitting(false);
    }
  }

  const isRegDeptValid = regDeptAddress.trim().length > 0 && ethers.isAddress(regDeptAddress.trim());
  const isRegVerifierValid = regVerifierAddress.trim().length > 0 && ethers.isAddress(regVerifierAddress.trim());
  const isRegBidderAddrValid = regBidderAddress.trim().length > 0 && ethers.isAddress(regBidderAddress.trim());
  const isRegGroupValid = regGroupId.trim().length > 0;
  const isRegIdentityValid = regIdentityId.trim().length > 0;
  const isRegBidderFormValid = isRegBidderAddrValid && isRegGroupValid && isRegIdentityValid;

  const isDebarAddrValid = debarAddress.trim().length > 0 && ethers.isAddress(debarAddress.trim());
  const isDebarReasonValid = debarReason.trim().length > 0;
  const isDebarFormValid = isDebarAddrValid && isDebarReasonValid;

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
        success: `Granted DEPARTMENT_ROLE to ${regDeptAddress.trim()}`,
      });
      setRegDeptAddress("");
      if (onRefresh) onRefresh();
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
        success: `Granted VERIFIER_ROLE to ${regVerifierAddress.trim()}`,
      });
      setRegVerifierAddress("");
      if (onRefresh) onRefresh();
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
        success: `Bidder ${regBidderAddress.trim()} registered with Group ID: ${regGroupId.trim()}`,
      });
      setRegBidderAddress("");
      if (onRefresh) onRefresh();
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
        success: `Wallet ${debarAddress.trim()} is now formally debarred from tender participation.`,
      });
      setDebarAddress("");
      if (onRefresh) onRefresh();
    } catch (err) {
      setNotification({ active: false, title: "Debarment Failed", error: parseContractError(err) });
    } finally {
      setIsSubmitting(false);
    }
  }

  // ==========================================================================
  // Render
  // ==========================================================================
  return (
    <div className="tab-pane officer-tab">
      <div className="officer-grid">
        {/* ================================================================= */}
        {/* STEP 1: Section "Department: publish a tender"                    */}
        {/* ================================================================= */}
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
            {/* Field: Project title */}
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

            {/* Price & Deposit */}
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

            {/* Bidding time & Opening time */}
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

            {/* STEP 2: Collapsed Advanced Section */}
            <details className="advanced-salt-details" style={{ marginTop: "0.25rem" }}>
              <summary className="advanced-salt-summary">
                <span>Advanced Settings</span>
                <span className="details-chevron">▾</span>
              </summary>
              <div className="advanced-salt-content">
                {/* Late penalty per day in PERCENT */}
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

                {/* Funding window & Grace period in hours */}
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

                {/* Verifiers */}
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

                {/* Approvals needed */}
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

                {/* Fixed payment plan as plain text */}
                <div className="form-group">
                  <label>Payment Plan</label>
                  <div className="milestone-plain-text-box" style={{ fontSize: "0.84rem", padding: "0.75rem 0.9rem" }}>
                    Stage 1: 30% (reveal deadline + 20 min), Stage 2: 30% (+40 min), Stage 3: 40% (+60 min)
                  </div>
                </div>
              </div>
            </details>

            {/* Submit Action */}
            <div className="action-button-row" style={{ marginTop: "0.75rem" }}>
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

        {/* ================================================================= */}
        {/* STEP 4: Section "My tenders"                                      */}
        {/* ================================================================= */}
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
            <div className="portal-alert alert-warning">
              <span className="portal-alert-icon">⚠️</span>
              <div className="portal-alert-body">
                <strong>Department Access Required:</strong> Connect a department wallet to manage your tenders.
              </div>
            </div>
          ) : myTenders.length === 0 ? (
            <div className="empty-tender-notice">
              No tenders published by your department wallet yet. Use the form on the left to publish your first tender.
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
                    {/* Tender Header & Status Label */}
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

                    {/* ONLY Next Valid Action & One-Line Description */}
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
      {/* Verifier & Registrar Sections (Preserved & Untouched)             */}
      {/* ================================================================= */}
      <div className="officer-grid secondary-officer-grid" style={{ marginTop: "1.75rem" }}>
        {/* =============================================================== */}
        {/* Verifier Panel: Milestone Verification                          */}
        {/* =============================================================== */}
        <div className="panel">
          <div className="panel-header">
            <div>
              <h3>Milestone Verification</h3>
              <p className="panel-sub" style={{ marginTop: "0.2rem" }}>
                Auditors and engineers verify delivered completion proofs to release milestone escrow.
              </p>
            </div>
            <span className="badge badge-verifier">Verifier Role</span>
          </div>

          <div className="form-card">
            {!isVerifierRole && (
              <div className="portal-alert alert-warning" style={{ marginBottom: "1rem" }}>
                <span className="portal-alert-icon">⚠️</span>
                <div className="portal-alert-body">
                  <strong>Verifier Role Required:</strong> Milestone sign-offs require registered verifier credentials.
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
              <p className="panel-sub" style={{ marginTop: "0.2rem" }}>
                Manage role grants, anti-collusion bidding clusters, and regulatory debarments.
              </p>
            </div>
            <span className="badge badge-registrar">Registrar Role</span>
          </div>

          <div className="form-card registrar-controls">
            {!isRegistrarRole && (
              <div className="portal-alert alert-warning" style={{ marginBottom: "0.5rem" }}>
                <span className="portal-alert-icon">⚠️</span>
                <div className="portal-alert-body">
                  <strong>Registrar Authority Required:</strong> Role grants and debarments require registrar authority.
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
