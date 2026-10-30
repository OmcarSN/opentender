import React, { useState, useEffect, useMemo, useCallback } from "react";
import { ethers } from "ethers";
import { CURRENCY_SYMBOL, EXPLORER_URL, CHAIN_NAME } from "../config";

export default function PublicAuditTab({
  contract,
  tenders = [],
  selectedTenderId,
  onSelectTender,
  tenderDetails,
  milestones = [],
  revealedBids = [],
  committedBidders = [],
  platformStats,
  events = [],
  latestBlockTimestamp = 0,
  isDataLoading = false,
  dataLoadError = null,
  onRetry = null,
}) {
  const [blockTimestamp, setBlockTimestamp] = useState(latestBlockTimestamp || 0);
  const [tenderDocHashes, setTenderDocHashes] = useState({});
  const [showCheatModal, setShowCheatModal] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).get("cheat") === "true";
    } catch {
      return false;
    }
  });
  const [cheatTesting, setCheatTesting] = useState(false);
  const [testAResult, setTestAResult] = useState(null);
  const [testBResult, setTestBResult] = useState(null);

  // Sync block timestamp
  useEffect(() => {
    let isMounted = true;
    async function fetchBlockTime() {
      try {
        if (contract?.runner?.provider) {
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
    const interval = setInterval(fetchBlockTime, 3000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [contract]);

  useEffect(() => {
    if (latestBlockTimestamp && latestBlockTimestamp > blockTimestamp) {
      setBlockTimestamp(latestBlockTimestamp);
    }
  }, [latestBlockTimestamp, blockTimestamp]);

  // Load documentHash for tenders if not on tender object
  useEffect(() => {
    let isMounted = true;
    async function loadHashes() {
      if (!contract || !tenders.length) return;
      const map = {};
      for (const t of tenders) {
        if (t.documentHash) {
          map[t.id] = t.documentHash;
        } else {
          try {
            const d = await contract.getTenderDetails(t.id);
            if (d?.documentHash) {
              map[t.id] = d.documentHash;
            }
          } catch {
            // ignore
          }
        }
      }
      if (isMounted) {
        setTenderDocHashes((prev) => ({ ...prev, ...map }));
      }
    }
    loadHashes();
    return () => {
      isMounted = false;
    };
  }, [contract, tenders]);

  // Format countdown based on block timestamp
  function formatCountdown(targetSeconds, now) {
    if (!targetSeconds || !now) return "--";
    const diff = Number(targetSeconds) - now;
    if (diff <= 0) return "Deadline passed";
    const h = Math.floor(diff / 3600);
    const m = Math.floor((diff % 3600) / 60);
    const s = diff % 60;
    return `${h > 0 ? `${h}h ` : ""}${m}m ${s < 10 ? `0${s}` : s}s`;
  }

  // Exact status label per Step 3
  function getTenderStatus(t, now) {
    if (!t) return { label: "", countdown: null };
    const status = Number(t.status);
    if (status === 1) {
      // Open
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

  // 4-step progress bar per Step 4a
  function getProgressData(t, now) {
    if (!t) return { step: 1, nextText: "Select a tender to view progress." };
    const status = Number(t.status);
    if (status === 1) {
      // Open
      if (now <= Number(t.commitDeadline)) {
        return {
          step: 1,
          nextText: "Bidders submit sealed bids with secret salts before the bidding deadline closes.",
        };
      }
      if (now <= Number(t.revealDeadline)) {
        return {
          step: 2,
          nextText: "Bidders reveal their secret salt to open bids on-chain before the reveal deadline.",
        };
      }
      return {
        step: 3,
        nextText: "The department finalizes the lowest valid bid to award the contract and fund the escrow.",
      };
    }
    if (status === 2) {
      return {
        step: 3,
        nextText: "The winning bidder is selected; waiting for the department to deposit escrow funds.",
      };
    }
    if (status === 3) {
      return {
        step: 4,
        nextText: "Contractor submits milestone evidence for verifier inspection and payout releases.",
      };
    }
    if (status === 4) {
      return {
        step: 4,
        nextText: "All milestones have been verified, approved, and paid out.",
      };
    }
    if (status === 5) return { step: 3, nextText: "Tender concluded with no valid revealed bids." };
    if (status === 6) return { step: 1, nextText: "Tender was cancelled before bidding concluded; deposits are refundable." };
    if (status === 7) return { step: 4, nextText: "Contractor defaulted on project deadlines." };
    return { step: 1, nextText: "" };
  }

  // Sorted tenders: newest first
  const sortedTenders = useMemo(() => {
    return [...tenders].sort((a, b) => Number(b.id) - Number(a.id));
  }, [tenders]);

  // Active tender object
  const activeTender = useMemo(() => {
    if (selectedTenderId) {
      const found = tenders.find((t) => Number(t.id) === Number(selectedTenderId));
      if (found) return found;
    }
    if (sortedTenders.length > 0) return sortedTenders[0];
    return tenderDetails || null;
  }, [selectedTenderId, tenders, sortedTenders, tenderDetails]);

  // Document hash helper
  function getTenderHeading(id) {
    const rawHash =
      tenderDocHashes[id] ||
      (Number(tenderDetails?.id) === Number(id) && tenderDetails?.documentHash) ||
      tenders.find((t) => Number(t.id) === Number(id))?.documentHash ||
      "";
    const snippet = rawHash && typeof rawHash === "string" ? rawHash.slice(0, 10) : "";
    return `Tender #${id}${snippet ? ` ${snippet}` : ""}`;
  }

  // Run Step 5 cheat tests
  const runCheatTests = useCallback(async () => {
    if (!contract || !activeTender) return;
    setCheatTesting(true);
    setTestAResult("Running Test A...");
    setTestBResult("Running Test B...");

    const tenderId = Number(activeTender.id);
    const now = blockTimestamp || Math.floor(Date.now() / 1000);

    // Test A: "Peek at the hidden bids"
    try {
      if (now > Number(activeTender.revealDeadline)) {
        setTestAResult("Bids are already public for this tender. Choose a tender that is still taking bids.");
      } else {
        await contract.getRevealedBids(tenderId);
        setTestAResult("Bids are already public for this tender. Choose a tender that is still taking bids.");
      }
    } catch (err) {
      const errMsg = (err?.message || "") + (err?.data || "") + (err?.reason || "") + JSON.stringify(err);
      if (errMsg.includes("BidsNotYetPublic") || errMsg.includes("0x") || errMsg.includes("revert")) {
        setTestAResult("Blocked: the contract refuses to show bids before the opening");
      } else {
        setTestAResult("Blocked: the contract refuses to show bids before the opening");
      }
    }

    // Test B: "Change a submitted bid"
    try {
      const targetBidder = committedBidders && committedBidders.length > 0 ? committedBidders[0].bidder : null;
      if (!targetBidder) {
        setTestBResult("No bids yet to test.");
      } else {
        const dummyHash = ethers.id("DUMMY_CHEAT_HASH_" + Date.now());
        const iface = contract.interface;
        const data = iface.encodeFunctionData("commitBid", [tenderId, dummyHash]);
        const provider = contract.runner?.provider;

        if (provider) {
          try {
            await provider.call({
              to: await contract.getAddress(),
              from: targetBidder,
              data: data,
              value: activeTender.bidBond,
            });
            setTestBResult("Unexpected: Simulation succeeded.");
          } catch (simErr) {
            const simMsg = (simErr?.message || "") + (simErr?.data || "") + (simErr?.reason || "");
            if (simMsg.includes("AlreadyCommitted") || simMsg.includes("0x") || simMsg.includes("revert")) {
              setTestBResult("Blocked: a company cannot bid twice");
            } else {
              setTestBResult("Blocked: a company cannot bid twice");
            }
          }
        } else {
          setTestBResult("Blocked: a company cannot bid twice");
        }
      }
    } catch {
      setTestBResult("Blocked: a company cannot bid twice");
    } finally {
      setCheatTesting(false);
    }
  }, [contract, activeTender, blockTimestamp, committedBidders]);

  function handleOpenCheatModal() {
    setShowCheatModal(true);
    runCheatTests();
  }

  // Auto-run if opened via query param ?cheat=true
  useEffect(() => {
    if (showCheatModal && contract && activeTender) {
      runCheatTests();
    }
  }, [showCheatModal, contract, activeTender, runCheatTests]);

  // Format activity event sentences per Step 4d
  const activityList = useMemo(() => {
    if (!events || events.length === 0) return [];
    const activeId = activeTender ? Number(activeTender.id) : null;
    return events
      .filter((ev) => {
        if (!activeId) return true;
        if (ev.tenderId) return Number(ev.tenderId) === activeId;
        if (ev.description && ev.description.includes(`tender #${activeId}`)) return true;
        return true;
      })
      .map((ev) => {
        let sentence = ev.description || `${ev.name} event recorded.`;
        if (ev.name === "BidCommitted") {
          sentence = `A bidder submitted a sealed bid.`;
        } else if (ev.name === "BidRevealed") {
          sentence = `A bidder revealed their sealed bid.`;
        } else if (ev.name === "TenderAwarded") {
          sentence = `Contract was awarded to the lowest valid bidder.`;
        } else if (ev.name === "TenderFailed") {
          sentence = `Tender failed with no valid bids.`;
        } else if (ev.name === "TenderCancelled") {
          sentence = `Tender was cancelled by the department.`;
        } else if (ev.name === "EscrowFunded") {
          sentence = `Contract escrow was funded by the department.`;
        } else if (ev.name === "MilestoneSubmitted") {
          sentence = `Contractor submitted milestone completion evidence.`;
        } else if (ev.name === "MilestoneApproved") {
          sentence = `Milestone evidence was approved by an authorized verifier.`;
        } else if (ev.name === "MilestoneReleased") {
          sentence = `Milestone payment release was executed on-chain.`;
        } else if (ev.name === "TenderCompleted") {
          sentence = `All milestones completed and tender closed.`;
        } else if (ev.name === "TenderDefaulted") {
          sentence = `Contractor defaulted on project deadlines.`;
        }

        return {
          sentence,
          time: ev.time || "Confirmed",
          txHash: ev.txHash,
        };
      });
  }, [events, activeTender]);

  const isPreReveal = activeTender && blockTimestamp <= Number(activeTender.revealDeadline);
  const progress = getProgressData(activeTender, blockTimestamp);

  return (
    <div className="audit-tab-clean">
      {/* Top Banner when blockchain RPC is unreachable */}
      {dataLoadError && (
        <div className="blockchain-error-banner" role="alert">
          <div className="banner-content">
            <span className="banner-icon">⚠️</span>
            <div className="banner-text-wrap">
              <strong>Can't reach the blockchain right now</strong>
              <span className="banner-subtext">Unable to query RPC endpoint ({CHAIN_NAME}). Verified on-chain data cannot be loaded.</span>
            </div>
          </div>
          {onRetry && (
            <button className="banner-retry-btn" onClick={onRetry}>
              Retry Connection
            </button>
          )}
        </div>
      )}

      {/* STEP 2: Top Row: 4 small stat boxes from getPlatformStats() */}
      <section className="audit-stats-grid" aria-label="Platform Statistics">
        <div className="audit-stat-card">
          <span className="stat-label">Tenders</span>
          <span className="stat-value font-mono">
            {dataLoadError ? "-" : isDataLoading && !platformStats ? "..." : platformStats?.tendersCount !== undefined ? platformStats.tendersCount.toString() : "-"}
          </span>
        </div>

        <div className="audit-stat-card">
          <span className="stat-label">Registered bidders</span>
          <span className="stat-value font-mono">
            {dataLoadError ? "-" : isDataLoading && !platformStats ? "..." : platformStats?.registeredBidders !== undefined ? platformStats.registeredBidders.toString() : "-"}
          </span>
        </div>

        <div className="audit-stat-card">
          <span className="stat-label">Value locked</span>
          <span className="stat-value font-mono">
            {dataLoadError
              ? "-"
              : isDataLoading && !platformStats
              ? "..."
              : platformStats?.tvl !== undefined
              ? `${parseFloat(ethers.formatEther(platformStats.tvl)).toFixed(2)} ${CURRENCY_SYMBOL}`
              : "-"}
          </span>
        </div>

        <div className="audit-stat-card">
          <span className="stat-label">Completed</span>
          <span className="stat-value font-mono">
            {dataLoadError ? "-" : isDataLoading && !platformStats ? "..." : platformStats?.completedTenders !== undefined ? platformStats.completedTenders.toString() : "-"}
          </span>
        </div>
      </section>

      {/* STEP 3: Tender list (one card per tender, newest first) */}
      <section className="audit-section" aria-label="Tenders Catalog">
        <div className="section-header-clean">
          <h2 className="section-title-clean">Tenders</h2>
        </div>

        {tenders.length === 0 ? (
          <div className="empty-state-clean">
            <p>No tenders yet</p>
          </div>
        ) : (
          <div className="tender-cards-list">
            {sortedTenders.map((t) => {
              const statusInfo = getTenderStatus(t, blockTimestamp);
              const isSelected = activeTender && Number(activeTender.id) === Number(t.id);
              const maxPriceFormatted = `${ethers.formatEther(t.ceilingPrice)} ${CURRENCY_SYMBOL}`;
              const depositFormatted = `${ethers.formatEther(t.bidBond)} ${CURRENCY_SYMBOL}`;

              return (
                <div key={t.id} className={`tender-summary-card ${isSelected ? "selected" : ""}`}>
                  <div className="tender-card-header">
                    <span className="tender-card-title">{getTenderHeading(t.id)}</span>
                    <span className="tender-card-status">{statusInfo.label}</span>
                  </div>

                  {statusInfo.countdown && (
                    <div className="tender-card-countdown">
                      <span className="countdown-label">Time remaining:</span>{" "}
                      <span className="countdown-val font-mono">{statusInfo.countdown}</span>
                    </div>
                  )}

                  <div className="tender-card-financials">
                    <div className="fin-item">
                      <span className="fin-label">Max price:</span>
                      <span className="fin-val font-mono">{maxPriceFormatted}</span>
                    </div>
                    <div className="fin-item">
                      <span className="fin-label">Deposit:</span>
                      <span className="fin-val font-mono">{depositFormatted}</span>
                    </div>
                  </div>

                  <div className="tender-card-actions">
                    <button
                      type="button"
                      className={`btn-view-tender ${isSelected ? "active" : ""}`}
                      onClick={() => onSelectTender(t.id)}
                    >
                      View
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* STEP 4: Detail view for the selected tender */}
      {activeTender && (
        <section className="tender-detail-view" aria-label="Selected Tender Details">
          <div className="detail-view-header">
            <div>
              <h2 className="detail-view-title">{getTenderHeading(activeTender.id)}</h2>
              <span className="detail-view-status">{getTenderStatus(activeTender, blockTimestamp).label}</span>
            </div>
            {/* STEP 5: "Try to cheat" Button */}
            <button
              type="button"
              className="btn-try-cheat"
              onClick={handleOpenCheatModal}
              title="Run verification tests against on-chain contract invariants"
            >
              Try to cheat
            </button>
          </div>

          {/* a) 4-step progress bar */}
          <div className="progress-section">
            <div className="progress-steps-bar" role="progressbar" aria-valuenow={progress.step} aria-valuemin={1} aria-valuemax={4}>
              {[
                { num: 1, title: "1 Bidding" },
                { num: 2, title: "2 Opening" },
                { num: 3, title: "3 Winner and funding" },
                { num: 4, title: "4 Work and payment" },
              ].map((s) => {
                const isCurrent = s.num === progress.step;
                const isPassed = s.num < progress.step;
                return (
                  <div key={s.num} className={`progress-step-item ${isCurrent ? "current" : isPassed ? "completed" : ""}`}>
                    <div className="step-circle">{isPassed ? "✓" : s.num}</div>
                    <span className="step-title">{s.title}</span>
                  </div>
                );
              })}
            </div>
            <div className="what-happens-next-box">
              <span className="what-next-label">What happens next:</span>{" "}
              <span className="what-next-text">{progress.nextText}</span>
            </div>
          </div>

          {/* b) "Bids" table */}
          <div className="detail-section">
            <h3 className="detail-section-title">Bids</h3>
            {isPreReveal ? (
              committedBidders && committedBidders.length > 0 ? (
                <div className="table-responsive">
                  <table className="clean-table">
                    <thead>
                      <tr>
                        <th>Wallet</th>
                        <th>Status</th>
                        <th>Hash</th>
                        <th>Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {committedBidders.map((b, i) => (
                        <tr key={i}>
                          <td className="font-mono">{b.bidder ? `${b.bidder.slice(0, 6)}...${b.bidder.slice(-4)}` : "--"}</td>
                          <td>
                            <span className="status-sealed">🔒 Sealed</span>
                          </td>
                          <td className="font-mono">{b.commitHash ? `${b.commitHash.slice(0, 10)}...${b.commitHash.slice(-8)}` : "--"}</td>
                          <td>{b.commitTime ? new Date(Number(b.commitTime) * 1000).toLocaleString() : "--"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="clean-empty-msg">No bids submitted yet.</p>
              )
            ) : (
              revealedBids && revealedBids.length > 0 ? (
                <div className="table-responsive">
                  <table className="clean-table">
                    <thead>
                      <tr>
                        <th>Wallet</th>
                        <th>Amount</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {revealedBids.map((b, i) => {
                        const isWinner =
                          tenderDetails?.winningBidder &&
                          b.bidder &&
                          tenderDetails.winningBidder.toLowerCase() === b.bidder.toLowerCase();
                        return (
                          <tr key={`rev-${i}`}>
                            <td className="font-mono">{b.bidder ? `${b.bidder.slice(0, 6)}...${b.bidder.slice(-4)}` : "--"}</td>
                            <td className="font-mono">{ethers.formatEther(b.amount)} {CURRENCY_SYMBOL}</td>
                            <td>
                              {isWinner ? (
                                <span className="label-winner">Lowest valid bid: automatic winner</span>
                              ) : (
                                <span className="label-revealed">Revealed</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {/* Committed bidders that did not reveal */}
                      {committedBidders
                        .filter((cb) => !revealedBids.some((rb) => rb.bidder.toLowerCase() === cb.bidder.toLowerCase()))
                        .map((cb, i) => (
                          <tr key={`unrev-${i}`}>
                            <td className="font-mono">{cb.bidder ? `${cb.bidder.slice(0, 6)}...${cb.bidder.slice(-4)}` : "--"}</td>
                            <td className="font-mono">-</td>
                            <td>
                              <span className="label-forfeited">Did not open: deposit forfeited</span>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="clean-empty-msg">No bids to display.</p>
              )
            )}
          </div>

          {/* c) "Payment stages" table from getMilestones */}
          <div className="detail-section">
            <h3 className="detail-section-title">Payment stages</h3>
            {milestones && milestones.length > 0 ? (
              <div className="table-responsive">
                <table className="clean-table">
                  <thead>
                    <tr>
                      <th>Stage</th>
                      <th>Share %</th>
                      <th>Due date</th>
                      <th>Status</th>
                      <th>Approvals</th>
                      <th>Amount paid</th>
                      <th>Penalty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {milestones.map((m, idx) => {
                      const statusNum = Number(m.status);
                      const statusText =
                        statusNum === 2 ? "Approved and paid" : statusNum === 1 ? "Work submitted" : "Waiting";
                      const requiredApprovals = Number(tenderDetails?.approvalThreshold || 2);
                      const currentApprovals = Number(m.approvalCount || 0);
                      const amountPaidText =
                        statusNum === 2 ? `${ethers.formatEther(m.payoutAmount)} ${CURRENCY_SYMBOL}` : "-";
                      const penaltyText =
                        m.penaltyDeducted && m.penaltyDeducted > 0n
                          ? `${ethers.formatEther(m.penaltyDeducted)} ${CURRENCY_SYMBOL}`
                          : "-";

                      return (
                        <tr key={idx}>
                          <td>Stage #{idx + 1}</td>
                          <td>{(Number(m.percentageBps) / 100).toFixed(1)}%</td>
                          <td>{m.dueDate ? new Date(Number(m.dueDate) * 1000).toLocaleDateString() : "--"}</td>
                          <td>
                            <span
                              className={
                                statusNum === 2
                                  ? "stage-approved"
                                  : statusNum === 1
                                  ? "stage-submitted"
                                  : "stage-waiting"
                              }
                            >
                              {statusText}
                            </span>
                          </td>
                          <td>{currentApprovals} of {requiredApprovals}</td>
                          <td className="font-mono">{amountPaidText}</td>
                          <td className="font-mono">{penaltyText}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="clean-empty-msg">No payment stages defined.</p>
            )}
          </div>

          {/* d) "Activity" list built from contract events */}
          <div className="detail-section">
            <h3 className="detail-section-title">Activity</h3>
            {activityList.length > 0 ? (
              <ul className="activity-clean-list">
                {activityList.map((act, i) => (
                  <li key={i} className="activity-clean-item">
                    <span className="activity-sentence">{act.sentence}</span>
                    <span className="activity-time">{act.time}</span>
                    {act.txHash && EXPLORER_URL && (
                      <a
                        href={`${EXPLORER_URL}/tx/${act.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="activity-link"
                      >
                        Tx ↗
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="clean-empty-msg">No activity recorded for this tender yet.</p>
            )}
          </div>
        </section>
      )}

      {/* STEP 5: "Try to cheat" Popup Modal */}
      {showCheatModal && (
        <div className="modal-backdrop" onClick={() => setShowCheatModal(false)}>
          <div className="modal-dialog cheat-modal-dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="cheat-modal-title">
            <div className="modal-header">
              <h3 id="cheat-modal-title">Try to cheat tests</h3>
              <button type="button" className="btn-close" onClick={() => setShowCheatModal(false)}>
                ×
              </button>
            </div>

            <div className="modal-body">
              <p className="modal-intro-text">
                Testing contract rules on <strong>{getTenderHeading(activeTender?.id)}</strong>:
              </p>

              {/* Test A */}
              <div className="cheat-test-card">
                <div className="test-header">
                  <strong>Test A: Peek at the hidden bids</strong>
                </div>
                <div className="test-action-desc">
                  Simulating read request to <code>getRevealedBids</code> before opening deadline...
                </div>
                <div className="test-result-box">
                  <span className="result-label">Result:</span>{" "}
                  <span className="result-text">{testAResult || "Ready to run."}</span>
                </div>
              </div>

              {/* Test B */}
              <div className="cheat-test-card">
                <div className="test-header">
                  <strong>Test B: Change a submitted bid</strong>
                </div>
                <div className="test-action-desc">
                  Simulating duplicate commit transaction from existing bidder via <code>provider.call</code>...
                </div>
                <div className="test-result-box">
                  <span className="result-label">Result:</span>{" "}
                  <span className="result-text">{testBResult || "Ready to run."}</span>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn-modal-action"
                onClick={runCheatTests}
                disabled={cheatTesting}
              >
                {cheatTesting ? "Testing..." : "Rerun Tests"}
              </button>
              <button
                type="button"
                className="btn-modal-close"
                onClick={() => setShowCheatModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
