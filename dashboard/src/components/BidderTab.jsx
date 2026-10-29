import React, { useState, useEffect } from "react";
import { ethers } from "ethers";
import { CURRENCY_SYMBOL, CHAIN_ID } from "../config";
import { generateRandomSalt, computeCommitHash, downloadBidBackup } from "../utils/crypto";
import { parseContractError } from "../utils/errors";

export default function BidderTab({
  account,
  signerContract,
  tenders,
  selectedTenderId,
  onSelectTender,
  claimableBalance,
  onRefresh,
  setNotification
}) {
  // Commit Form State
  const [commitTenderId, setCommitTenderId] = useState(selectedTenderId || 1);
  const [bidAmount, setBidAmount] = useState("");
  const [salt, setSalt] = useState("");
  const [computedHash, setComputedHash] = useState("");

  // Reveal Form State
  const [revealTenderId, setRevealTenderId] = useState(selectedTenderId || 1);
  const [revealAmount, setRevealAmount] = useState("");
  const [revealSalt, setRevealSalt] = useState("");
  const [hasSavedBid, setHasSavedBid] = useState(false);

  // Milestone Form State
  const [milestoneTenderId, setMilestoneTenderId] = useState(selectedTenderId || 1);
  const [milestoneIndex, setMilestoneIndex] = useState(0);
  const [evidenceText, setEvidenceText] = useState("");

  const selectedCommitTender = tenders.find((t) => t.id === Number(commitTenderId));
  const selectedRevealTender = tenders.find((t) => t.id === Number(revealTenderId));

  // Compute commit hash in real-time
  useEffect(() => {
    if (bidAmount && salt && account && commitTenderId) {
      try {
        const hash = computeCommitHash(bidAmount, salt, account, commitTenderId, CHAIN_ID);
        setComputedHash(hash);
      } catch {
        setComputedHash("");
      }
    } else {
      setComputedHash("");
    }
  }, [bidAmount, salt, account, commitTenderId]);

  // Check localStorage for saved bid on reveal tender change
  useEffect(() => {
    if (!account) return;
    const key = `opentender_bid_${revealTenderId}_${account.toLowerCase()}`;
    const saved = localStorage.getItem(key);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setRevealAmount(parsed.amountEth || "");
        setRevealSalt(parsed.salt || "");
        setHasSavedBid(true);
      } catch {
        setHasSavedBid(false);
      }
    } else {
      setHasSavedBid(false);
    }
  }, [revealTenderId, account]);

  function handleGenerateSalt() {
    const s = generateRandomSalt();
    setSalt(s);
  }

  // Handle backup file upload for manual reveal
  function handleBackupFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);
        if (data.amountEth && data.salt) {
          setRevealAmount(data.amountEth);
          setRevealSalt(data.salt);
          if (data.tenderId) setRevealTenderId(data.tenderId);
          setHasSavedBid(true);
        }
      } catch {
        alert("Invalid backup JSON file.");
      }
    };
    reader.readAsText(file);
  }

  // Submit sealed commitment
  async function handleCommit(e) {
    e.preventDefault();
    if (!signerContract || !account) {
      alert("Please connect your wallet first.");
      return;
    }
    if (!bidAmount || !salt || !computedHash) {
      alert("Please fill all bid details and generate a secret salt.");
      return;
    }

    try {
      // 1. Force backup download and save to localStorage before sending tx
      downloadBidBackup(commitTenderId, account, bidAmount, salt, computedHash);
      const key = `opentender_bid_${commitTenderId}_${account.toLowerCase()}`;
      localStorage.setItem(
        key,
        JSON.stringify({
          tenderId: Number(commitTenderId),
          bidder: account,
          amountEth: bidAmount,
          salt: salt,
          commitHash: computedHash,
          savedAt: new Date().toISOString()
        })
      );

      // 2. Send transaction with exact bid bond
      const bondVal = selectedCommitTender ? selectedCommitTender.bidBond : ethers.parseEther("1");
      setNotification({ active: true, title: `Committing Sealed Bid for Tender #${commitTenderId}...` });

      const tx = await signerContract.commitBid(commitTenderId, computedHash, { value: bondVal });
      setNotification({ active: true, title: "Waiting for block confirmation...", hash: tx.hash });
      await tx.wait();

      setNotification({
        active: false,
        hash: tx.hash,
        title: "Sealed Bid Committed Successfully!",
        success: `Your commitment hash was recorded on-chain. Required bond of ${ethers.formatEther(bondVal)} ${CURRENCY_SYMBOL} locked.`
      });
      onRefresh();
    } catch (err) {
      const msg = parseContractError(err);
      setNotification({ active: false, title: "Commitment Failed", error: msg });
    }
  }

  // Reveal bid
  async function handleReveal(e) {
    e.preventDefault();
    if (!signerContract || !account) {
      alert("Please connect your wallet first.");
      return;
    }
    if (!revealAmount || !revealSalt) {
      alert("Please provide the exact bid amount and secret salt used during commitment.");
      return;
    }

    try {
      setNotification({ active: true, title: `Revealing Bid for Tender #${revealTenderId}...` });
      const amountWei = ethers.parseEther(revealAmount.toString());

      const tx = await signerContract.revealBid(revealTenderId, amountWei, revealSalt);
      setNotification({ active: true, title: "Waiting for confirmation...", hash: tx.hash });
      await tx.wait();

      setNotification({
        active: false,
        hash: tx.hash,
        title: "Bid Revealed On-Chain!",
        success: `Successfully revealed bid of ${revealAmount} ${CURRENCY_SYMBOL}. Your position has been registered for evaluation.`
      });
      onRefresh();
    } catch (err) {
      const msg = parseContractError(err);
      setNotification({ active: false, title: "Reveal Failed", error: msg });
    }
  }

  // Claim bond refund
  async function handleClaimRefund(tenderId) {
    if (!signerContract) return;
    try {
      setNotification({ active: true, title: `Claiming Bid Bond Refund for Tender #${tenderId}...` });
      const tx = await signerContract.claimBondRefund(tenderId);
      setNotification({ active: true, title: "Confirming refund...", hash: tx.hash });
      await tx.wait();
      setNotification({
        active: false,
        hash: tx.hash,
        title: "Bond Refunded",
        success: "Bid bond deposit successfully transferred back to your wallet."
      });
      onRefresh();
    } catch (err) {
      const msg = parseContractError(err);
      setNotification({ active: false, title: "Refund Claim Failed", error: msg });
    }
  }

  // Withdraw pull-payment balance
  async function handleWithdrawBalance() {
    if (!signerContract) return;
    try {
      setNotification({ active: true, title: "Withdrawing Pull Balance..." });
      const tx = await signerContract.withdrawPullBalance();
      setNotification({ active: true, title: "Confirming withdrawal...", hash: tx.hash });
      await tx.wait();
      setNotification({
        active: false,
        hash: tx.hash,
        title: "Withdrawal Complete",
        success: `Accumulated balance of ${ethers.formatEther(claimableBalance)} ${CURRENCY_SYMBOL} transferred to wallet.`
      });
      onRefresh();
    } catch (err) {
      const msg = parseContractError(err);
      setNotification({ active: false, title: "Withdrawal Failed", error: msg });
    }
  }

  // Submit milestone completion evidence
  async function handleSubmitMilestone(e) {
    e.preventDefault();
    if (!signerContract) return;
    if (!evidenceText) {
      alert("Please provide completion evidence note or IPFS hash.");
      return;
    }

    try {
      const evidenceHash = evidenceText.startsWith("0x") && evidenceText.length === 66
        ? evidenceText
        : ethers.id(evidenceText);

      setNotification({ active: true, title: `Submitting Evidence for Milestone #${milestoneIndex}...` });
      const tx = await signerContract.submitMilestone(milestoneTenderId, milestoneIndex, evidenceHash);
      setNotification({ active: true, title: "Confirming submission...", hash: tx.hash });
      await tx.wait();

      setNotification({
        active: false,
        hash: tx.hash,
        title: "Milestone Evidence Submitted!",
        success: `Evidence registered for Milestone #${milestoneIndex}. Awaiting verifier sign-offs.`
      });
      setEvidenceText("");
      onRefresh();
    } catch (err) {
      const msg = parseContractError(err);
      setNotification({ active: false, title: "Submission Failed", error: msg });
    }
  }

  return (
    <div className="tab-pane bidder-tab">
      <div className="bidder-grid">
        {/* Panel 1: Commit Sealed Bid */}
        <div className="panel">
          <div className="panel-header">
            <h3>1. Commit Sealed Bid</h3>
            <span className="badge badge-shield">Step 1: Commit Phase</span>
          </div>

          <form onSubmit={handleCommit} className="form-card">
            <div className="form-group">
              <label>Select Target Tender</label>
              <select
                value={commitTenderId}
                onChange={(e) => {
                  setCommitTenderId(e.target.value);
                  onSelectTender(Number(e.target.value));
                }}
              >
                {tenders.map((t) => (
                  <option key={t.id} value={t.id}>
                    Tender #{t.id} (Ceiling: {ethers.formatEther(t.ceilingPrice)} {CURRENCY_SYMBOL}, Bond: {ethers.formatEther(t.bidBond)} {CURRENCY_SYMBOL})
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Your Sealed Bid Price ({CURRENCY_SYMBOL})</label>
              <input
                type="number"
                step="0.0001"
                placeholder="e.g. 45.5"
                value={bidAmount}
                onChange={(e) => setBidAmount(e.target.value)}
                required
              />
              {selectedCommitTender && (
                <div className="field-hint">
                  Max ceiling: {ethers.formatEther(selectedCommitTender.ceilingPrice)} {CURRENCY_SYMBOL}
                </div>
              )}
            </div>

            <div className="form-group">
              <div className="label-row">
                <label>Cryptographic Secret Salt (32-bytes)</label>
                <button type="button" className="btn-mini btn-secondary" onClick={handleGenerateSalt}>
                  🎲 Generate Salt
                </button>
              </div>
              <input
                type="text"
                placeholder="Click Generate Salt or paste 0x... hex"
                value={salt}
                onChange={(e) => setSalt(e.target.value)}
                required
              />
            </div>

            {computedHash && (
              <div className="computed-hash-box">
                <div className="hash-title">Computed keccak256 Commitment Hash:</div>
                <code className="hash-val">{computedHash}</code>
                <div className="hash-note">
                  🔒 Binds your price + salt + wallet + Tender #{commitTenderId} + Chain #{CHAIN_ID}.
                </div>
              </div>
            )}

            <div className="backup-notice">
              ⚠️ <strong>Mandatory Safety:</strong> A backup JSON containing your amount and salt will be automatically downloaded to your computer when you submit.
            </div>

            <button type="submit" className="btn btn-primary btn-block">
              📥 Download Backup &amp; Submit Sealed Bid
            </button>
          </form>
        </div>

        {/* Panel 2: Reveal Sealed Bid */}
        <div className="panel">
          <div className="panel-header">
            <h3>2. Reveal Sealed Bid</h3>
            <span className="badge badge-reveal">Step 2: Reveal Phase</span>
          </div>

          <form onSubmit={handleReveal} className="form-card">
            <div className="form-group">
              <label>Select Tender to Reveal</label>
              <select
                value={revealTenderId}
                onChange={(e) => {
                  setRevealTenderId(e.target.value);
                  onSelectTender(Number(e.target.value));
                }}
              >
                {tenders.map((t) => (
                  <option key={t.id} value={t.id}>
                    Tender #{t.id}
                  </option>
                ))}
              </select>
            </div>

            {hasSavedBid ? (
              <div className="saved-bid-pill">
                <span>✅ Found saved local backup credentials for this tender</span>
              </div>
            ) : (
              <div className="backup-upload-box">
                <label>No local backup found. Import your backup JSON:</label>
                <input type="file" accept=".json" onChange={handleBackupFileUpload} />
              </div>
            )}

            <div className="form-group">
              <label>Exact Revealed Bid Amount ({CURRENCY_SYMBOL})</label>
              <input
                type="number"
                step="0.0001"
                placeholder="Exact committed amount"
                value={revealAmount}
                onChange={(e) => setRevealAmount(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label>Exact Secret Salt</label>
              <input
                type="text"
                placeholder="0x..."
                value={revealSalt}
                onChange={(e) => setRevealSalt(e.target.value)}
                required
              />
            </div>

            <button type="submit" className="btn btn-success btn-block">
              🔓 Reveal Sealed Bid On-Chain
            </button>
          </form>
        </div>
      </div>

      {/* Panel 3: Bidder Financials & Milestone Deliverables */}
      <div className="panel bidder-actions-panel">
        <div className="financials-split">
          {/* Pull Payments & Refunds */}
          <div className="pull-card">
            <h4>Claimable Pull-Payment Balance</h4>
            <div className="pull-balance-display">
              <span className="pull-val">
                {claimableBalance ? parseFloat(ethers.formatEther(claimableBalance)).toFixed(4) : "0.0000"} {CURRENCY_SYMBOL}
              </span>
              <button
                className="btn btn-secondary"
                disabled={!claimableBalance || claimableBalance === 0n}
                onClick={handleWithdrawBalance}
              >
                💸 Withdraw Pull Balance
              </button>
            </div>
            <p className="field-hint">
              Funds from milestone releases, late delivery refunds, or non-reveal forfeits are safe in the pull ledger.
            </p>

            <div className="refund-row">
              <label>Claim Bid Bond for Losers / Cancelled Tenders:</label>
              <div className="inline-action">
                <select
                  value={commitTenderId}
                  onChange={(e) => setCommitTenderId(e.target.value)}
                >
                  {tenders.map((t) => (
                    <option key={t.id} value={t.id}>
                      Tender #{t.id}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => handleClaimRefund(commitTenderId)}
                >
                  Refund Bond
                </button>
              </div>
            </div>
          </div>

          {/* Contractor Milestone Evidence Submission */}
          <div className="milestone-submit-card">
            <h4>Contractor: Submit Milestone Completion Evidence</h4>
            <p className="field-hint">
              Only the awarded contractor can submit completion proofs for the current pending milestone.
            </p>
            <form onSubmit={handleSubmitMilestone} className="form-inline-stack">
              <div className="form-row">
                <div className="form-group col-half">
                  <label>Tender ID</label>
                  <select
                    value={milestoneTenderId}
                    onChange={(e) => setMilestoneTenderId(e.target.value)}
                  >
                    {tenders.map((t) => (
                      <option key={t.id} value={t.id}>
                        Tender #{t.id}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group col-half">
                  <label>Milestone Index</label>
                  <input
                    type="number"
                    min="0"
                    value={milestoneIndex}
                    onChange={(e) => setMilestoneIndex(parseInt(e.target.value, 10))}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Evidence Note / Document Hash (IPFS or SHA256)</label>
                <input
                  type="text"
                  placeholder="e.g. Completed foundations inspected. IPFS: Qm..."
                  value={evidenceText}
                  onChange={(e) => setEvidenceText(e.target.value)}
                  required
                />
              </div>

              <button type="submit" className="btn btn-primary">
                📤 Submit Milestone Evidence
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
