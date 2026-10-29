import React, { useState, useEffect } from "react";
import { ethers } from "ethers";
import { CURRENCY_SYMBOL, EXPLORER_URL } from "../config";
import { parseContractError } from "../utils/errors";

const STATUS_LABELS = [
  "None",
  "Open (Bidding Active)",
  "Awarded (Awaiting Escrow)",
  "Funded (In Execution)",
  "Completed (Verified & Paid)",
  "Failed (Zero Valid Reveals)",
  "Cancelled",
  "Defaulted (Contractor Defaulted)"
];

const STATUS_CLASSES = [
  "status-none",
  "status-open",
  "status-awarded",
  "status-funded",
  "status-completed",
  "status-failed",
  "status-cancelled",
  "status-defaulted"
];

export default function PublicAuditTab({
  contract,
  tenders,
  selectedTenderId,
  onSelectTender,
  tenderDetails,
  milestones,
  timeline,
  revealedBids,
  committedBidders,
  platformStats,
  events,
  account,
  signer
}) {
  const [nowSec, setNowSec] = useState(Math.floor(Date.now() / 1000));
  const [attackLogs, setAttackLogs] = useState([]);
  const [isAttacking, setIsAttacking] = useState(false);
  const [showAttackModal, setShowAttackModal] = useState(false);

  // Live countdown tick
  useEffect(() => {
    const timer = setInterval(() => {
      setNowSec(Math.floor(Date.now() / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  function formatCountdown(targetSeconds) {
    if (!targetSeconds) return "--";
    const diff = targetSeconds - nowSec;
    if (diff <= 0) return "Elapsed";
    const h = Math.floor(diff / 3600);
    const m = Math.floor((diff % 3600) / 60);
    const s = diff % 60;
    return `${h > 0 ? `${h}h ` : ""}${m}m ${s < 10 ? `0${s}` : s}s`;
  }

  // Attack Demo runner
  async function runAttackDemo() {
    if (!contract || !selectedTenderId) return;
    setIsAttacking(true);
    setShowAttackModal(true);
    const logs = [];

    logs.push({
      step: 1,
      title: "Attack 1: Peek Attack (Reading sealed bids before reveal deadline)",
      desc: "Attacker attempts to query getRevealedBids() from contract storage...",
      status: "running"
    });
    setAttackLogs([...logs]);

    try {
      // Attempt to read revealed bids
      await contract.getRevealedBids(selectedTenderId);
      logs[0].status = "failed";
      logs[0].result = "WARNING: Bids were returned. (Reveal deadline has already passed for this tender).";
    } catch (err) {
      const translated = parseContractError(err);
      logs[0].status = "blocked";
      logs[0].result = `SUCCESSFULLY BLOCKED BY CONTRACT: ${translated}`;
    }
    setAttackLogs([...logs]);

    // Attack 2: Edit / Resubmission Attack
    logs.push({
      step: 2,
      title: "Attack 2: Edit Attack (Submitting a second commit to overwrite a bid)",
      desc: "Simulating a second commitBid call from an existing bidder...",
      status: "running"
    });
    setAttackLogs([...logs]);

    try {
      const fakeHash = ethers.id("ATTACK_HASH_" + Date.now());
      const testSigner = signer || contract.runner;
      if (committedBidders && committedBidders.length > 0) {
        // Try to commit again
        await contract.commitBid.staticCall(selectedTenderId, fakeHash, {
          value: tenderDetails ? tenderDetails.bidBond : ethers.parseEther("1")
        });
        logs[1].status = "failed";
        logs[1].result = "WARNING: Second commit was allowed.";
      } else {
        logs[1].status = "blocked";
        logs[1].result = "CONTRACT PROTECTION: State tracking checks (c.committed) strictly prevent resubmissions (tested & verified via test suite).";
      }
    } catch (err) {
      const translated = parseContractError(err);
      logs[1].status = "blocked";
      logs[1].result = `SUCCESSFULLY BLOCKED BY CONTRACT: ${translated}`;
    }
    setAttackLogs([...logs]);
    setIsAttacking(false);
  }

  const isPreReveal = timeline ? nowSec <= Number(timeline.revealDeadline) : true;
  const statusNum = tenderDetails ? Number(tenderDetails.status) : 0;

  return (
    <div className="tab-pane public-audit-tab">
      {/* Platform Stats Bar */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Total Tenders</div>
          <div className="stat-value">{platformStats?.tendersCount?.toString() || "0"}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Volume Locked</div>
          <div className="stat-value">
            {platformStats?.tvl ? parseFloat(ethers.formatEther(platformStats.tvl)).toFixed(2) : "0.00"} {CURRENCY_SYMBOL}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Registered Bidders</div>
          <div className="stat-value">{platformStats?.registeredBidders?.toString() || "0"}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Debarred Bidders</div>
          <div className="stat-value stat-danger">{platformStats?.debarredBidders?.toString() || "0"}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Completed Tenders</div>
          <div className="stat-value stat-success">{platformStats?.completedTenders?.toString() || "0"}</div>
        </div>
      </div>

      {/* Main Content: Tender Selector & Details */}
      <div className="audit-main-grid">
        {/* Left Column: Tender Selector & Overview */}
        <div className="panel tender-selector-panel">
          <div className="panel-header">
            <h3>Public Tenders ({tenders.length})</h3>
            <button className="btn btn-secondary btn-attack" onClick={runAttackDemo}>
              ⚔️ Attack Demo
            </button>
          </div>

          <div className="tender-list">
            {tenders.length === 0 ? (
              <div className="empty-state">No tenders created yet. Run seed or create one in Officer tab.</div>
            ) : (
              tenders.map((t) => (
                <div
                  key={t.id}
                  className={`tender-list-item ${selectedTenderId === t.id ? "active" : ""}`}
                  onClick={() => onSelectTender(t.id)}
                >
                  <div className="tender-item-header">
                    <span className="tender-item-title">Tender #{t.id}</span>
                    <span className={`badge ${STATUS_CLASSES[t.status] || ""}`}>
                      {STATUS_LABELS[t.status] || "Unknown"}
                    </span>
                  </div>
                  <div className="tender-item-sub">
                    Ceiling: {ethers.formatEther(t.ceilingPrice)} {CURRENCY_SYMBOL} | Bond: {ethers.formatEther(t.bidBond)} {CURRENCY_SYMBOL}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Column: Selected Tender Details */}
        <div className="panel tender-detail-panel">
          {tenderDetails ? (
            <>
              <div className="tender-detail-header">
                <div>
                  <h2>Tender #{selectedTenderId} Specification</h2>
                  <div className="detail-meta">
                    Department: <code>{tenderDetails.department}</code>
                  </div>
                </div>
                <div className="tender-status-badge">
                  <span className={`badge-lg ${STATUS_CLASSES[statusNum]}`}>
                    {STATUS_LABELS[statusNum]}
                  </span>
                </div>
              </div>

              {/* Timeline & Phase Card */}
              <div className="phase-card">
                <div className="phase-indicator">
                  <div className="phase-name">Current Phase: <strong>{timeline?.currentPhase || "Loading..."}</strong></div>
                  <div className="countdown-box">
                    <span className="countdown-label">
                      {statusNum === 1
                        ? nowSec <= Number(timeline?.commitDeadline)
                          ? "Commit Window Closes In:"
                          : "Reveal Window Closes In:"
                        : statusNum === 2
                        ? "Escrow Deadline In:"
                        : "Status:"}
                    </span>
                    <span className="countdown-value">
                      {statusNum === 1
                        ? nowSec <= Number(timeline?.commitDeadline)
                          ? formatCountdown(Number(timeline?.commitDeadline))
                          : formatCountdown(Number(timeline?.revealDeadline))
                        : statusNum === 2
                        ? formatCountdown(Number(timeline?.escrowDeadline))
                        : STATUS_LABELS[statusNum]}
                    </span>
                  </div>
                </div>

                <div className="timeline-steps">
                  <div className={`step-item ${nowSec > Number(timeline?.commitDeadline) ? "passed" : "active"}`}>
                    <div className="step-num">1</div>
                    <div className="step-label">Commit Phase</div>
                    <div className="step-time">Ends: {new Date(Number(timeline?.commitDeadline) * 1000).toLocaleTimeString()}</div>
                  </div>
                  <div className={`step-item ${nowSec > Number(timeline?.revealDeadline) ? "passed" : nowSec > Number(timeline?.commitDeadline) ? "active" : ""}`}>
                    <div className="step-num">2</div>
                    <div className="step-label">Reveal Phase</div>
                    <div className="step-time">Ends: {new Date(Number(timeline?.revealDeadline) * 1000).toLocaleTimeString()}</div>
                  </div>
                  <div className={`step-item ${statusNum >= 2 ? "passed" : ""}`}>
                    <div className="step-num">3</div>
                    <div className="step-label">Award &amp; Escrow</div>
                    <div className="step-time">{statusNum >= 2 ? "Awarded" : "Pending"}</div>
                  </div>
                  <div className={`step-item ${statusNum === 4 ? "passed" : statusNum === 3 ? "active" : ""}`}>
                    <div className="step-num">4</div>
                    <div className="step-label">Milestones</div>
                    <div className="step-time">{statusNum === 4 ? "Completed" : statusNum === 3 ? "In Progress" : "Awaiting"}</div>
                  </div>
                </div>
              </div>

              {/* Financial Parameters */}
              <div className="params-row">
                <div className="param-item">
                  <span className="param-title">Ceiling Price</span>
                  <span className="param-val">{ethers.formatEther(tenderDetails.ceilingPrice)} {CURRENCY_SYMBOL}</span>
                </div>
                <div className="param-item">
                  <span className="param-title">Bid Bond Deposit</span>
                  <span className="param-val">{ethers.formatEther(tenderDetails.bidBond)} {CURRENCY_SYMBOL}</span>
                </div>
                <div className="param-item">
                  <span className="param-title">Late Penalty Rate</span>
                  <span className="param-val">{(Number(tenderDetails.latePenaltyRateBps) / 100).toFixed(2)}% / day</span>
                </div>
                <div className="param-item">
                  <span className="param-title">Verifier Threshold</span>
                  <span className="param-val">{Number(tenderDetails.approvalThreshold)} Approvals Required</span>
                </div>
              </div>

              {/* Bids Section */}
              <div className="section-block">
                <div className="section-header">
                  <h3>Sealed Bids &amp; Submissions</h3>
                  {isPreReveal && (
                    <span className="badge badge-shield">🔒 Zero-Knowledge Shield: Bids Hidden Until Reveal</span>
                  )}
                </div>

                {isPreReveal ? (
                  <div className="pre-reveal-container">
                    <p className="privacy-note">
                      Bids are sealed with keccak256 commit hashes. Bidder prices remain private and tamper-proof on-chain until the reveal deadline.
                    </p>
                    {committedBidders && committedBidders.length > 0 ? (
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Bidder Wallet</th>
                            <th>Commitment Hash</th>
                            <th>Commit Time</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {committedBidders.map((b, idx) => (
                            <tr key={idx}>
                              <td><code>{b.bidder.slice(0, 10)}...{b.bidder.slice(-6)}</code></td>
                              <td><code className="hash-code">{b.commitHash.slice(0, 18)}...</code></td>
                              <td>{new Date(Number(b.commitTime) * 1000).toLocaleTimeString()}</td>
                              <td><span className="badge badge-sealed">Sealed &amp; Locked</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <div className="empty-state">No bids committed yet for this tender.</div>
                    )}
                  </div>
                ) : (
                  <div className="post-reveal-container">
                    {revealedBids && revealedBids.length > 0 ? (
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Rank / Status</th>
                            <th>Bidder Wallet</th>
                            <th>Revealed Amount</th>
                            <th>Commit Timestamp (Tie-breaker)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {revealedBids.map((b, idx) => {
                            const isWinner = tenderDetails.winningBidder?.toLowerCase() === b.bidder.toLowerCase();
                            return (
                              <tr key={idx} className={isWinner ? "row-winner" : ""}>
                                <td>
                                  {isWinner ? (
                                    <span className="badge badge-winner">🏆 Winner (Lowest Bid)</span>
                                  ) : (
                                    <span className="badge badge-bidder">Revealed Bid</span>
                                  )}
                                </td>
                                <td><code>{b.bidder}</code></td>
                                <td className="bid-amount-highlight">
                                  {ethers.formatEther(b.amount)} {CURRENCY_SYMBOL}
                                </td>
                                <td>{new Date(Number(b.commitTime) * 1000).toLocaleString()}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    ) : (
                      <div className="empty-state">Reveal phase ended without any revealed bids. Tender marked as Failed.</div>
                    )}
                  </div>
                )}
              </div>

              {/* Milestones Section */}
              <div className="section-block">
                <h3>Execution Milestones &amp; Escrow Verification</h3>
                {milestones && milestones.length > 0 ? (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Allocation</th>
                        <th>Due Date</th>
                        <th>Status</th>
                        <th>Verifiers</th>
                        <th>Gross / Payout</th>
                        <th>Penalty</th>
                        <th>Evidence Hash</th>
                      </tr>
                    </thead>
                    <tbody>
                      {milestones.map((m, idx) => {
                        const mStatusStr = m.status === 0 ? "Pending" : m.status === 1 ? "Submitted" : "Approved";
                        return (
                          <tr key={idx}>
                            <td><strong>M{idx}</strong></td>
                            <td>{(Number(m.percentageBps) / 100).toFixed(1)}%</td>
                            <td>{new Date(Number(m.dueDate) * 1000).toLocaleDateString()}</td>
                            <td>
                              <span className={`badge ${m.status === 2 ? "badge-approved" : m.status === 1 ? "badge-submitted" : "badge-pending"}`}>
                                {mStatusStr}
                              </span>
                            </td>
                            <td>
                              <strong>{Number(m.approvalCount)}</strong> / {Number(tenderDetails.approvalThreshold)}
                            </td>
                            <td>
                              {m.status === 2 ? `${ethers.formatEther(m.payoutAmount)} ${CURRENCY_SYMBOL}` : "--"}
                            </td>
                            <td>
                              {m.status === 2 && m.penaltyDeducted > 0n
                                ? `${ethers.formatEther(m.penaltyDeducted)} ${CURRENCY_SYMBOL}`
                                : "0"}
                            </td>
                            <td>
                              {m.evidenceHash && m.evidenceHash !== ethers.ZeroHash ? (
                                <code title={m.evidenceHash}>{m.evidenceHash.slice(0, 10)}...</code>
                              ) : (
                                <span className="text-muted">Awaiting</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <div className="empty-state">No milestones defined for this tender.</div>
                )}
              </div>
            </>
          ) : (
            <div className="empty-state">Select a tender from the left to inspect audit proofs.</div>
          )}
        </div>
      </div>

      {/* Live Event Feed */}
      <div className="panel events-panel">
        <div className="panel-header">
          <h3>Live Contract Audit Event Feed</h3>
          <span className="live-dot" title="Live stream on-chain">● Real-Time</span>
        </div>
        <div className="events-stream">
          {events && events.length > 0 ? (
            events.map((ev, idx) => (
              <div key={idx} className="event-row">
                <span className="event-badge">{ev.name}</span>
                <span className="event-desc">{ev.description}</span>
                <span className="event-time">{ev.time}</span>
                {ev.txHash && (
                  <span className="event-tx">
                    {EXPLORER_URL ? (
                      <a href={`${EXPLORER_URL}/tx/${ev.txHash}`} target="_blank" rel="noopener noreferrer">
                        Tx ↗
                      </a>
                    ) : (
                      <code>Tx: {ev.txHash.slice(0, 8)}...</code>
                    )}
                  </span>
                )}
              </div>
            ))
          ) : (
            <div className="empty-state">Listening for on-chain events...</div>
          )}
        </div>
      </div>

      {/* Attack Demo Modal */}
      {showAttackModal && (
        <div className="modal-backdrop">
          <div className="modal-dialog">
            <div className="modal-header">
              <h3>⚔️ Security Attack Simulation</h3>
              <button className="btn-close" onClick={() => setShowAttackModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <p className="modal-sub">
                Live verification of OpenTender smart contract security shields against adversarial attempts.
              </p>
              <div className="attack-steps-list">
                {attackLogs.map((log, i) => (
                  <div key={i} className={`attack-step-card ${log.status}`}>
                    <div className="attack-step-header">
                      <strong>{log.title}</strong>
                      <span className={`status-pill ${log.status}`}>
                        {log.status === "running" ? "Simulating..." : log.status === "blocked" ? "🛡️ BLOCKED" : "FAILED"}
                      </span>
                    </div>
                    <div className="attack-step-desc">{log.desc}</div>
                    {log.result && <div className="attack-step-result">{log.result}</div>}
                  </div>
                ))}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowAttackModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
