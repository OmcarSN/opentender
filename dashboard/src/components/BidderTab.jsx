import React, { useState, useEffect, useMemo } from "react";
import { ethers } from "ethers";
import { CURRENCY_SYMBOL, CHAIN_ID, CHAIN_NAME } from "../config";
import { generateRandomSalt, computeCommitHash, downloadBidBackup } from "../utils/crypto";
import { parseContractError } from "../utils/errors";

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
}) {
  // Commit Form State
  const [commitTenderId, setCommitTenderId] = useState(selectedTenderId ? String(selectedTenderId) : "");
  const [bidAmount, setBidAmount] = useState("");
  const [salt, setSalt] = useState("");
  const [computedHash, setComputedHash] = useState("");
  const [isSubmittingCommit, setIsSubmittingCommit] = useState(false);

  // Reveal Form State
  const [revealTenderId, setRevealTenderId] = useState(selectedTenderId ? String(selectedTenderId) : "");
  const [revealAmount, setRevealAmount] = useState("");
  const [revealSalt, setRevealSalt] = useState("");
  const [hasSavedBid, setHasSavedBid] = useState(false);
  const [backupFileNotice, setBackupFileNotice] = useState(null);
  const [isSubmittingReveal, setIsSubmittingReveal] = useState(false);

  // Refund Form State
  const [refundTenderId, setRefundTenderId] = useState("");
  const [isSubmittingRefund, setIsSubmittingRefund] = useState(false);

  // Milestone Form State
  const [milestoneTenderId, setMilestoneTenderId] = useState("");
  const [milestoneIndex, setMilestoneIndex] = useState(0);
  const [evidenceText, setEvidenceText] = useState("");
  const [isSubmittingMilestone, setIsSubmittingMilestone] = useState(false);
  const [isSubmittingWithdraw, setIsSubmittingWithdraw] = useState(false);

  // Network and Time State
  const isWrongNetwork = chainId !== null && Number(chainId) !== CHAIN_ID;
  const currentTime = latestBlockTimestamp || Math.floor(Date.now() / 1000);

  // Sync selectedTenderId prop
  useEffect(() => {
    if (selectedTenderId) {
      if (!commitTenderId) setCommitTenderId(String(selectedTenderId));
      if (!revealTenderId) setRevealTenderId(String(selectedTenderId));
    }
  }, [selectedTenderId]);

  // =========================================================================
  // Categorized Authoritative Tenders
  // =========================================================================

  // 1. Commit Phase Eligible: Status 1 (Open) and commit deadline has not elapsed
  const commitEligibleTenders = useMemo(() => {
    return tenders.filter((t) => {
      if (t.status !== 1) return false;
      if (t.commitDeadline && currentTime > t.commitDeadline) return false;
      return true;
    });
  }, [tenders, currentTime]);

  // 2. Reveal Phase Eligible: Status 1 (Open) and between commit & reveal deadlines
  const revealEligibleTenders = useMemo(() => {
    return tenders.filter((t) => {
      if (t.status !== 1) return false;
      if (!t.commitDeadline || !t.revealDeadline) return true;
      return currentTime > t.commitDeadline && currentTime <= t.revealDeadline;
    });
  }, [tenders, currentTime]);

  // 3. Bond Refund Eligible: Cancelled (6) or Finalized/Awarded (2,3,4,7) where caller is not winner
  const refundEligibleTenders = useMemo(() => {
    return tenders.filter((t) => {
      if (t.status === 6) return true; // Cancelled
      if ([2, 3, 4, 7].includes(t.status)) {
        if (account && t.winningBidder && t.winningBidder.toLowerCase() === account.toLowerCase()) {
          return false; // Winning contractor's bond is returned on contract completion
        }
        return true;
      }
      return false;
    });
  }, [tenders, account]);

  // 4. Milestone Proof Eligible: Funded (3) and connected wallet is the winning contractor
  const milestoneEligibleTenders = useMemo(() => {
    if (!account) return [];
    return tenders.filter((t) => {
      return t.status === 3 && t.winningBidder && t.winningBidder.toLowerCase() === account.toLowerCase();
    });
  }, [tenders, account]);

  // Target Tender References
  const selectedCommitTender = tenders.find((t) => t.id === Number(commitTenderId));
  const selectedRevealTender = tenders.find((t) => t.id === Number(revealTenderId));
  const selectedMilestoneTender = tenders.find((t) => t.id === Number(milestoneTenderId));

  // =========================================================================
  // Validations: Commit Sealed Bid
  // =========================================================================

  const ceilingEth = selectedCommitTender
    ? parseFloat(ethers.formatEther(selectedCommitTender.ceilingPrice))
    : 0;

  const bidAmountNum = parseFloat(bidAmount);
  let bidAmountError = null;
  if (bidAmount !== "") {
    if (isNaN(bidAmountNum)) {
      bidAmountError = "Bid price must be a valid number.";
    } else if (bidAmountNum <= 0) {
      bidAmountError = "Bid price must be strictly positive (> 0).";
    } else if (ceilingEth > 0 && bidAmountNum > ceilingEth) {
      bidAmountError = `Bid price exceeds tender ceiling (${ceilingEth} ${CURRENCY_SYMBOL}). Contract will reject this bid.`;
    }
  }

  const isValidSalt = /^0x[0-9a-fA-F]{64}$/.test(salt.trim());
  let saltError = null;
  if (salt.trim() !== "" && !isValidSalt) {
    saltError = "Secret salt must be a 32-byte hex string (66 characters beginning with 0x).";
  }

  // Compute commit hash in real-time
  useEffect(() => {
    if (bidAmount && !bidAmountError && isValidSalt && account && commitTenderId) {
      try {
        const hash = computeCommitHash(bidAmount, salt.trim(), account, commitTenderId, CHAIN_ID);
        setComputedHash(hash);
      } catch {
        setComputedHash("");
      }
    } else {
      setComputedHash("");
    }
  }, [bidAmount, bidAmountError, salt, isValidSalt, account, commitTenderId]);

  function handleGenerateSalt() {
    const s = generateRandomSalt();
    setSalt(s);
  }

  const canSubmitCommit = Boolean(
    account &&
    signerContract &&
    !isWrongNetwork &&
    selectedCommitTender &&
    !bidAmountError &&
    bidAmountNum > 0 &&
    isValidSalt &&
    computedHash &&
    !isSubmittingCommit
  );

  // =========================================================================
  // Validations & Handlers: Reveal Sealed Bid
  // =========================================================================

  // Check localStorage for saved bid on reveal tender change
  useEffect(() => {
    if (!account || !revealTenderId) {
      setHasSavedBid(false);
      return;
    }
    const key = `opentender_bid_${revealTenderId}_${account.toLowerCase()}`;
    const saved = localStorage.getItem(key);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.amountEth && parsed.salt) {
          setRevealAmount(parsed.amountEth || "");
          setRevealSalt(parsed.salt || "");
          setHasSavedBid(true);
          setBackupFileNotice({
            type: "info",
            message: `Retrieved local credentials for Tender #${revealTenderId} from browser storage.`,
          });
          return;
        }
      } catch {
        // Continue to fallback
      }
    }
    setHasSavedBid(false);
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

        if (!data.amountEth || !data.salt) {
          setBackupFileNotice({
            type: "error",
            message: "Incompatible backup format: missing 'amountEth' or 'salt' keys.",
          });
          return;
        }

        if (!/^0x[0-9a-fA-F]{64}$/.test(String(data.salt).trim())) {
          setBackupFileNotice({
            type: "error",
            message: "Invalid secret salt inside backup file. Must be 32-byte hex.",
          });
          return;
        }

        // Populate fields
        setRevealAmount(String(data.amountEth));
        setRevealSalt(String(data.salt).trim());

        if (data.tenderId) {
          setRevealTenderId(String(data.tenderId));
          if (onSelectTender) onSelectTender(Number(data.tenderId));
        }

        // Check wallet mismatch
        if (data.bidder && account && data.bidder.toLowerCase() !== account.toLowerCase()) {
          setBackupFileNotice({
            type: "warning",
            message: `Warning: Backup was generated for wallet ${data.bidder.slice(0, 6)}...${data.bidder.slice(-4)}, but connected wallet is ${account.slice(0, 6)}...${account.slice(-4)}. The contract will reject reveals submitted from the wrong wallet.`,
          });
        } else {
          setBackupFileNotice({
            type: "success",
            message: `Keyfile successfully imported for Tender #${data.tenderId || "?"} (${data.amountEth} ${CURRENCY_SYMBOL}). Ready to reveal.`,
          });
        }

        setHasSavedBid(true);
      } catch (err) {
        setBackupFileNotice({ type: "error", message: `Failed to read file: ${err.message}` });
      }
    };
    reader.readAsText(file);
  }

  const revealAmountNum = parseFloat(revealAmount);
  let revealAmountError = null;
  if (revealAmount !== "") {
    if (isNaN(revealAmountNum) || revealAmountNum <= 0) {
      revealAmountError = "Revealed bid price must be a valid positive number.";
    }
  }

  const isValidRevealSalt = /^0x[0-9a-fA-F]{64}$/.test(revealSalt.trim());
  let revealSaltError = null;
  if (revealSalt.trim() !== "" && !isValidRevealSalt) {
    revealSaltError = "Secret salt must be a valid 32-byte hex string (66 characters with 0x).";
  }

  const canSubmitReveal = Boolean(
    account &&
    signerContract &&
    !isWrongNetwork &&
    revealTenderId &&
    !revealAmountError &&
    revealAmountNum > 0 &&
    isValidRevealSalt &&
    !isSubmittingReveal
  );

  // =========================================================================
  // Handlers: On-Chain Actions
  // =========================================================================

  // Submit sealed commitment
  async function handleCommit(e) {
    e.preventDefault();
    if (!canSubmitCommit) return;

    try {
      setIsSubmittingCommit(true);

      // 1. Download plaintext JSON keyfile backup and cache in localStorage
      downloadBidBackup(commitTenderId, account, bidAmount, salt.trim(), computedHash);
      const storageKey = `opentender_bid_${commitTenderId}_${account.toLowerCase()}`;
      try {
        localStorage.setItem(
          storageKey,
          JSON.stringify({
            tenderId: Number(commitTenderId),
            bidder: account,
            amountEth: bidAmount,
            salt: salt.trim(),
            commitHash: computedHash,
            savedAt: new Date().toISOString(),
          })
        );
      } catch {
        // localStorage quota notice
      }

      // 2. Submit transaction with exact bid bond
      const bondVal = selectedCommitTender ? selectedCommitTender.bidBond : ethers.parseEther("1");
      setNotification({
        active: true,
        title: `Committing Sealed Bid for Tender #${commitTenderId}...`,
      });

      const tx = await signerContract.commitBid(commitTenderId, computedHash, { value: bondVal });
      setNotification({ active: true, title: "Waiting for block confirmation...", hash: tx.hash });
      await tx.wait();

      setNotification({
        active: false,
        hash: tx.hash,
        title: "Sealed Bid Committed Successfully!",
        success: `Your commitment hash was recorded on-chain. Required bid bond of ${ethers.formatEther(bondVal)} ${CURRENCY_SYMBOL} is locked in escrow.`,
      });
      onRefresh();
    } catch (err) {
      const msg = parseContractError(err);
      setNotification({ active: false, title: "Commitment Failed", error: msg });
    } finally {
      setIsSubmittingCommit(false);
    }
  }

  // Reveal bid
  async function handleReveal(e) {
    e.preventDefault();
    if (!canSubmitReveal) return;

    try {
      setIsSubmittingReveal(true);
      setNotification({ active: true, title: `Revealing Bid for Tender #${revealTenderId}...` });
      const amountWei = ethers.parseEther(revealAmount.toString());

      const tx = await signerContract.revealBid(revealTenderId, amountWei, revealSalt.trim());
      setNotification({ active: true, title: "Waiting for confirmation...", hash: tx.hash });
      await tx.wait();

      setNotification({
        active: false,
        hash: tx.hash,
        title: "Bid Revealed On-Chain!",
        success: `Successfully revealed bid of ${revealAmount} ${CURRENCY_SYMBOL}. Your position has been registered for evaluation.`,
      });
      onRefresh();
    } catch (err) {
      const msg = parseContractError(err);
      setNotification({ active: false, title: "Reveal Failed", error: msg });
    } finally {
      setIsSubmittingReveal(false);
    }
  }

  // Claim bond refund
  async function handleClaimRefund(e) {
    e.preventDefault();
    if (!refundTenderId || !signerContract || isWrongNetwork || isSubmittingRefund) return;

    try {
      setIsSubmittingRefund(true);
      setNotification({ active: true, title: `Claiming Bid Bond Refund for Tender #${refundTenderId}...` });
      const tx = await signerContract.claimBondRefund(refundTenderId);
      setNotification({ active: true, title: "Confirming refund...", hash: tx.hash });
      await tx.wait();

      setNotification({
        active: false,
        hash: tx.hash,
        title: "Bond Refunded",
        success: "Bid bond deposit successfully transferred back to your wallet.",
      });
      onRefresh();
    } catch (err) {
      const msg = parseContractError(err);
      setNotification({ active: false, title: "Refund Claim Failed", error: msg });
    } finally {
      setIsSubmittingRefund(false);
    }
  }

  // Withdraw pull-payment balance
  async function handleWithdrawBalance() {
    if (!signerContract || !claimableBalance || claimableBalance === 0n || isSubmittingWithdraw) return;

    try {
      setIsSubmittingWithdraw(true);
      setNotification({ active: true, title: "Withdrawing Pull Balance..." });
      const tx = await signerContract.withdrawPullBalance();
      setNotification({ active: true, title: "Confirming withdrawal...", hash: tx.hash });
      await tx.wait();

      setNotification({
        active: false,
        hash: tx.hash,
        title: "Withdrawal Complete",
        success: `Accumulated balance of ${ethers.formatEther(claimableBalance)} ${CURRENCY_SYMBOL} transferred to wallet.`,
      });
      onRefresh();
    } catch (err) {
      const msg = parseContractError(err);
      setNotification({ active: false, title: "Withdrawal Failed", error: msg });
    } finally {
      setIsSubmittingWithdraw(false);
    }
  }

  // Submit milestone completion evidence
  async function handleSubmitMilestone(e) {
    e.preventDefault();
    if (!signerContract || !milestoneTenderId || !evidenceText.trim() || isSubmittingMilestone) return;

    try {
      setIsSubmittingMilestone(true);
      const text = evidenceText.trim();
      const evidenceHash = text.startsWith("0x") && text.length === 66 ? text : ethers.id(text);

      setNotification({
        active: true,
        title: `Submitting Evidence for Milestone #${milestoneIndex}...`,
      });
      const tx = await signerContract.submitMilestone(milestoneTenderId, milestoneIndex, evidenceHash);
      setNotification({ active: true, title: "Confirming submission...", hash: tx.hash });
      await tx.wait();

      setNotification({
        active: false,
        hash: tx.hash,
        title: "Milestone Evidence Submitted!",
        success: `Evidence registered for Milestone #${milestoneIndex}. Awaiting assigned verifier review.`,
      });
      setEvidenceText("");
      onRefresh();
    } catch (err) {
      const msg = parseContractError(err);
      setNotification({ active: false, title: "Submission Failed", error: msg });
    } finally {
      setIsSubmittingMilestone(false);
    }
  }

  // =========================================================================
  // Selector Options Renderer Helper
  // =========================================================================
  function renderTenderOptions(eligibleList, defaultPlaceholder, emptyReason) {
    if (isWrongNetwork) {
      return (
        <option value="" disabled>
          ⚠ Wrong Network — Switch to {CHAIN_NAME} to select tenders
        </option>
      );
    }
    if (isDataLoading) {
      return (
        <option value="" disabled>
          Loading on-chain tenders from contract...
        </option>
      );
    }
    if (dataLoadError) {
      return (
        <option value="" disabled>
          Failed to load: Contract RPC unreachable
        </option>
      );
    }
    if (tenders.length === 0) {
      return (
        <option value="" disabled>
          No tenders published on-chain
        </option>
      );
    }
    if (eligibleList.length === 0) {
      return (
        <option value="" disabled>
          {emptyReason}
        </option>
      );
    }

    return (
      <>
        <option value="" disabled>
          {defaultPlaceholder}
        </option>
        {eligibleList.map((t) => (
          <option key={t.id} value={t.id}>
            Tender #{t.id} — Ceiling: {ethers.formatEther(t.ceilingPrice)} {CURRENCY_SYMBOL} (Bond:{" "}
            {ethers.formatEther(t.bidBond)} {CURRENCY_SYMBOL})
          </option>
        ))}
      </>
    );
  }

  return (
    <div className="tab-pane bidder-tab">
      {/* Global Status Banner for Data Loading / Wrong Network */}
      {isWrongNetwork && (
        <div className="portal-alert alert-warning">
          <span className="portal-alert-icon">⚠</span>
          <div className="portal-alert-body">
            <strong>Wrong Network Detected:</strong> Your wallet is connected to Chain ID {chainId}. OpenTender requires{" "}
            <strong>{CHAIN_NAME}</strong> (Chain ID: {CHAIN_ID}). All contract actions are disabled until you switch networks.
          </div>
        </div>
      )}

      {dataLoadError && !isWrongNetwork && (
        <div className="portal-alert alert-error">
          <span className="portal-alert-icon">✖</span>
          <div className="portal-alert-body">
            <strong>Contract Connection Error:</strong> {dataLoadError} Tenders could not be fetched from the configured RPC node.
            <button type="button" className="btn-alert-action" onClick={onRefresh}>
              Retry Connection
            </button>
          </div>
        </div>
      )}

      <div className="bidder-grid">
        {/* ===================================================================
            Panel 1: Commit Sealed Bid
           =================================================================== */}
        <div className="panel">
          <div className="panel-header">
            <div>
              <h3>1. Commit Sealed Bid</h3>
              <p className="panel-sub">Cryptographically seal your secret price before the commitment deadline.</p>
            </div>
            <span className="badge badge-shield">Step 1: Commit Phase</span>
          </div>

          <form onSubmit={handleCommit} className="form-card">
            {/* Target Tender Selection */}
            <div className="form-group">
              <label>Select Target Tender</label>
              <select
                value={commitTenderId}
                disabled={isWrongNetwork || isDataLoading || commitEligibleTenders.length === 0}
                onChange={(e) => {
                  setCommitTenderId(e.target.value);
                  if (onSelectTender) onSelectTender(Number(e.target.value));
                }}
              >
                {renderTenderOptions(
                  commitEligibleTenders,
                  `-- Select an open tender (${commitEligibleTenders.length} available) --`,
                  "No tenders currently accepting sealed bids"
                )}
              </select>

              {commitEligibleTenders.length === 0 && !isDataLoading && !dataLoadError && tenders.length > 0 && (
                <div className="field-status-box info-box">
                  <span>ℹ No tenders are currently in the active Commit Phase. Deadlines may have closed or progressed to Reveal.</span>
                </div>
              )}
            </div>

            {/* Bid Amount */}
            <div className="form-group">
              <label>Your Sealed Bid Price ({CURRENCY_SYMBOL})</label>
              <input
                type="number"
                step="0.0001"
                min="0.0001"
                placeholder={selectedCommitTender ? `e.g. ${ceilingEth * 0.85}` : "Select tender first"}
                value={bidAmount}
                disabled={!selectedCommitTender || isWrongNetwork}
                onChange={(e) => setBidAmount(e.target.value)}
                required
              />
              {selectedCommitTender && (
                <div className="field-hint">
                  Tender Ceiling: <strong>{ceilingEth} {CURRENCY_SYMBOL}</strong> · Required Bond Deposit:{" "}
                  <strong>{ethers.formatEther(selectedCommitTender.bidBond)} {CURRENCY_SYMBOL}</strong>
                </div>
              )}
              {bidAmountError && <div className="field-validation-error">{bidAmountError}</div>}
              {bidAmount && !bidAmountError && (
                <div className="field-validation-success">
                  ✓ Valid bid price within {ceilingEth} {CURRENCY_SYMBOL} ceiling limit.
                </div>
              )}
            </div>

            {/* Secret Salt */}
            <div className="form-group">
              <div className="label-row">
                <label>Cryptographic Secret Salt (32-bytes)</label>
                <button
                  type="button"
                  className="btn-mini btn-secondary"
                  disabled={isWrongNetwork}
                  onClick={handleGenerateSalt}
                  title="Generate secure 256-bit random salt"
                >
                  Generate Random Salt
                </button>
              </div>
              <input
                type="text"
                placeholder="0x... (64 hex characters)"
                value={salt}
                disabled={isWrongNetwork}
                onChange={(e) => setSalt(e.target.value)}
                required
              />
              <div className="field-hint">
                A 32-byte secret randomizer that keeps your bid mathematically un-guessable until the reveal phase.
              </div>
              {saltError && <div className="field-validation-error">{saltError}</div>}
              {isValidSalt && (
                <div className="field-validation-success">
                  ✓ Valid 32-byte hexadecimal salt format.
                </div>
              )}
            </div>

            {/* Real-Time Computed Hash Box */}
            {computedHash && (
              <div className="computed-hash-box">
                <div className="hash-title">Computed keccak256 Commitment Hash:</div>
                <code className="hash-val">{computedHash}</code>
                <div className="hash-note">
                  Binds: Bid Amount ({bidAmount} {CURRENCY_SYMBOL}) + Secret Salt + Wallet ({account ? `${account.slice(0, 6)}...${account.slice(-4)}` : "None"}) + Tender #{commitTenderId} + Chain #{CHAIN_ID}.
                </div>
              </div>
            )}

            {/* Truthful Backup Notice */}
            <div className="backup-notice">
              <strong>Receipt &amp; Keyfile Backup:</strong> A plaintext JSON backup file containing your secret salt, bid price, and commitment hash will be downloaded automatically to your device upon submission. Store it securely—you must provide this exact secret salt and bid amount to reveal your bid during the Reveal Phase.
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-block"
              disabled={!canSubmitCommit}
            >
              {isSubmittingCommit ? "Submitting Sealed Bid..." : "Download Keyfile & Submit Sealed Bid"}
            </button>
          </form>
        </div>

        {/* ===================================================================
            Panel 2: Reveal Sealed Bid
           =================================================================== */}
        <div className="panel">
          <div className="panel-header">
            <div>
              <h3>2. Reveal Sealed Bid</h3>
              <p className="panel-sub">Unseal your secret bid on-chain once the commit deadline has passed.</p>
            </div>
            <span className="badge badge-reveal">Step 2: Reveal Phase</span>
          </div>

          <form onSubmit={handleReveal} className="form-card">
            {/* Target Tender to Reveal */}
            <div className="form-group">
              <label>Select Tender to Reveal</label>
              <select
                value={revealTenderId}
                disabled={isWrongNetwork || isDataLoading || revealEligibleTenders.length === 0}
                onChange={(e) => {
                  setRevealTenderId(e.target.value);
                  if (onSelectTender) onSelectTender(Number(e.target.value));
                }}
              >
                {renderTenderOptions(
                  revealEligibleTenders,
                  `-- Select tender in reveal phase (${revealEligibleTenders.length} available) --`,
                  "No tenders currently in Reveal Phase"
                )}
              </select>

              {revealEligibleTenders.length === 0 && !isDataLoading && !dataLoadError && tenders.length > 0 && (
                <div className="field-status-box info-box">
                  <span>ℹ No tenders are currently in the active Reveal Phase. Tenders must pass their commit deadline before bids can be unsealed.</span>
                </div>
              )}
            </div>

            {/* Keyfile Backup Import Area */}
            <div className="keyfile-import-section">
              <div className="keyfile-import-header">
                <span className="keyfile-label">Bid Keyfile Import:</span>
                {hasSavedBid && (
                  <span className="keyfile-status-badge">✓ Credentials Loaded</span>
                )}
              </div>

              <div className="keyfile-drop-zone">
                <input
                  type="file"
                  id="keyfile-upload"
                  accept=".json,application/json"
                  className="keyfile-hidden-input"
                  onChange={handleBackupFileUpload}
                />
                <label htmlFor="keyfile-upload" className="keyfile-drop-label">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  <span>Import Saved Keyfile (.json) to Auto-Fill</span>
                </label>
              </div>

              {backupFileNotice && (
                <div className={`portal-alert alert-${backupFileNotice.type === "error" ? "error" : backupFileNotice.type === "warning" ? "warning" : "success"}`}>
                  <div className="portal-alert-body">{backupFileNotice.message}</div>
                </div>
              )}
            </div>

            {/* Reveal Amount */}
            <div className="form-group">
              <label>Exact Committed Bid Amount ({CURRENCY_SYMBOL})</label>
              <input
                type="number"
                step="0.0001"
                placeholder="Must match your original commitment"
                value={revealAmount}
                disabled={isWrongNetwork}
                onChange={(e) => setRevealAmount(e.target.value)}
                required
              />
              {revealAmountError && <div className="field-validation-error">{revealAmountError}</div>}
              {revealAmount && !revealAmountError && (
                <div className="field-validation-success">✓ Formatted bid price ready.</div>
              )}
            </div>

            {/* Reveal Salt */}
            <div className="form-group">
              <label>Exact Secret Salt (32-bytes)</label>
              <input
                type="text"
                placeholder="0x... (must match original salt)"
                value={revealSalt}
                disabled={isWrongNetwork}
                onChange={(e) => setRevealSalt(e.target.value)}
                required
              />
              {revealSaltError && <div className="field-validation-error">{revealSaltError}</div>}
              {isValidRevealSalt && (
                <div className="field-validation-success">✓ Valid 32-byte salt format.</div>
              )}
            </div>

            <button
              type="submit"
              className="btn btn-success btn-block"
              disabled={!canSubmitReveal}
            >
              {isSubmittingReveal ? "Revealing Bid..." : "Reveal Sealed Bid On-Chain"}
            </button>
          </form>
        </div>
      </div>

      {/* ===================================================================
          Panel 3: Bidder Financials & Milestone Deliverables
         =================================================================== */}
      <div className="panel bidder-actions-panel">
        <div className="financials-split">
          {/* Pull Payments & Bond Refunds */}
          <div className="pull-card">
            <h4>Claimable Pull-Payment Balance</h4>
            <div className="pull-balance-display">
              <span className="pull-val">
                {claimableBalance ? parseFloat(ethers.formatEther(claimableBalance)).toFixed(4) : "0.0000"}{" "}
                {CURRENCY_SYMBOL}
              </span>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={!claimableBalance || claimableBalance === 0n || isWrongNetwork || isSubmittingWithdraw}
                onClick={handleWithdrawBalance}
                title={claimableBalance === 0n ? "No claimable balance available for withdrawal" : "Withdraw balance"}
              >
                {isSubmittingWithdraw ? "Withdrawing..." : "Withdraw Balance"}
              </button>
            </div>

            {(!claimableBalance || claimableBalance === 0n) ? (
              <p className="field-hint text-subtle">
                Withdrawal Unavailable: You currently have 0.0000 {CURRENCY_SYMBOL} in the pull-payment ledger. Payouts from milestone releases, late-delivery penalties, or non-winning revealed bid bonds accumulate here and can be withdrawn once credited.
              </p>
            ) : (
              <p className="field-hint text-success">
                ✓ Available for immediate withdrawal to your connected wallet.
              </p>
            )}

            <div className="refund-divider" />

            <div className="refund-row">
              <label>Claim Bid Bond for Losers / Cancelled Tenders:</label>
              <div className="inline-action">
                <select
                  value={refundTenderId}
                  disabled={isWrongNetwork || isDataLoading || refundEligibleTenders.length === 0}
                  onChange={(e) => setRefundTenderId(e.target.value)}
                >
                  {renderTenderOptions(
                    refundEligibleTenders,
                    `-- Select tender for bond refund (${refundEligibleTenders.length} eligible) --`,
                    "No tenders currently eligible for bond refund"
                  )}
                </select>
                <button
                  type="button"
                  className="btn btn-outline"
                  disabled={!refundTenderId || isWrongNetwork || isSubmittingRefund}
                  onClick={handleClaimRefund}
                >
                  {isSubmittingRefund ? "Claiming..." : "Refund Bond"}
                </button>
              </div>
              <p className="field-hint">
                Bid bonds are locked during active bidding. Non-winning bidders who revealed valid bids, or bidders on cancelled tenders, can claim their locked bond deposit back here.
              </p>
            </div>
          </div>

          {/* Contractor Milestone Evidence Submission */}
          <div className="milestone-submit-card">
            <h4>Milestone Completion Proof</h4>
            <p className="field-hint">
              Restricted to the awarded contractor. Submit verification documentation or IPFS hashes to request verifier approvals.
            </p>

            <form onSubmit={handleSubmitMilestone} className="form-inline-stack">
              <div className="form-row">
                <div className="form-group col-half">
                  <label>Awarded Tender Contract</label>
                  <select
                    value={milestoneTenderId}
                    disabled={isWrongNetwork || isDataLoading || milestoneEligibleTenders.length === 0}
                    onChange={(e) => setMilestoneTenderId(e.target.value)}
                  >
                    {renderTenderOptions(
                      milestoneEligibleTenders,
                      `-- Select your awarded contract (${milestoneEligibleTenders.length} available) --`,
                      "No active funded contracts awarded to your wallet"
                    )}
                  </select>
                </div>
                <div className="form-group col-half">
                  <label>Milestone Index (0-based)</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0 for Milestone 1"
                    value={milestoneIndex}
                    disabled={!milestoneTenderId || isWrongNetwork}
                    onChange={(e) => setMilestoneIndex(Math.max(0, parseInt(e.target.value, 10) || 0))}
                  />
                </div>
              </div>

              {milestoneEligibleTenders.length === 0 && !isDataLoading && !dataLoadError && (
                <div className="field-status-box info-box">
                  <span>ℹ Milestone submissions are restricted to the winning contractor awarded the contract once the department funds escrow.</span>
                </div>
              )}

              <div className="form-group">
                <label>Evidence Note / Document Hash (IPFS CID, HTTPS URL, or SHA-256)</label>
                <input
                  type="text"
                  placeholder="e.g. Completed foundations inspected. IPFS: Qm... or https://..."
                  value={evidenceText}
                  disabled={!milestoneTenderId || isWrongNetwork}
                  onChange={(e) => setEvidenceText(e.target.value)}
                  required
                />
                <div className="field-hint">
                  Accepted formats: IPFS CID (Qm... / bafy...), HTTPS document URL, or 32-byte hex hash. Plain text notes will be cryptographically hashed with keccak256 before on-chain submission.
                </div>
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                disabled={
                  !milestoneTenderId ||
                  !evidenceText.trim() ||
                  isWrongNetwork ||
                  isSubmittingMilestone
                }
              >
                {isSubmittingMilestone ? "Submitting Evidence..." : "Submit Milestone Evidence"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
