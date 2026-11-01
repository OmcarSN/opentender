import React, { useState, useEffect, useMemo, useCallback } from "react";
import { ethers } from "ethers";
import {
  CURRENCY_SYMBOL,
  CHAIN_ID,
  CHAIN_NAME,
  getReadOnlyProvider,
  getReadOnlyContract,
} from "../config";
import { generateRandomSalt, computeCommitHash } from "../utils/crypto";
import { parseContractError } from "../utils/errors";

function formatTimeLeft(deadline, currentBlockTime) {
  if (!deadline) return "None";
  const diff = Number(deadline) - Number(currentBlockTime);
  if (diff <= 0) return "Ended";
  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  const minutes = Math.floor((diff % 3600) / 60);
  const seconds = diff % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

function formatMinutesSeconds(seconds) {
  if (seconds <= 0) return "00:00";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function triggerDownloadBackup(tenderId, wallet, amount, salt, chainId) {
  const shortWallet = wallet ? `${wallet.slice(0, 6)}...${wallet.slice(-4)}` : "wallet";
  const backup = {
    tenderId: Number(tenderId),
    wallet: wallet,
    amount: amount.toString(),
    amountEth: amount.toString(), // backwards compatibility
    salt: salt,
    chainId: Number(chainId),
    savedAt: new Date().toISOString(),
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `opentender-bid-${tenderId}-${shortWallet}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function BidderTab({
  account,
  signerContract,
  tenders = [],
  selectedTenderId,
  onSelectTender,
  claimableBalance = 0n,
  onRefresh,
  setNotification,
  isDataLoading = false,
  dataLoadError = null,
  chainId = null,
  roles = {},
  latestBlockTimestamp = 0,
  onConnectWallet,
}) {
  const isWrongNetwork = chainId !== null && Number(chainId) !== CHAIN_ID;
  const currentTime = latestBlockTimestamp || Math.floor(Date.now() / 1000);

  // ---------------------------------------------------------------------------
  // Wallet Balance & Registration Status
  // ---------------------------------------------------------------------------
  const [walletBalance, setWalletBalance] = useState(null);
  const [isBidderRegistered, setIsBidderRegistered] = useState(null);
  const [isBidderDebarred, setIsBidderDebarred] = useState(false);

  useEffect(() => {
    let isMounted = true;
    async function fetchAccountDetails() {
      if (!account) {
        if (isMounted) {
          setWalletBalance(null);
          setIsBidderRegistered(false);
          setIsBidderDebarred(false);
        }
        return;
      }
      try {
        const provider = getReadOnlyProvider();
        const normAccount = ethers.getAddress(account);
        const bal = await provider.getBalance(normAccount);
        if (isMounted) setWalletBalance(bal);
      } catch {
        if (isMounted) setWalletBalance(null);
      }

      if (roles && typeof roles.isBidder === "boolean") {
        if (isMounted) {
          setIsBidderRegistered(roles.isBidder);
          setIsBidderDebarred(Boolean(roles.isDebarred));
        }
      } else {
        try {
          const contract = getReadOnlyContract();
          const normAccount = ethers.getAddress(account);
          const status = await contract.getBidderStatus(normAccount);
          if (isMounted) {
            setIsBidderRegistered(Boolean(status.registered));
            setIsBidderDebarred(Boolean(status.debarred));
          }
        } catch {
          if (isMounted) {
            setIsBidderRegistered(false);
            setIsBidderDebarred(false);
          }
        }
      }
    }
    fetchAccountDetails();
  }, [account, roles, latestBlockTimestamp]);

  // ---------------------------------------------------------------------------
  // On-Chain User Commitments for all tenders
  // ---------------------------------------------------------------------------
  const [userCommitments, setUserCommitments] = useState({});

  useEffect(() => {
    let isMounted = true;
    async function fetchCommitments() {
      if (!account || !tenders || tenders.length === 0) {
        if (isMounted) setUserCommitments({});
        return;
      }
      try {
        const contract = getReadOnlyContract();
        const records = {};
        await Promise.all(
          tenders.map(async (t) => {
            try {
              const res = await contract.getCommitment(t.id, account);
              records[t.id] = {
                committed: Boolean(res.committed),
                revealed: Boolean(res.revealed),
                bondClaimed: Boolean(res.bondClaimed),
                commitTime: Number(res.commitTime),
              };
            } catch {
              records[t.id] = { committed: false, revealed: false, bondClaimed: false, commitTime: 0 };
            }
          })
        );
        if (isMounted) {
          setUserCommitments((prev) => {
            const prevKeys = Object.keys(prev);
            const nextKeys = Object.keys(records);
            if (prevKeys.length !== nextKeys.length) return records;
            const changed = nextKeys.some((k) => {
              const p = prev[k];
              const n = records[k];
              return (
                !p ||
                p.committed !== n.committed ||
                p.revealed !== n.revealed ||
                p.bondClaimed !== n.bondClaimed ||
                p.commitTime !== n.commitTime
              );
            });
            return changed ? records : prev;
          });
        }
      } catch {
        // Ignore read errors
      }
    }
    fetchCommitments();
  }, [account, tenders, latestBlockTimestamp]);

  // ---------------------------------------------------------------------------
  // STEP 2: Tender Dropdown Filtering & Selection (Open & before commitDeadline)
  // ---------------------------------------------------------------------------
  const commitEligibleTenders = useMemo(() => {
    return tenders.filter((t) => {
      if (t.status !== 1) return false;
      if (t.commitDeadline && currentTime > t.commitDeadline) return false;
      return true;
    });
  }, [tenders, currentTime]);

  const [commitTenderId, setCommitTenderId] = useState("");

  // Pre-select latest relevant tender
  useEffect(() => {
    if (commitEligibleTenders.length > 0) {
      const exists = commitEligibleTenders.some((t) => String(t.id) === String(commitTenderId));
      if (!commitTenderId || !exists) {
        const latest = commitEligibleTenders[commitEligibleTenders.length - 1];
        setCommitTenderId(String(latest.id));
      }
    } else {
      setCommitTenderId("");
    }
  }, [commitEligibleTenders, commitTenderId]);

  // Synchronize when parent prop selectedTenderId changes
  useEffect(() => {
    if (selectedTenderId) {
      const foundInCommit = commitEligibleTenders.some((t) => Number(t.id) === Number(selectedTenderId));
      if (foundInCommit) {
        setCommitTenderId(String(selectedTenderId));
      }
    }
  }, [selectedTenderId, commitEligibleTenders]);

  const selectedCommitTender = useMemo(() => {
    return tenders.find((t) => String(t.id) === String(commitTenderId)) || null;
  }, [tenders, commitTenderId]);

  // ---------------------------------------------------------------------------
  // STEP 3: Card "1. Place a sealed bid"
  // ---------------------------------------------------------------------------
  const [bidAmount, setBidAmount] = useState("");
  const [salt, setSalt] = useState("");
  const [backupDownloadNotice, setBackupDownloadNotice] = useState(null);
  const [isSubmittingCommit, setIsSubmittingCommit] = useState(false);

  const ceilingNum = selectedCommitTender
    ? parseFloat(ethers.formatEther(selectedCommitTender.ceilingPrice))
    : 0;
  const depositFormatted = selectedCommitTender
    ? ethers.formatEther(selectedCommitTender.bidBond)
    : "0";
  const depositWei = selectedCommitTender ? BigInt(selectedCommitTender.bidBond) : 0n;

  const bidAmountNum = parseFloat(bidAmount);
  const isBidAmountValid = !isNaN(bidAmountNum) && bidAmountNum > 0 && bidAmountNum <= ceilingNum;

  const alreadyCommitted = Boolean(selectedCommitTender && userCommitments[selectedCommitTender.id]?.committed);
  const hasEnoughDeposit = walletBalance !== null ? walletBalance >= depositWei : true;

  // Determine disabled reason for placing sealed bid
  let commitDisabledReason = null;
  if (!account) {
    commitDisabledReason = "Connect your wallet to bid.";
  } else if (isWrongNetwork) {
    commitDisabledReason = `Wrong Network — Switch to ${CHAIN_NAME}`;
  } else if (!selectedCommitTender) {
    commitDisabledReason = "No tender is taking bids right now.";
  } else if (Number(selectedCommitTender.status) !== 1) {
    commitDisabledReason = "This tender is not open for bidding.";
  } else if (selectedCommitTender.commitDeadline && currentTime > selectedCommitTender.commitDeadline) {
    if (selectedCommitTender.revealDeadline && currentTime <= selectedCommitTender.revealDeadline) {
      commitDisabledReason = "Bidding phase ended. This tender is currently in the Opening phase.";
    } else {
      commitDisabledReason = "Bidding has closed for this tender.";
    }
  } else if (isBidderRegistered === false) {
    commitDisabledReason = "Your wallet is not registered as a bidder";
  } else if (isBidderDebarred) {
    commitDisabledReason = "Your wallet is blocked from bidding";
  } else if (alreadyCommitted) {
    commitDisabledReason = "You already placed a bid on this tender";
  } else if (!hasEnoughDeposit) {
    commitDisabledReason = `Not enough ${CURRENCY_SYMBOL} for the deposit`;
  } else if (!bidAmount) {
    commitDisabledReason = "Enter your price";
  } else if (isNaN(bidAmountNum) || bidAmountNum <= 0) {
    commitDisabledReason = "Price must be strictly positive (> 0)";
  } else if (bidAmountNum > ceilingNum) {
    commitDisabledReason = `Price exceeds maximum of ${ceilingNum} ${CURRENCY_SYMBOL}`;
  } else if (isSubmittingCommit) {
    commitDisabledReason = "Placing sealed bid...";
  }

  const canSubmitCommit = !commitDisabledReason && isBidAmountValid && !isSubmittingCommit;

  async function handlePlaceSealedBid(e) {
    e.preventDefault();
    if (!account) {
      if (onConnectWallet) onConnectWallet();
      return;
    }
    if (!selectedCommitTender) return;

    if (Number(selectedCommitTender.status) !== 1 || (selectedCommitTender.commitDeadline && currentTime > selectedCommitTender.commitDeadline)) {
      setNotification({
        active: false,
        title: "Bidding Unavailable",
        error: "Bidding has closed for this tender. Commitments are no longer accepted.",
      });
      return;
    }

    if (isBidderRegistered === false) {
      setNotification({
        active: false,
        title: "Registration Required",
        error: "Your wallet is not registered as a bidder. Contact the tender administrator.",
      });
      return;
    }

    if (isBidderDebarred) {
      setNotification({
        active: false,
        title: "Wallet Blocked",
        error: "Your wallet is blocked from bidding on tenders.",
      });
      return;
    }

    if (!canSubmitCommit || !signerContract) return;

    try {
      setIsSubmittingCommit(true);
      setBackupDownloadNotice(null);

      // Ensure a valid 32-byte secret code exists
      const isValidSalt = /^0x[0-9a-fA-F]{64}$/.test(salt.trim());
      const saltToUse = isValidSalt ? salt.trim() : generateRandomSalt();
      setSalt(saltToUse);

      // Compute commit hash using existing crypto function
      const commitHash = computeCommitHash(
        bidAmount,
        saltToUse,
        account,
        selectedCommitTender.id,
        CHAIN_ID
      );

      // 1. Save {tenderId, wallet, amount, salt, chainId} to localStorage
      const storageKey = `opentender_bid_${selectedCommitTender.id}_${account.toLowerCase()}`;
      try {
        localStorage.setItem(
          storageKey,
          JSON.stringify({
            tenderId: Number(selectedCommitTender.id),
            wallet: account,
            amount: bidAmount,
            salt: saltToUse,
            chainId: Number(CHAIN_ID),
            commitHash: commitHash,
            savedAt: new Date().toISOString(),
          })
        );
      } catch {
        // Storage notice
      }

      // 2. Download backup JSON file named opentender-bid-<tenderId>-<short wallet>.json BEFORE sending tx
      triggerDownloadBackup(selectedCommitTender.id, account, bidAmount, saltToUse, CHAIN_ID);
      const downloadNoticeText = "Saved backup file. Keep it safe, you need it to open your bid.";
      setBackupDownloadNotice(downloadNoticeText);

      setNotification({
        active: true,
        title: `Placing sealed bid for Tender #${selectedCommitTender.id}...`,
      });

      // 3. Send commitBid with value = deposit
      const tx = await signerContract.commitBid(selectedCommitTender.id, commitHash, {
        value: selectedCommitTender.bidBond,
      });

      setNotification({
        active: true,
        title: "Waiting for block confirmation...",
        hash: tx.hash,
      });

      await tx.wait();

      setNotification({
        active: false,
        hash: tx.hash,
        title: "Sealed Bid Placed Successfully!",
        success: `Your sealed bid was recorded on-chain. Deposit of ${depositFormatted} ${CURRENCY_SYMBOL} is locked in escrow. ${downloadNoticeText}`,
      });

      // Refresh data
      if (onRefresh) onRefresh();
    } catch (err) {
      const msg = parseContractError(err);
      setNotification({ active: false, title: "Failed to place sealed bid", error: msg });
    } finally {
      setIsSubmittingCommit(false);
    }
  }

  // ---------------------------------------------------------------------------
  // STEP 4: Card "2. Open your bid"
  // ---------------------------------------------------------------------------
  const revealEligibleTenders = useMemo(() => {
    return tenders.filter((t) => {
      if (t.status !== 1) return false;
      if (!t.commitDeadline || !t.revealDeadline) return false;
      const isInRevealWindow = currentTime > t.commitDeadline && currentTime <= t.revealDeadline;
      const isCommitted = userCommitments[t.id]?.committed;
      const isNotRevealed = !userCommitments[t.id]?.revealed;
      return isInRevealWindow && isCommitted && isNotRevealed;
    });
  }, [tenders, currentTime, userCommitments]);

  // All open tenders where user committed (for displaying opening countdowns or reveal states)
  const userOpenBids = useMemo(() => {
    return tenders.filter((t) => t.status === 1 && userCommitments[t.id]?.committed);
  }, [tenders, userCommitments]);

  const [revealTenderId, setRevealTenderId] = useState("");
  const [revealAmount, setRevealAmount] = useState("");
  const [revealSalt, setRevealSalt] = useState("");
  const [hasSavedBackup, setHasSavedBackup] = useState(false);
  const [backupFileNotice, setBackupFileNotice] = useState(null);
  const [isSubmittingReveal, setIsSubmittingReveal] = useState(false);

  // Auto pre-select latest tender in reveal window or latest committed tender
  useEffect(() => {
    if (revealEligibleTenders.length > 0) {
      const exists = revealEligibleTenders.some((t) => String(t.id) === String(revealTenderId));
      if (!revealTenderId || !exists) {
        setRevealTenderId(String(revealEligibleTenders[revealEligibleTenders.length - 1].id));
      }
    } else if (userOpenBids.length > 0) {
      const exists = userOpenBids.some((t) => String(t.id) === String(revealTenderId));
      if (!revealTenderId || !exists) {
        setRevealTenderId(String(userOpenBids[userOpenBids.length - 1].id));
      }
    }
  }, [revealEligibleTenders, userOpenBids, revealTenderId]);

  // Auto-fill amount and secret code (salt) from localStorage
  useEffect(() => {
    if (!account || !revealTenderId) {
      setHasSavedBackup(false);
      return;
    }
    const key = `opentender_bid_${revealTenderId}_${account.toLowerCase()}`;
    const saved = localStorage.getItem(key);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const savedAmt = parsed.amount || parsed.amountEth;
        const savedSalt = parsed.salt;
        if (savedAmt && savedSalt) {
          setRevealAmount(String(savedAmt));
          setRevealSalt(String(savedSalt).trim());
          setHasSavedBackup(true);
          setBackupFileNotice({
            type: "info",
            message: `Retrieved saved bid credentials for Tender #${revealTenderId} from browser storage.`,
          });
          return;
        }
      } catch {
        // Fallback
      }
    }
    setHasSavedBackup(false);
  }, [revealTenderId, account]);

  function handleBackupFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    setBackupFileNotice(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);
        if (!data || typeof data !== "object") {
          setBackupFileNotice({ type: "error", message: "Invalid JSON backup file." });
          return;
        }

        const amt = data.amount || data.amountEth;
        const slt = data.salt;

        if (!amt || !slt) {
          setBackupFileNotice({
            type: "error",
            message: "Backup file is missing your price or secret code.",
          });
          return;
        }

        if (!/^0x[0-9a-fA-F]{64}$/.test(String(slt).trim())) {
          setBackupFileNotice({
            type: "error",
            message: "Invalid secret code inside backup file. Must be 32-byte hex.",
          });
          return;
        }

        setRevealAmount(String(amt));
        setRevealSalt(String(slt).trim());

        if (data.tenderId) {
          setRevealTenderId(String(data.tenderId));
        }

        setHasSavedBackup(true);
        setBackupFileNotice({
          type: "success",
          message: `Backup file loaded successfully for Tender #${data.tenderId || "?"} (${amt} ${CURRENCY_SYMBOL}). Ready to open your bid.`,
        });
      } catch (err) {
        setBackupFileNotice({ type: "error", message: `Failed to read file: ${err.message}` });
      }
    };
    reader.readAsText(file);
  }

  const selectedRevealTender = useMemo(() => {
    return tenders.find((t) => String(t.id) === String(revealTenderId)) || null;
  }, [tenders, revealTenderId]);

  const revealCommitment = selectedRevealTender ? userCommitments[selectedRevealTender.id] : null;

  // Compute disabled reason for opening bid
  let revealDisabledReason = null;
  if (!account) {
    revealDisabledReason = "Connect your wallet to bid.";
  } else if (isWrongNetwork) {
    revealDisabledReason = `Wrong Network — Switch to ${CHAIN_NAME}`;
  } else if (!selectedRevealTender) {
    revealDisabledReason = "No bids to open right now.";
  } else if (!revealCommitment || !revealCommitment.committed) {
    revealDisabledReason = "You did not place a bid on this tender";
  } else if (selectedRevealTender.commitDeadline && currentTime <= selectedRevealTender.commitDeadline) {
    const diff = Number(selectedRevealTender.commitDeadline) - Number(currentTime);
    revealDisabledReason = `Opening starts in ${formatMinutesSeconds(diff)}`;
  } else if (selectedRevealTender.revealDeadline && currentTime > selectedRevealTender.revealDeadline) {
    revealDisabledReason = "Opening is closed";
  } else if (revealCommitment.revealed) {
    revealDisabledReason = "You already opened your bid on this tender";
  } else if (!revealAmount || isNaN(parseFloat(revealAmount)) || parseFloat(revealAmount) <= 0) {
    revealDisabledReason = "Enter the exact price from your backup file";
  } else if (!revealSalt || !/^0x[0-9a-fA-F]{64}$/.test(revealSalt.trim())) {
    revealDisabledReason = "Enter the 32-byte secret code from your backup file";
  } else if (isSubmittingReveal) {
    revealDisabledReason = "Opening bid...";
  }

  const canSubmitReveal = !revealDisabledReason && !isSubmittingReveal;

  async function handleOpenBid(e) {
    e.preventDefault();
    if (!canSubmitReveal || !selectedRevealTender || !signerContract) return;

    try {
      setIsSubmittingReveal(true);
      setNotification({ active: true, title: `Opening bid for Tender #${selectedRevealTender.id}...` });

      const amountWei = ethers.parseEther(revealAmount.toString());
      const tx = await signerContract.revealBid(
        selectedRevealTender.id,
        amountWei,
        revealSalt.trim()
      );

      setNotification({ active: true, title: "Waiting for block confirmation...", hash: tx.hash });
      await tx.wait();

      setNotification({
        active: false,
        hash: tx.hash,
        title: "Bid Opened On-Chain!",
        success: `Successfully opened your bid of ${revealAmount} ${CURRENCY_SYMBOL}. Your price is registered for evaluation.`,
      });

      if (onRefresh) onRefresh();
    } catch (err) {
      const msg = parseContractError(err);
      setNotification({ active: false, title: "Failed to open bid", error: msg });
    } finally {
      setIsSubmittingReveal(false);
    }
  }

  // ---------------------------------------------------------------------------
  // STEP 5: Card "3. If you win: submit proof of work"
  // ---------------------------------------------------------------------------
  const fundedTenders = useMemo(() => {
    if (!account) return [];
    return tenders.filter((t) => {
      return (
        t.status === 3 &&
        t.winningBidder &&
        t.winningBidder.toLowerCase() === account.toLowerCase()
      );
    });
  }, [tenders, account]);

  const [fundedTenderId, setFundedTenderId] = useState("");
  const [proofText, setProofText] = useState("");
  const [isSubmittingProof, setIsSubmittingProof] = useState(false);

  useEffect(() => {
    if (fundedTenders.length > 0) {
      const exists = fundedTenders.some((t) => String(t.id) === String(fundedTenderId));
      if (!fundedTenderId || !exists) {
        setFundedTenderId(String(fundedTenders[fundedTenders.length - 1].id));
      }
    } else {
      setFundedTenderId("");
    }
  }, [fundedTenders, fundedTenderId]);

  const selectedFundedTender = useMemo(() => {
    return tenders.find((t) => String(t.id) === String(fundedTenderId)) || null;
  }, [tenders, fundedTenderId]);

  // Query milestone details for the selected funded tender
  const [fundedMilestones, setFundedMilestones] = useState([]);
  const [isLoadingMilestones, setIsLoadingMilestones] = useState(false);

  const fetchFundedMilestones = useCallback(async () => {
    if (!fundedTenderId) {
      setFundedMilestones([]);
      return;
    }
    try {
      setIsLoadingMilestones(true);
      const contract = getReadOnlyContract();
      const ms = await contract.getMilestones(fundedTenderId);
      setFundedMilestones(
        ms.map((m) => ({
          percentageBps: Number(m.percentageBps),
          dueDate: Number(m.dueDate),
          submittedAt: Number(m.submittedAt),
          evidenceHash: m.evidenceHash,
          approvalCount: Number(m.approvalCount),
          status: Number(m.status),
          payoutAmount: m.payoutAmount,
          penaltyDeducted: m.penaltyDeducted,
        }))
      );
    } catch {
      setFundedMilestones([]);
    } finally {
      setIsLoadingMilestones(false);
    }
  }, [fundedTenderId]);

  useEffect(() => {
    fetchFundedMilestones();
  }, [fetchFundedMilestones, latestBlockTimestamp]);

  // Milestone index chosen automatically from completed milestones counter
  const autoMilestoneIndex = selectedFundedTender
    ? Number(selectedFundedTender.completedMilestones || 0)
    : 0;

  // OpenTender contract enum: MilestoneStatus { Pending = 0, Submitted = 1, Approved = 2 }
  const currentMilestone =
    fundedMilestones && fundedMilestones.length > autoMilestoneIndex
      ? fundedMilestones[autoMilestoneIndex]
      : null;
  const isCurrentMilestoneSubmitted =
    currentMilestone !== null && Number(currentMilestone.status) === 1; // MilestoneStatus.Submitted
  const areAllMilestonesDone =
    fundedMilestones.length > 0 && autoMilestoneIndex >= fundedMilestones.length;

  let proofDisabledReason = null;
  if (!account) {
    proofDisabledReason = "Connect your wallet to bid.";
  } else if (isWrongNetwork) {
    proofDisabledReason = `Wrong Network — Switch to ${CHAIN_NAME}`;
  } else if (!selectedFundedTender) {
    proofDisabledReason = "You have no active awarded contracts in progress.";
  } else if (isLoadingMilestones) {
    proofDisabledReason = "Loading milestone data...";
  } else if (areAllMilestonesDone) {
    proofDisabledReason = "All milestones for this contract have been completed.";
  } else if (isCurrentMilestoneSubmitted) {
    proofDisabledReason =
      "Milestone proof is already submitted and awaiting verifier approval.";
  } else if (!proofText.trim()) {
    proofDisabledReason = "Describe or paste a link to your proof";
  } else if (isSubmittingProof) {
    proofDisabledReason = "Submitting proof...";
  }

  const canSubmitProof = !proofDisabledReason && !isSubmittingProof;

  async function handleSubmitProof(e) {
    e.preventDefault();
    if (!canSubmitProof || !selectedFundedTender || !signerContract || isCurrentMilestoneSubmitted) return;

    try {
      setIsSubmittingProof(true);
      const text = proofText.trim();
      const evidenceHash =
        text.startsWith("0x") && text.length === 66
          ? text
          : ethers.keccak256(ethers.toUtf8Bytes(text));

      setNotification({
        active: true,
        title: `Submitting proof of work for Milestone #${autoMilestoneIndex + 1}...`,
      });

      const tx = await signerContract.submitMilestone(
        selectedFundedTender.id,
        autoMilestoneIndex,
        evidenceHash
      );

      setNotification({ active: true, title: "Confirming submission on-chain...", hash: tx.hash });
      await tx.wait();

      setNotification({
        active: false,
        hash: tx.hash,
        title: "Proof of Work Submitted!",
        success: `Proof registered for Milestone #${autoMilestoneIndex + 1}. Awaiting verifier sign-off.`,
      });

      setProofText("");
      await fetchFundedMilestones();
      if (onRefresh) onRefresh();
    } catch (err) {
      const msg = parseContractError(err);
      setNotification({ active: false, title: "Submission Failed", error: msg });
    } finally {
      setIsSubmittingProof(false);
    }
  }

  // ---------------------------------------------------------------------------
  // STEP 6: Card "My money" (Waiting for you & Deposits you can get back)
  // ---------------------------------------------------------------------------
  const [isSubmittingWithdraw, setIsSubmittingWithdraw] = useState(false);
  const [refundableTenders, setRefundableTenders] = useState([]);
  const [refundingTenderId, setRefundingTenderId] = useState(null);
  const [refundCheckTrigger, setRefundCheckTrigger] = useState(0);

  // Check refundable tenders via staticCall with smart pre-filtering and deadline scheduling
  useEffect(() => {
    let isMounted = true;
    let deadlineTimer = null;

    async function checkRefundableDeposits() {
      if (!signerContract || !account || isWrongNetwork || !tenders || tenders.length === 0) {
        if (isMounted) setRefundableTenders([]);
        return;
      }

      // Pre-filter tenders based on contract invariants to eliminate doomed RPC calls:
      // In OpenTender.sol, claimBondRefund only succeeds for status Cancelled (6) or Awarded (2), Funded (3), Completed (4), Defaulted (7).
      // Status None (0), Open (1), and Failed (5) always revert with BondNotRefundable.
      const candidateTenders = tenders.filter((t) => {
        const s = Number(t.status);
        if (s !== 2 && s !== 3 && s !== 4 && s !== 6 && s !== 7) {
          return false;
        }

        const c = userCommitments[t.id];
        if (c) {
          // If we have commitment data for this tender:
          // Must have committed and bond must not already be claimed
          if (!c.committed || c.bondClaimed) return false;
          // For non-cancelled tenders, losing bidder must have revealed and cannot be the winner
          if (s !== 6) {
            if (!c.revealed) return false;
            if (t.winningBidder && t.winningBidder.toLowerCase() === account.toLowerCase()) {
              return false;
            }
          }
        }
        return true;
      });

      if (candidateTenders.length === 0) {
        if (isMounted) setRefundableTenders([]);
        return;
      }

      // Run staticCall in parallel with safe individual error handling
      try {
        const results = await Promise.allSettled(
          candidateTenders.map(async (t) => {
            await signerContract.claimBondRefund.staticCall(t.id);
            return t;
          })
        );

        if (isMounted) {
          const eligible = [];
          results.forEach((res) => {
            if (res.status === "fulfilled" && res.value) {
              eligible.push(res.value);
            }
          });
          setRefundableTenders(eligible);
        }
      } catch {
        if (isMounted) setRefundableTenders([]);
      }
    }

    // Schedule a timer around the next earliest deadline among active tenders rather than polling
    const now = Math.floor(Date.now() / 1000);
    let earliestDeadline = null;

    for (const t of tenders) {
      const c = userCommitments[t.id];
      // Only schedule timers for tenders the user has committed to or that are active
      if (!c || c.committed) {
        const deadlines = [
          Number(t.commitDeadline || 0),
          Number(t.revealDeadline || 0),
          Number(t.escrowFundingDeadline || 0),
        ];
        for (const dl of deadlines) {
          if (dl > now) {
            if (earliestDeadline === null || dl < earliestDeadline) {
              earliestDeadline = dl;
            }
          }
        }
      }
    }

    if (earliestDeadline !== null) {
      const delayMs = Math.max(1000, (earliestDeadline - now) * 1000 + 1000);
      // Only schedule if within next 24 hours
      if (delayMs <= 86400000) {
        deadlineTimer = setTimeout(() => {
          if (isMounted) {
            setRefundCheckTrigger((n) => n + 1);
            if (onRefresh) onRefresh();
          }
        }, delayMs);
      }
    }

    checkRefundableDeposits();

    return () => {
      isMounted = false;
      if (deadlineTimer) clearTimeout(deadlineTimer);
    };
  }, [signerContract, account, isWrongNetwork, tenders, userCommitments, refundCheckTrigger, onRefresh]);

  async function handleWithdrawWaitingMoney() {
    if (!signerContract || !claimableBalance || claimableBalance === 0n || isSubmittingWithdraw) return;

    try {
      setIsSubmittingWithdraw(true);
      setNotification({ active: true, title: "Withdrawing money waiting for you..." });

      const tx = await signerContract.withdrawPullBalance();
      setNotification({ active: true, title: "Confirming withdrawal...", hash: tx.hash });
      await tx.wait();

      setNotification({
        active: false,
        hash: tx.hash,
        title: "Withdrawal Complete",
        success: `Transferred ${ethers.formatEther(claimableBalance)} ${CURRENCY_SYMBOL} directly to your wallet.`,
      });

      if (onRefresh) onRefresh();
    } catch (err) {
      const msg = parseContractError(err);
      setNotification({ active: false, title: "Withdrawal Failed", error: msg });
    } finally {
      setIsSubmittingWithdraw(false);
    }
  }

  async function handleClaimDepositBack(tenderId) {
    if (!signerContract || !tenderId || isWrongNetwork || refundingTenderId) return;

    try {
      setRefundingTenderId(tenderId);
      setNotification({ active: true, title: `Claiming deposit for Tender #${tenderId}...` });

      const tx = await signerContract.claimBondRefund(tenderId);
      setNotification({ active: true, title: "Confirming deposit return...", hash: tx.hash });
      await tx.wait();

      setNotification({
        active: false,
        hash: tx.hash,
        title: "Deposit Returned!",
        success: "Your deposit has been returned directly to your wallet.",
      });

      // Instantly update local state so UI updates without waiting for re-fetch
      setRefundableTenders((prev) => prev.filter((t) => Number(t.id) !== Number(tenderId)));
      setUserCommitments((prev) => ({
        ...prev,
        [tenderId]: { ...(prev[tenderId] || {}), bondClaimed: true },
      }));

      // Trigger fresh eligibility check
      setRefundCheckTrigger((n) => n + 1);

      if (onRefresh) onRefresh();
    } catch (err) {
      const msg = parseContractError(err);
      setNotification({ active: false, title: "Failed to get deposit back", error: msg });
    } finally {
      setRefundingTenderId(null);
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="tab-pane bidder-tab">
      {/* STEP 1: Page Title & Subline */}
      <div className="bid-page-header">
        <h2 className="bid-page-title">Bid on a tender</h2>
        <p className="bid-page-subline">
          Your price stays secret until the opening. Save the backup file, you need it to open your bid.
        </p>

        {!account && (
          <div className="portal-alert alert-warning" style={{ marginTop: "1rem" }}>
            <span className="portal-alert-icon">⚠</span>
            <div className="portal-alert-body">
              <strong>Wallet Disconnected:</strong> Connect your wallet to bid.
            </div>
          </div>
        )}

        {account && isBidderRegistered === false && (
          <div className="portal-alert alert-warning" style={{ marginTop: "1rem" }}>
            <span className="portal-alert-icon">⚠</span>
            <div className="portal-alert-body">
              <strong>Registration Required:</strong> Only approved vendors can participate in bidding. Contact the tender administrator to register your wallet.
            </div>
          </div>
        )}

        {account && isBidderDebarred && (
          <div className="portal-alert alert-warning" style={{ marginTop: "1rem" }}>
            <span className="portal-alert-icon">⚠</span>
            <div className="portal-alert-body">
              <strong>Wallet Blocked:</strong> Your wallet is blocked from bidding. Contact the tender administrator.
            </div>
          </div>
        )}

        {isWrongNetwork && (
          <div className="portal-alert alert-warning" style={{ marginTop: "1rem" }}>
            <span className="portal-alert-icon">⚠</span>
            <div className="portal-alert-body">
              <strong>Wrong Network:</strong> OpenTender requires <strong>{CHAIN_NAME}</strong> (Chain ID: {CHAIN_ID}). All actions are disabled until you switch.
            </div>
          </div>
        )}

        {dataLoadError && !isWrongNetwork && (
          <div className="portal-alert alert-error" style={{ marginTop: "1rem" }}>
            <span className="portal-alert-icon">✖</span>
            <div className="portal-alert-body">
              <strong>Blockchain Unreachable:</strong> {dataLoadError}
              <button type="button" className="btn-alert-action" onClick={onRefresh}>
                Retry Connection
              </button>
            </div>
          </div>
        )}
      </div>

      {/* STEP 2: Tender Dropdown Selector & Details */}
      <div className="panel bid-tender-selector-panel" style={{ marginBottom: "1.5rem" }}>
        <div className="form-group">
          <label style={{ fontSize: "0.9rem", fontWeight: "600", color: "#f8fafc" }}>
            Select Tender Taking Bids
          </label>
          {commitEligibleTenders.length === 0 ? (
            <div className="empty-tender-notice">
              No tender is taking bids right now.
            </div>
          ) : (
            <select
              value={commitTenderId}
              disabled={!account || isWrongNetwork}
              onChange={(e) => {
                setCommitTenderId(e.target.value);
                if (onSelectTender) onSelectTender(Number(e.target.value));
              }}
              style={{ fontSize: "0.95rem" }}
            >
              {commitEligibleTenders.map((t) => (
                <option key={t.id} value={t.id}>
                  Tender #{t.id} — Max: {ethers.formatEther(t.ceilingPrice)} {CURRENCY_SYMBOL} (Deposit: {ethers.formatEther(t.bidBond)} {CURRENCY_SYMBOL})
                </option>
              ))}
            </select>
          )}

          {selectedCommitTender && (
            <div className="tender-stat-strip" style={{ marginTop: "0.85rem" }}>
              <div className="tender-stat-chip">
                <span className="stat-label">Maximum price</span>
                <span className="stat-val">
                  {ethers.formatEther(selectedCommitTender.ceilingPrice)} {CURRENCY_SYMBOL}
                </span>
              </div>
              <div className="tender-stat-chip">
                <span className="stat-label">Deposit</span>
                <span className="stat-val">
                  {ethers.formatEther(selectedCommitTender.bidBond)} {CURRENCY_SYMBOL}
                </span>
              </div>
              <div className="tender-stat-chip">
                <span className="stat-label">Time left</span>
                <span className="stat-val highlight-timer">
                  {formatTimeLeft(selectedCommitTender.commitDeadline, currentTime)}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Two Column Grid: Card 1 & Card 2 */}
      <div className="bidder-grid">
        {/* ===================================================================
            STEP 3: Card "1. Place a sealed bid"
           =================================================================== */}
        <div className="panel">
          <div className="panel-header">
            <div>
              <h3>1. Place a sealed bid</h3>
              <p className="panel-sub">Submit your secret price with an escrow deposit.</p>
            </div>
            <span className="badge badge-shield">Bidding Phase</span>
          </div>

          <form onSubmit={handlePlaceSealedBid} className="form-card">
            {/* Field "Your price" */}
            <div className="form-group">
              <label>Your price ({CURRENCY_SYMBOL})</label>
              <input
                type="number"
                step="0.0001"
                min="0.0001"
                placeholder={selectedCommitTender ? `e.g. ${(ceilingNum * 0.85).toFixed(4)}` : "Select tender first"}
                value={bidAmount}
                disabled={!account || !selectedCommitTender || isWrongNetwork || alreadyCommitted || (selectedCommitTender.commitDeadline && currentTime > selectedCommitTender.commitDeadline)}
                onChange={(e) => setBidAmount(e.target.value)}
                required
              />
              <div className="field-hint">
                Maximum {ceilingNum} {CURRENCY_SYMBOL}
              </div>
            </div>

            {/* Clear deposit notice */}
            {selectedCommitTender && (
              <div className="deposit-callout-box">
                You will lock {depositFormatted} {CURRENCY_SYMBOL} as a deposit. You get it back if you do not win, or after you finish the work if you win.
              </div>
            )}

            {/* Collapsed Advanced Section for Secret Code */}
            <details className="advanced-salt-details">
              <summary className="advanced-salt-summary">
                <span>Advanced: Secret Code</span>
                <span className="details-chevron">▾</span>
              </summary>
              <div className="advanced-salt-content">
                <div className="form-group">
                  <div className="label-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <label>Secret Code (32-byte hex)</label>
                    <button
                      type="button"
                      className="btn-mini btn-secondary"
                      disabled={!account || isWrongNetwork}
                      onClick={() => setSalt(generateRandomSalt())}
                      title="Generate new random 32-byte secret code"
                    >
                      Generate New Secret Code
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="Auto-generated on submission if left blank"
                    value={salt}
                    disabled={!account || isWrongNetwork || alreadyCommitted}
                    onChange={(e) => setSalt(e.target.value)}
                  />
                  <div className="field-hint">
                    Generated automatically when you place your bid. Saved into your backup file.
                  </div>
                </div>
              </div>
            </details>

            {backupDownloadNotice && (
              <div className="portal-alert alert-success" style={{ padding: "0.6rem 0.85rem" }}>
                <div className="portal-alert-body">{backupDownloadNotice}</div>
              </div>
            )}

            {/* Action Button & Inline Disabled Reason */}
            <div className="action-button-row">
              <button
                type="submit"
                className="btn btn-primary btn-block"
                disabled={!canSubmitCommit}
              >
                {isSubmittingCommit ? "Placing sealed bid..." : "Place sealed bid"}
              </button>
              {commitDisabledReason && (
                <div className="btn-disabled-reason">
                  <span className="reason-bullet">ℹ</span> {commitDisabledReason}
                </div>
              )}
            </div>
          </form>
        </div>

        {/* ===================================================================
            STEP 4: Card "2. Open your bid"
           =================================================================== */}
        <div className="panel">
          <div className="panel-header">
            <div>
              <h3>2. Open your bid</h3>
              <p className="panel-sub">Open your secret bid on-chain once the bidding phase ends.</p>
            </div>
            <span className="badge badge-reveal">Opening Phase</span>
          </div>

          <form onSubmit={handleOpenBid} className="form-card">
            {/* Tender Dropdown for Opening */}
            <div className="form-group">
              <label>Select Tender to Open</label>
              {tenders.filter((t) => t.status === 1).length === 0 ? (
                <div className="empty-tender-notice">No open tenders available.</div>
              ) : (
                <select
                  value={revealTenderId}
                  disabled={!account || isWrongNetwork}
                  onChange={(e) => setRevealTenderId(e.target.value)}
                  style={{ fontSize: "0.95rem" }}
                >
                  {revealEligibleTenders.length === 0 && (
                    <option value="" disabled>
                      -- No bids ready to open right now --
                    </option>
                  )}
                  {revealEligibleTenders.map((t) => (
                    <option key={t.id} value={t.id}>
                      Tender #{t.id} — Ready to open
                    </option>
                  ))}
                  {/* List other open tenders where user bid */}
                  {userOpenBids
                    .filter((t) => !revealEligibleTenders.some((rt) => rt.id === t.id))
                    .map((t) => {
                      const isPreReveal = t.commitDeadline && currentTime <= t.commitDeadline;
                      const isPostReveal = t.revealDeadline && currentTime > t.revealDeadline;
                      const phaseNote = isPreReveal
                        ? `(Opening in ${formatMinutesSeconds(t.commitDeadline - currentTime)})`
                        : isPostReveal
                        ? "(Opening is closed)"
                        : "";
                      return (
                        <option key={t.id} value={t.id}>
                          Tender #{t.id} {phaseNote}
                        </option>
                      );
                    })}
                  {/* Fallback to any remaining open tenders if user has none */}
                  {userOpenBids.length === 0 &&
                    tenders
                      .filter((t) => t.status === 1)
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          Tender #{t.id} (No bid placed)
                        </option>
                      ))}
                </select>
              )}
            </div>

            {/* Backup file upload fallback */}
            <div className="backup-import-section">
              <div className="backup-import-header">
                <span className="backup-label">Backup File Status:</span>
                {hasSavedBackup ? (
                  <span className="badge badge-shield">✓ Credentials Loaded</span>
                ) : (
                  <span className="field-hint" style={{ margin: 0 }}>No saved file in browser</span>
                )}
              </div>

              {!hasSavedBackup && (
                <div className="backup-file-input-wrapper">
                  <label htmlFor="backup-file-input" className="btn-file-upload">
                    Upload your backup file
                  </label>
                  <input
                    type="file"
                    id="backup-file-input"
                    accept=".json,application/json"
                    onChange={handleBackupFileUpload}
                    style={{ display: "none" }}
                  />
                </div>
              )}

              {backupFileNotice && (
                <div
                  className={`portal-alert alert-${backupFileNotice.type === "error" ? "error" : backupFileNotice.type === "warning" ? "warning" : "success"}`}
                  style={{ marginTop: "0.5rem", padding: "0.5rem 0.75rem" }}
                >
                  <div className="portal-alert-body">{backupFileNotice.message}</div>
                </div>
              )}
            </div>

            {/* Revealed Amount */}
            <div className="form-group">
              <label>Your Price ({CURRENCY_SYMBOL})</label>
              <input
                type="number"
                step="0.0001"
                placeholder="Filled from backup file"
                value={revealAmount}
                disabled={!account || isWrongNetwork}
                onChange={(e) => setRevealAmount(e.target.value)}
                required
              />
            </div>

            {/* Revealed Secret Code */}
            <div className="form-group">
              <label>Your Secret Code (32-bytes)</label>
              <input
                type="text"
                placeholder="0x... (filled from backup file)"
                value={revealSalt}
                disabled={!account || isWrongNetwork}
                onChange={(e) => setRevealSalt(e.target.value)}
                required
              />
            </div>

            {/* Action Button & Inline Disabled Reason */}
            <div className="action-button-row">
              <button
                type="submit"
                className="btn btn-success btn-block"
                disabled={!canSubmitReveal}
              >
                {isSubmittingReveal ? "Opening bid..." : "Open my bid"}
              </button>
              {revealDisabledReason && (
                <div className="btn-disabled-reason">
                  <span className="reason-bullet">ℹ</span> {revealDisabledReason}
                </div>
              )}
            </div>
          </form>
        </div>
      </div>

      {/* =====================================================================
          STEP 5: Card "3. If you win: submit proof of work" & STEP 6: "My money"
         ===================================================================== */}
      <div className="financials-split" style={{ marginTop: "1.75rem" }}>
        {/* Card 3: Submit proof of work */}
        <div className="milestone-submit-card">
          <div className="panel-header">
            <div>
              <h3>3. If you win: submit proof of work</h3>
              <p className="panel-sub">
                Submit verification documentation for your awarded milestones.
              </p>
            </div>
            <span className="badge badge-shield">Contractor</span>
          </div>

          <form onSubmit={handleSubmitProof} className="form-card">
            <div className="form-group">
              <label>Awarded Funded Contract</label>
              {fundedTenders.length === 0 ? (
                <div className="empty-tender-notice">
                  You have no active awarded contracts in progress.
                </div>
              ) : (
                <select
                  value={fundedTenderId}
                  disabled={!account || isWrongNetwork}
                  onChange={(e) => setFundedTenderId(e.target.value)}
                >
                  {fundedTenders.map((t) => (
                    <option key={t.id} value={t.id}>
                      Tender #{t.id} — Escrow: {ethers.formatEther(t.escrowBalance || 0n)} {CURRENCY_SYMBOL}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {selectedFundedTender && (
              <div className="form-group">
                <label>Target Milestone</label>
                <div className="milestone-auto-tag">
                  Milestone #{autoMilestoneIndex + 1} (Milestone index: {autoMilestoneIndex})
                  {currentMilestone && (
                    <span style={{ marginLeft: "0.5rem" }}>
                      — Status:{" "}
                      {Number(currentMilestone.status) === 1
                        ? "Work submitted (Awaiting verifier approval)"
                        : Number(currentMilestone.status) === 2
                        ? "Approved"
                        : "Waiting for submission"}
                    </span>
                  )}
                </div>
              </div>
            )}

            {isCurrentMilestoneSubmitted && (
              <div className="portal-alert alert-warning" style={{ margin: "0.5rem 0 1rem 0", padding: "0.6rem 0.85rem" }}>
                <span className="portal-alert-icon">ℹ</span>
                <div className="portal-alert-body">
                  Milestone proof is already submitted and awaiting verifier approval.
                </div>
              </div>
            )}

            <div className="form-group">
              <label>Describe or paste a link to your proof</label>
              <input
                type="text"
                placeholder="e.g. Completed foundations inspected. IPFS: Qm... or https://..."
                value={proofText}
                disabled={!account || !selectedFundedTender || isWrongNetwork || isCurrentMilestoneSubmitted || areAllMilestonesDone}
                onChange={(e) => setProofText(e.target.value)}
                required
              />
              <div className="field-hint">
                Only the fingerprint of your proof is stored on the blockchain
              </div>
            </div>

            <div className="action-button-row">
              <button
                type="submit"
                className="btn btn-primary btn-block"
                disabled={!canSubmitProof}
              >
                {isSubmittingProof ? "Submitting proof..." : "Submit proof"}
              </button>
              {proofDisabledReason && (
                <div className="btn-disabled-reason">
                  <span className="reason-bullet">ℹ</span> {proofDisabledReason}
                </div>
              )}
            </div>
          </form>
        </div>

        {/* STEP 6: Card "My money" */}
        <div className="pull-card">
          <div className="panel-header">
            <div>
              <h3>My money</h3>
              <p className="panel-sub">
                Withdraw accumulated milestone releases or claim refundable bid deposits.
              </p>
            </div>
            <span className="badge badge-shield">Escrow</span>
          </div>

          <div className="pull-card-body">
            {/* Section: Waiting for you */}
            <div className="money-section-box">
              <div className="money-subheading">Waiting for you</div>
              <div className="pull-balance-display">
                <span className="pull-val">
                  {claimableBalance
                    ? parseFloat(ethers.formatEther(claimableBalance)).toFixed(4)
                    : "0.0000"}{" "}
                  {CURRENCY_SYMBOL}
                </span>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={
                    !account ||
                    !claimableBalance ||
                    claimableBalance === 0n ||
                    isWrongNetwork ||
                    isSubmittingWithdraw
                  }
                  onClick={handleWithdrawWaitingMoney}
                >
                  {isSubmittingWithdraw ? "Withdrawing..." : "Withdraw"}
                </button>
              </div>
              {(!claimableBalance || claimableBalance === 0n) && (
                <div className="btn-disabled-reason">
                  <span className="reason-bullet">ℹ</span> No money waiting to withdraw
                </div>
              )}
            </div>

            <div className="refund-divider" />

            {/* Section: Deposits you can get back */}
            <div className="money-section-box">
              <div className="money-subheading">Deposits you can get back</div>
              {refundableTenders.length === 0 ? (
                <div className="empty-tender-notice">
                  No deposits available to get back right now.
                </div>
              ) : (
                <div className="refundable-tenders-list">
                  {refundableTenders.map((t) => (
                    <div key={t.id} className="refundable-tender-item">
                      <div className="refundable-info">
                        <strong>Tender #{t.id}</strong> — Deposit: {ethers.formatEther(t.bidBond)} {CURRENCY_SYMBOL}
                      </div>
                      <button
                        type="button"
                        className="btn btn-outline btn-mini"
                        disabled={isWrongNetwork || refundingTenderId === t.id}
                        onClick={() => handleClaimDepositBack(t.id)}
                      >
                        {refundingTenderId === t.id ? "Claiming..." : "Get my deposit back"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
