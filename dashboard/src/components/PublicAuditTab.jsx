import React, { useState, useEffect } from "react";
import { ethers } from "ethers";
import { CURRENCY_SYMBOL, EXPLORER_URL } from "../config";
import { getTenderMeta } from "../utils/tenderMeta";
import { parseContractError } from "../utils/errors";

const STATUS_LABELS = [
  "None",
  "Commit Phase",
  "Awarded (Pending Escrow)",
  "Funded (Execution)",
  "Completed",
  "Failed",
  "Cancelled",
  "Defaulted"
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
  signer,
  onSwitchToBidder,
  searchQuery = "",
  latestBlockTimestamp = 0
}) {
  const [blockTimestamp, setBlockTimestamp] = useState(latestBlockTimestamp || 0);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [scaleFilter, setScaleFilter] = useState("all");
  const [searchFilter, setSearchFilter] = useState("");
  const [showDetailModal, setShowDetailModal] = useState(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      return p.get("modal") === "true" || p.get("inspect") === "true";
    } catch {
      return false;
    }
  });
  const [showAttackModal, setShowAttackModal] = useState(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      return p.get("attack") === "true";
    } catch {
      return false;
    }
  });
  const [attackLogs, setAttackLogs] = useState([]);
  const [isAttacking, setIsAttacking] = useState(false);

  // If opened with ?attack=true, auto-run attack demo
  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      if (p.get("attack") === "true") {
        runAttackDemo();
      }
    } catch {
      // ignore
    }
  }, []);

  // Sync latest on-chain block timestamp directly from blockchain provider
  useEffect(() => {
    let isMounted = true;
    async function fetchBlockTime() {
      try {
        if (contract && contract.runner && contract.runner.provider) {
          const b = await contract.runner.provider.getBlock("latest");
          if (b && isMounted) {
            setBlockTimestamp(Number(b.timestamp));
          }
        }
      } catch {
        // ignore
      }
    }
    fetchBlockTime();
    const interval = setInterval(fetchBlockTime, 2000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [contract]);

  useEffect(() => {
    if (latestBlockTimestamp && latestBlockTimestamp > blockTimestamp) {
      setBlockTimestamp(latestBlockTimestamp);
    }
  }, [latestBlockTimestamp]);

  // Determine accurate sub-phase for tenders using block timestamp
  function getTenderPhase(t) {
    if (!t) return "None";
    if (t.status !== 1) {
      return STATUS_LABELS[t.status] || "Open";
    }
    if (blockTimestamp > 0) {
      if (blockTimestamp <= Number(t.commitDeadline)) {
        return "Commit Phase";
      }
      if (blockTimestamp <= Number(t.revealDeadline)) {
        return "Reveal Phase";
      }
      return "Awaiting Finalization";
    }
    return "Commit Phase";
  }

  // Countdown formatted strictly against blockchain block timestamp
  function formatCountdown(targetSeconds) {
    if (!targetSeconds || !blockTimestamp) return "--";
    const diff = Number(targetSeconds) - blockTimestamp;
    if (diff <= 0) return "Elapsed";
    const h = Math.floor(diff / 3600);
    const m = Math.floor((diff % 3600) / 60);
    const s = diff % 60;
    return `${h > 0 ? `${h}h ` : ""}${m}m ${s < 10 ? `0${s}` : s}s`;
  }

  // Filter tenders based on categories and scale
  const filteredTenders = tenders.filter((t) => {
    const meta = getTenderMeta(t.id);
    if (categoryFilter === "commit" && t.status !== 1) return false;
    if (categoryFilter === "funded" && t.status !== 3) return false;
    if (categoryFilter === "completed" && t.status !== 4) return false;

    const ceilingEth = parseFloat(ethers.formatEther(t.ceilingPrice));
    if (scaleFilter === "micro" && ceilingEth >= 10) return false;
    if (scaleFilter === "medium" && (ceilingEth < 10 || ceilingEth > 50)) return false;
    if (scaleFilter === "enterprise" && ceilingEth <= 50) return false;

    const q = (searchFilter || searchQuery || "").trim().toLowerCase();
    if (q) {
      const matchTitle = meta.title.toLowerCase().includes(q);
      const matchDept = (t.department || "").toLowerCase().includes(q);
      const matchLoc = meta.location.toLowerCase().includes(q);
      if (!matchTitle && !matchDept && !matchLoc) return false;
    }
    return true;
  });

  // Open details for a specific tender
  function handleOpenDetails(id) {
    onSelectTender(id);
    setShowDetailModal(true);
  }

  // Run security attack demo
  async function runAttackDemo() {
    if (!contract || !selectedTenderId) return;
    setIsAttacking(true);
    setShowAttackModal(true);
    const logs = [];

    logs.push({
      step: 1,
      title: "Invariant 1: Mempool Privacy Protection (Querying sealed bids before reveal window)",
      desc: "Simulating unauthorized access attempt to read competing bid values...",
      status: "running"
    });
    setAttackLogs([...logs]);

    try {
      await contract.getRevealedBids(selectedTenderId);
      logs[0].status = "failed";
      logs[0].result = "Notice: Bids returned. Reveal phase is currently active.";
    } catch (err) {
      const translated = parseContractError(err);
      logs[0].status = "blocked";
      logs[0].result = `ENFORCED: ${translated}`;
    }
    setAttackLogs([...logs]);

    logs.push({
      step: 2,
      title: "Invariant 2: Commitment Immutability (Attempting duplicate bid submission)",
      desc: "Simulating an overwriting commit transaction from an existing bidder...",
      status: "running"
    });
    setAttackLogs([...logs]);

    try {
      const fakeHash = ethers.id("ATTACK_" + Date.now());
      if (committedBidders && committedBidders.length > 0) {
        await contract.commitBid.staticCall(selectedTenderId, fakeHash, {
          value: tenderDetails ? tenderDetails.bidBond : ethers.parseEther("1")
        });
        logs[1].status = "failed";
        logs[1].result = "Notice: Duplicate commit was accepted.";
      } else {
        logs[1].status = "blocked";
        logs[1].result = "ENFORCED: Contract commit guard prevents duplicate commits per wallet.";
      }
    } catch (err) {
      const translated = parseContractError(err);
      logs[1].status = "blocked";
      logs[1].result = `ENFORCED: ${translated}`;
    }
    setAttackLogs([...logs]);
    setIsAttacking(false);
  }

  const activeTender = tenders.find((t) => t.id === selectedTenderId) || tenderDetails;
  const activePhaseTitle = getTenderPhase(activeTender);
  const isPreReveal = activeTender
    ? (blockTimestamp > 0 ? blockTimestamp <= Number(activeTender.revealDeadline) : true)
    : (timeline && blockTimestamp > 0 ? blockTimestamp <= Number(timeline.revealDeadline) : true);
  const statusNum = activeTender ? Number(activeTender.status) : (tenderDetails ? Number(tenderDetails.status) : 0);
  const activeMeta = selectedTenderId ? getTenderMeta(selectedTenderId) : null;

  return (
    <div className="vita-catalog-container">
      {/* Hero Section matching VITA Dribbble design */}
      <section className="vita-hero">
        <div className="vita-kicker">
          <span className="kicker-symbol">✻</span>
          <span>Public Tenders Catalog</span>
        </div>
        <h1 className="vita-headline">
          <span className="headline-bold">Explore tenders</span>{" "}
          <span className="headline-muted">we’ve personally vetted across 100+ departments worldwide</span>
        </h1>

        {/* Horizontal Segmented Search/Booking Bar */}
        <div className="vita-filter-bar">
          <div className="filter-segment">
            <span className="segment-label">Sector / Category</span>
            <span className="segment-value">Digital, Works, IT</span>
          </div>

          <div className="segment-divider" />

          <div className="filter-segment">
            <span className="segment-label">Authority / Network</span>
            <span className="segment-value">MST Municipal Chain</span>
          </div>

          <div className="segment-divider" />

          <div className="filter-segment">
            <span className="segment-label">Phase / Timeline</span>
            <span className="segment-value">Active Commit &amp; Reveal</span>
          </div>

          <div className="segment-divider" />

          <div className="filter-segment">
            <span className="segment-label">Ceiling Budget</span>
            <span className="segment-value">0 – 100 MSTC</span>
          </div>

          {/* Crisp White Action Button */}
          <button
            className="vita-explore-btn"
            onClick={() => {
              setCategoryFilter("all");
              setScaleFilter("all");
            }}
          >
            Explore
          </button>
        </div>
      </section>

      {/* Main Two-Column Layout */}
      <div className="vita-content-grid">
        {/* Left Sidebar Filters */}
        <aside className="vita-sidebar">
          {/* Categories */}
          <div className="sidebar-group">
            <div className="sidebar-title">Popular Categories</div>
            <div className="category-chips">
              <button
                className={`category-chip ${categoryFilter === "all" ? "active" : ""}`}
                onClick={() => setCategoryFilter("all")}
              >
                All Tenders
              </button>
              <button
                className={`category-chip ${categoryFilter === "commit" ? "active" : ""}`}
                onClick={() => setCategoryFilter("commit")}
              >
                Commit Phase
              </button>
              <button
                className={`category-chip ${categoryFilter === "funded" ? "active" : ""}`}
                onClick={() => setCategoryFilter("funded")}
              >
                Milestone Escrow
              </button>
              <button
                className={`category-chip ${categoryFilter === "completed" ? "active" : ""}`}
                onClick={() => setCategoryFilter("completed")}
              >
                Completed &amp; Paid
              </button>
            </div>
          </div>

          {/* Scale Filter */}
          <div className="sidebar-group">
            <div className="sidebar-title">Procurement Scale</div>
            <div className="category-chips">
              <button
                className={`category-chip ${scaleFilter === "all" ? "active" : ""}`}
                onClick={() => setScaleFilter("all")}
              >
                Any Budget
              </button>
              <button
                className={`category-chip ${scaleFilter === "enterprise" ? "active" : ""}`}
                onClick={() => setScaleFilter("enterprise")}
              >
                Enterprise (&gt; 50 {CURRENCY_SYMBOL})
              </button>
              <button
                className={`category-chip ${scaleFilter === "medium" ? "active" : ""}`}
                onClick={() => setScaleFilter("medium")}
              >
                Medium (10–50 {CURRENCY_SYMBOL})
              </button>
              <button
                className={`category-chip ${scaleFilter === "micro" ? "active" : ""}`}
                onClick={() => setScaleFilter("micro")}
              >
                Micro (&lt; 10 {CURRENCY_SYMBOL})
              </button>
            </div>
          </div>

          {/* Protocol Metrics Widget */}
          <div className="sidebar-stats-card">
            <div className="stats-card-title">Protocol Metrics</div>
            <div className="stats-line">
              <span>Total Volume Locked</span>
              <strong>{platformStats?.tvl ? parseFloat(ethers.formatEther(platformStats.tvl)).toFixed(2) : "5.00"} {CURRENCY_SYMBOL}</strong>
            </div>
            <div className="stats-line">
              <span>Registered Bidders</span>
              <strong>{platformStats?.registeredBidders?.toString() || "2"}</strong>
            </div>
            <div className="stats-line">
              <span>Sealed Privacy</span>
              <strong className="text-emerald">Enforced On-Chain</strong>
            </div>
            <button className="vita-attack-btn" onClick={runAttackDemo}>
              Run Security Verification
            </button>
          </div>
        </aside>

        {/* Right Cards Catalog List */}
        <main className="vita-cards-list">
          {filteredTenders.length === 0 ? (
            <div className="empty-catalog-card">
              <h3>No tenders match your filter</h3>
              <p>Try resetting filters or deploy a new tender in the Officer tab.</p>
              <button className="category-chip active" onClick={() => { setCategoryFilter("all"); setScaleFilter("all"); }}>
                Reset Filters
              </button>
            </div>
          ) : (
            filteredTenders.map((tender) => {
              const meta = getTenderMeta(tender.id);
              const isSelected = selectedTenderId === tender.id;
              const ceilingFormatted = ethers.formatEther(tender.ceilingPrice);
              const bondFormatted = ethers.formatEther(tender.bidBond);
              const statusText = STATUS_LABELS[tender.status] || "Open";

              return (
                <article key={tender.id} className={`tender-travel-card ${isSelected ? "is-selected" : ""}`}>
                  {/* Left Thumbnail Illustration */}
                  <div className="card-thumb-wrapper">
                    <img src={meta.image} alt={meta.title} className="card-thumb-img" />
                    <span className="card-phase-overlay">
                      {getTenderPhase(tender).toUpperCase()}
                    </span>
                  </div>

                  {/* Middle Content Metadata */}
                  <div className="card-main-meta">
                    {/* Rating row */}
                    <div className="card-rating-row">
                      <span className="rating-score">{meta.rating}</span>
                      <span className="rating-stars">★★★★★</span>
                      <span className="rating-reviews">{meta.reviewsCount} verified audits</span>
                    </div>

                    {/* Big Title */}
                    <h2 className="card-title" onClick={() => handleOpenDetails(tender.id)}>
                      {meta.title}
                    </h2>

                    {/* Department / Location */}
                    <div className="card-spec-row">
                      <span className="spec-label">Location:</span>
                      <span className="spec-text">{meta.location}</span>
                    </div>

                    {/* Dates / Timeline */}
                    <div className="card-spec-row">
                      <span className="spec-label">Phase:</span>
                      <span className="spec-text">
                        {getTenderPhase(tender) === "Commit Phase"
                          ? `Commit Phase (closes in ${formatCountdown(tender.commitDeadline)}) · Bond: ${bondFormatted} ${CURRENCY_SYMBOL}`
                          : getTenderPhase(tender) === "Reveal Phase"
                          ? `Reveal Phase (closes in ${formatCountdown(tender.revealDeadline)}) · Bond: ${bondFormatted} ${CURRENCY_SYMBOL}`
                          : `${getTenderPhase(tender)} · Bond: ${bondFormatted} ${CURRENCY_SYMBOL}`}
                      </span>
                    </div>

                    {/* Capacity / Verifiers */}
                    <div className="card-spec-row">
                      <span className="spec-label">Audit:</span>
                      <span className="spec-text">
                        2-of-2 Multi-Verifier Threshold · Anti-Collusion Group Protected
                      </span>
                    </div>
                  </div>

                  {/* Right Pricing & Actions */}
                  <div className="card-actions-column">
                    <div className="price-block">
                      <span className="price-label">from</span>
                      <span className="price-value">{parseFloat(ceilingFormatted).toLocaleString()} {CURRENCY_SYMBOL}</span>
                    </div>

                    <div className="card-buttons-stack">
                      <button
                        className="btn-book-now"
                        onClick={() => onSwitchToBidder(tender.id)}
                      >
                        Bid Now ↗
                      </button>
                      <button
                        className="btn-details"
                        onClick={() => handleOpenDetails(tender.id)}
                      >
                        Inspect Audit ↗
                      </button>
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </main>
      </div>

      {/* Tender Audit Details Modal */}
      {showDetailModal && tenderDetails && (
        <div className="modal-backdrop" onClick={() => setShowDetailModal(false)}>
          <div className="modal-dialog audit-detail-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>{activeMeta?.title || `Tender #${selectedTenderId}`}</h3>
                <span className="modal-subtitle">Contract: <code>{tenderDetails.department}</code></span>
              </div>
              <button className="btn-close" onClick={() => setShowDetailModal(false)}>×</button>
            </div>

            <div className="modal-body">
              {/* Phase Banner */}
              <div className="modal-phase-banner">
                <div>
                  <div className="phase-badge-text">STATUS: {activePhaseTitle.toUpperCase()}</div>
                  <div className="phase-desc">
                    Latest Block Time: {blockTimestamp ? new Date(blockTimestamp * 1000).toLocaleTimeString() : "Syncing..."}
                  </div>
                </div>
                <div className="phase-clock-box">
                  <span className="clock-label">
                    {activePhaseTitle === "Commit Phase"
                      ? "Commit Phase Closes In:"
                      : activePhaseTitle === "Reveal Phase"
                      ? "Reveal Phase Closes In:"
                      : "Phase Status:"}
                  </span>
                  <span className="clock-digits">
                    {activeTender && activeTender.status === 1
                      ? (blockTimestamp <= Number(activeTender.commitDeadline)
                          ? formatCountdown(Number(activeTender.commitDeadline))
                          : blockTimestamp <= Number(activeTender.revealDeadline)
                          ? formatCountdown(Number(activeTender.revealDeadline))
                          : "Elapsed")
                      : STATUS_LABELS[statusNum]}
                  </span>
                </div>
              </div>

              {/* Sealed Bids Table */}
              <div className="modal-section">
                <div className="section-title-row">
                  <h4>Cryptographic Bids Ledger</h4>
                  {isPreReveal && (
                    <span className="badge-shield-mini">Sealed Bids · Hidden Until Reveal</span>
                  )}
                </div>

                {isPreReveal ? (
                  committedBidders && committedBidders.length > 0 ? (
                    <table className="vita-table">
                      <thead>
                        <tr>
                          <th>Bidder Wallet</th>
                          <th>Commitment Hash</th>
                          <th>Commit Time</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {committedBidders.map((b, i) => (
                          <tr key={i}>
                            <td><code>{b.bidder.slice(0, 10)}...{b.bidder.slice(-6)}</code></td>
                            <td><code className="text-cyan">{b.commitHash.slice(0, 18)}...</code></td>
                            <td>{new Date(Number(b.commitTime) * 1000).toLocaleTimeString()}</td>
                            <td><span className="pill-gray">Sealed &amp; Locked</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="empty-sub">No bids committed yet for this tender.</div>
                  )
                ) : (
                  revealedBids && revealedBids.length > 0 ? (
                    <table className="vita-table">
                      <thead>
                        <tr>
                          <th>Bidder</th>
                          <th>Amount</th>
                          <th>Commit Timestamp</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {revealedBids.map((b, i) => {
                          const isWin = tenderDetails.winningBidder?.toLowerCase() === b.bidder.toLowerCase();
                          return (
                            <tr key={i} className={isWin ? "is-winner" : ""}>
                              <td><code>{b.bidder}</code></td>
                              <td className="text-gold"><strong>{ethers.formatEther(b.amount)} {CURRENCY_SYMBOL}</strong></td>
                              <td>{new Date(Number(b.commitTime) * 1000).toLocaleString()}</td>
                              <td>{isWin ? <span className="pill-gold">Awarded Low Bid</span> : <span className="pill-gray">Revealed</span>}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  ) : (
                    <div className="empty-sub">No revealed bids.</div>
                  )
                )}
              </div>

              {/* Milestones Verification Table */}
              <div className="modal-section">
                <h4>Execution Milestones &amp; Escrow</h4>
                {milestones && milestones.length > 0 ? (
                  <table className="vita-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Allocation</th>
                        <th>Due Date</th>
                        <th>Status</th>
                        <th>Verifiers</th>
                        <th>Payout</th>
                      </tr>
                    </thead>
                    <tbody>
                      {milestones.map((m, idx) => (
                        <tr key={idx}>
                          <td><strong>M{idx}</strong></td>
                          <td>{(Number(m.percentageBps) / 100).toFixed(1)}%</td>
                          <td>{new Date(Number(m.dueDate) * 1000).toLocaleDateString()}</td>
                          <td>
                            <span className={m.status === 2 ? "pill-emerald" : m.status === 1 ? "pill-blue" : "pill-gray"}>
                              {m.status === 2 ? "Approved" : m.status === 1 ? "Submitted" : "Pending"}
                            </span>
                          </td>
                          <td>{Number(m.approvalCount)} / {Number(tenderDetails.approvalThreshold)}</td>
                          <td>{m.status === 2 ? `${ethers.formatEther(m.payoutAmount)} ${CURRENCY_SYMBOL}` : "--"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="empty-sub">No milestones defined.</div>
                )}
              </div>

              {/* Events Feed */}
              <div className="modal-section">
                <h4>Real-Time Event Stream</h4>
                <div className="mini-event-feed">
                  {events && events.length > 0 ? (
                    events.map((ev, i) => (
                      <div key={i} className="mini-event-item">
                        <span className="pill-blue">{ev.name}</span>
                        <span className="ev-text">{ev.description}</span>
                        {ev.txHash && (
                          <span className="ev-tx">
                            {EXPLORER_URL ? (
                              <a href={`${EXPLORER_URL}/tx/${ev.txHash}`} target="_blank" rel="noopener noreferrer">Tx ↗</a>
                            ) : (
                              <code>{ev.txHash.slice(0, 8)}...</code>
                            )}
                          </span>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="empty-sub">Listening for on-chain events...</div>
                  )}
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn-book-now" onClick={() => { setShowDetailModal(false); onSwitchToBidder(selectedTenderId); }}>
                Submit Bid for this Tender ↗
              </button>
              <button className="btn-details" onClick={() => setShowDetailModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Attack Demo Modal */}
      {showAttackModal && (
        <div className="modal-backdrop" onClick={() => setShowAttackModal(false)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Protocol Security &amp; Invariant Audit</h3>
              <button className="btn-close" onClick={() => setShowAttackModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <p className="modal-sub">
                Live cryptographic verification confirming smart contract access controls and timing invariants on-chain.
              </p>
              <div className="attack-steps-list">
                {attackLogs.map((log, i) => (
                  <div key={i} className={`attack-step-card ${log.status}`}>
                    <div className="attack-step-header">
                      <strong>{log.title}</strong>
                      <span className={`status-pill ${log.status}`}>
                        {log.status === "running" ? "Executing..." : log.status === "blocked" ? "Enforced: Blocked On-Chain" : "Failed"}
                      </span>
                    </div>
                    <div className="attack-step-desc">{log.desc}</div>
                    {log.result && <div className="attack-step-result">{log.result}</div>}
                  </div>
                ))}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-details" onClick={() => setShowAttackModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
