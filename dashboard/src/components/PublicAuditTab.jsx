import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { ethers } from "ethers";
import { CURRENCY_SYMBOL, EXPLORER_URL, CHAIN_NAME, DEPLOY_BLOCK, getReadOnlyProvider } from "../config";
import { fmtAmount, fmtDateTime } from "../utils/format";

// Concurrency limiter helper: limits parallel asynchronous operations to maxConcurrent
async function runWithConcurrencyLimit(tasks, maxConcurrent = 3) {
  const results = new Array(tasks.length);
  let nextIndex = 0;
  const workers = new Array(Math.min(maxConcurrent, tasks.length)).fill(0).map(async () => {
    while (nextIndex < tasks.length) {
      const idx = nextIndex++;
      try {
        results[idx] = await tasks[idx]();
      } catch (err) {
        results[idx] = null;
      }
    }
  });
  await Promise.all(workers);
  return results;
}

// STEP 5: Deep normalization helper converting BigInt to string before comparison
function deepNormalize(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "bigint") return obj.toString();
  if (typeof obj === "number" || typeof obj === "string" || typeof obj === "boolean") return obj;
  if (Array.isArray(obj)) return obj.map(deepNormalize);
  if (typeof obj === "object") {
    const out = {};
    const keys = Object.keys(obj);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (/^\d+$/.test(k)) continue;
      out[k] = deepNormalize(obj[k]);
    }
    return out;
  }
  return String(obj);
}

function areDataEqual(a, b) {
  try {
    return JSON.stringify(deepNormalize(a)) === JSON.stringify(deepNormalize(b));
  } catch {
    return false;
  }
}

export default function PublicAuditTab({
  contract,
  tenders: propTenders = [],
  selectedTenderId,
  onSelectTender,
  tenderDetails: propTenderDetails,
  milestones: propMilestones = [],
  revealedBids: propRevealedBids = [],
  committedBidders: propCommittedBidders = [],
  platformStats: propPlatformStats,
  events: propEvents = [],
  latestBlockTimestamp = 0,
  isDataLoading = false,
  dataLoadError = null,
  onRetry = null,
}) {
  const [internalSelectedId, setInternalSelectedId] = useState(selectedTenderId || null);

  useEffect(() => {
    if (selectedTenderId !== undefined && selectedTenderId !== null) {
      setInternalSelectedId(selectedTenderId);
    }
  }, [selectedTenderId]);

  // STEP 4: Cache loaded data per tender id in a Map (useRef)
  const tenderCacheRef = useRef(new Map());

  // STEP 2 & 5: Refresh timestamp & error chip state
  const [lastUpdatedTime, setLastUpdatedTime] = useState(() => {
    const d = new Date();
    return d.toTimeString().split(" ")[0];
  });
  const [refreshErrorChip, setRefreshErrorChip] = useState(false);
  const isRefreshRunningRef = useRef(false);

  // STEP 3: Incremental getLogs block tracking
  const lastSeenBlockRef = useRef(0);

  // Internal reactive state to ensure seamless background polling without clearing
  const [tenders, setTenders] = useState(propTenders || []);
  const [platformStats, setPlatformStats] = useState(propPlatformStats || null);
  const [events, setEvents] = useState(propEvents || []);

  const [internalDetails, setInternalDetails] = useState(null);
  const [internalMilestones, setInternalMilestones] = useState(null);
  const [internalRevealedBids, setInternalRevealedBids] = useState(null);
  const [internalCommittedBidders, setInternalCommittedBidders] = useState(null);
  const [isInternalLoading, setIsInternalLoading] = useState(false);

  // Sync prop updates when different
  useEffect(() => {
    if (propTenders && propTenders.length > 0) {
      setTenders((prev) => (areDataEqual(prev, propTenders) ? prev : propTenders));
    }
  }, [propTenders]);

  useEffect(() => {
    if (propPlatformStats) {
      setPlatformStats((prev) => (areDataEqual(prev, propPlatformStats) ? prev : propPlatformStats));
    }
  }, [propPlatformStats]);

  useEffect(() => {
    if (propEvents && propEvents.length > 0) {
      setEvents((prev) => (areDataEqual(prev, propEvents) ? prev : propEvents));
    }
  }, [propEvents]);

  const handleSelectTender = useCallback(
    (id) => {
      setInternalSelectedId(id);
      if (onSelectTender) {
        onSelectTender(id);
      }
    },
    [onSelectTender]
  );

  const [blockTimestamp, setBlockTimestamp] = useState(latestBlockTimestamp || 0);
  const blockTimestampRef = useRef(latestBlockTimestamp || 0);
  const isTestingRef = useRef(false);
  const hasAutoRunRef = useRef(false);
  const testRunIdRef = useRef(0);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    blockTimestampRef.current = blockTimestamp;
  }, [blockTimestamp]);

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

  // Escape key handler to close cheat modal
  useEffect(() => {
    if (!showCheatModal) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setShowCheatModal(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [showCheatModal]);

  // Sync block timestamp once on mount or when contract changes (no polling interval)
  useEffect(() => {
    let isMounted = true;
    async function fetchBlockTime() {
      try {
        const provider =
          contract?.runner?.provider ||
          (contract?.runner && typeof contract.runner.getBlock === "function" ? contract.runner : null) ||
          getReadOnlyProvider();
        if (provider) {
          const b = await provider.getBlock("latest");
          if (b && isMounted) {
            setBlockTimestamp(Number(b.timestamp));
          }
        }
      } catch {
        // ignore
      }
    }
    fetchBlockTime();
    return () => {
      isMounted = false;
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
      const tendersNeedingHash = tenders.filter((t) => !t.documentHash && !tenderDocHashes[t.id]);
      if (tendersNeedingHash.length === 0) return;
      const map = {};
      for (const t of tendersNeedingHash) {
        try {
          const d = await contract.getTenderDetails(t.id);
          if (d?.documentHash) {
            map[t.id] = d.documentHash;
          }
        } catch {
          // ignore
        }
      }
      if (isMounted && Object.keys(map).length > 0) {
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

  // Document hash helper
  function getTenderHeading(id) {
    const rawHash =
      tenderDocHashes[id] ||
      (Number(propTenderDetails?.id) === Number(id) && propTenderDetails?.documentHash) ||
      (Number(effectiveTenderDetails?.id) === Number(id) && effectiveTenderDetails?.documentHash) ||
      tenders.find((t) => Number(t.id) === Number(id))?.documentHash ||
      "";
    const snippet = rawHash && typeof rawHash === "string" ? rawHash.slice(0, 10) : "";
    return `Tender #${id}${snippet ? ` ${snippet}` : ""}`;
  }

  // Sorted tenders (newest first)
  const sortedTenders = useMemo(() => {
    return [...tenders].sort((a, b) => Number(b.id) - Number(a.id));
  }, [tenders]);

  // Active tender object
  const activeTender = useMemo(() => {
    const currentId = internalSelectedId !== null && internalSelectedId !== undefined ? internalSelectedId : selectedTenderId;
    if (currentId !== null && currentId !== undefined) {
      const found = tenders.find((t) => Number(t.id) === Number(currentId));
      if (found) return found;
    }
    if (sortedTenders.length > 0) return sortedTenders[0];
    return propTenderDetails || null;
  }, [internalSelectedId, selectedTenderId, tenders, sortedTenders, propTenderDetails]);

  // Concurrency & in-flight locks (STEP 4)
  const inFlightCatalogRef = useRef(false);
  const inFlightDetailsRef = useRef(false);

  // Active tender ID reference for stable closures
  const activeTenderId = activeTender ? Number(activeTender.id) : null;
  const activeTenderIdRef = useRef(activeTenderId);
  useEffect(() => {
    activeTenderIdRef.current = activeTenderId;
  }, [activeTenderId]);

  // Is propTenderDetails specifically for active tender?
  const isPropsForActive = Boolean(propTenderDetails && Number(propTenderDetails.id) === activeTenderId);

  // STEP 3 & 4: Fetch logs from DEPLOY_BLOCK to latestBlock in 5,000 block increments with up to 2 retries per chunk
  const fetchLogsWithRetries = useCallback(async (provider, filter, fromBlock, toBlock) => {
    const CHUNK_SIZE = 5000;
    const allLogs = [];
    let currentFrom = fromBlock;

    while (currentFrom <= toBlock) {
      const currentTo = Math.min(currentFrom + CHUNK_SIZE - 1, toBlock);
      const chunkFilter = {
        ...filter,
        fromBlock: currentFrom,
        toBlock: currentTo,
      };

      let chunkLogs = null;
      let attempts = 0;
      while (attempts < 3) {
        try {
          chunkLogs = await provider.getLogs(chunkFilter);
          break;
        } catch (err) {
          attempts++;
          if (attempts >= 3) {
            // Half-range fallback as final retry strategy
            try {
              const mid = Math.floor((currentFrom + currentTo) / 2);
              const f1 = { ...filter, fromBlock: currentFrom, toBlock: mid };
              const f2 = { ...filter, fromBlock: mid + 1, toBlock: currentTo };
              const [l1, l2] = await Promise.all([provider.getLogs(f1), provider.getLogs(f2)]);
              chunkLogs = [...(l1 || []), ...(l2 || [])];
            } catch {
              chunkLogs = [];
            }
          } else {
            await new Promise((res) => setTimeout(res, 400));
          }
        }
      }

      if (chunkLogs && chunkLogs.length > 0) {
        allLogs.push(...chunkLogs);
      }
      currentFrom = currentTo + 1;
    }
    return allLogs;
  }, []);

  // STEP 4: performFullDataLoad executes in 3 sequential phases with concurrency <= 3
  const performFullDataLoad = useCallback(async (forcedTenderId = null) => {
    if (!contract || isRefreshRunningRef.current) return;
    if (typeof document !== "undefined" && document.hidden) return;

    isRefreshRunningRef.current = true;
    const targetId = forcedTenderId || activeTenderIdRef.current;
    let hadError = false;

    try {
      const provider =
        contract.runner?.provider ||
        (contract.runner && typeof contract.runner.getBlock === "function" ? contract.runner : null) ||
        getReadOnlyProvider();

      // ==========================================
      // PHASE 1: Tenders list & Platform Stats
      // ==========================================
      try {
        const phase1Tasks = [
          async () => {
            if (!provider) return null;
            try {
              return await provider.getBlock("latest");
            } catch {
              return null;
            }
          },
          async () => {
            try {
              return await contract.getPlatformStats();
            } catch {
              return null;
            }
          },
          async () => {
            try {
              return await contract.tenderCount();
            } catch {
              return null;
            }
          },
        ];

        const [latestBlockObj, stats, tenderCountBig] = await runWithConcurrencyLimit(phase1Tasks, 3);

        if (latestBlockObj && isMountedRef.current) {
          setBlockTimestamp((prev) => (prev !== Number(latestBlockObj.timestamp) ? Number(latestBlockObj.timestamp) : prev));
        }

        if (stats && isMountedRef.current) {
          const nextStats = {
            tendersCount: stats[0],
            registeredBidders: stats[1],
            debarredBidders: stats[2],
            awardedTenders: stats[3],
            completedTenders: stats[4],
            defaultedTenders: stats[5],
            tvl: stats[6],
          };
          setPlatformStats((prev) => (areDataEqual(prev, nextStats) ? prev : nextStats));
        }

        if (tenderCountBig !== null && tenderCountBig !== undefined) {
          const count = Number(tenderCountBig);
          if (count > 0) {
            const tenderTasks = [];
            for (let i = 1; i <= count; i++) {
              tenderTasks.push(() => contract.getTenderDetails(i).catch(() => null));
            }
            const tenderResults = await runWithConcurrencyLimit(tenderTasks, 3);
            const loaded = [];
            for (let i = 0; i < tenderResults.length; i++) {
              const t = tenderResults[i];
              if (t) {
                loaded.push({
                  id: Number(t.id),
                  department: t.department,
                  ceilingPrice: t.ceilingPrice,
                  bidBond: t.bidBond,
                  commitDeadline: Number(t.commitDeadline),
                  revealDeadline: Number(t.revealDeadline),
                  escrowDeadline: Number(t.escrowDeadline),
                  gracePeriod: Number(t.gracePeriod),
                  completedMilestones: Number(t.completedMilestones),
                  status: Number(t.status),
                  winningBidder: t.winningBidder,
                  winningAmount: t.winningAmount,
                  approvalThreshold: Number(t.approvalThreshold),
                  totalCommits: Number(t.totalCommits),
                  documentHash: t.documentHash,
                });
              }
            }
            if (loaded.length > 0 && isMountedRef.current) {
              setTenders((prev) => (areDataEqual(prev, loaded) ? prev : loaded));
            }
          }
        }
      } catch {
        hadError = true;
      }

      // ==========================================
      // PHASE 2: Selected Tender Details
      // ==========================================
      const selectedIdToFetch = targetId || (sortedTenders.length > 0 ? Number(sortedTenders[0].id) : null);
      if (selectedIdToFetch && !isPropsForActive) {
        try {
          const phase2Tasks = [
            async () => contract.getTenderDetails(selectedIdToFetch).catch(() => null),
            async () => contract.getMilestones(selectedIdToFetch).catch(() => []),
            async () => contract.getRevealedBids(selectedIdToFetch).catch(() => []),
            async () => {
              if (contract.filters?.BidCommitted && typeof contract.queryFilter === "function") {
                const filter = contract.filters.BidCommitted(selectedIdToFetch);
                const evList = await contract.queryFilter(filter, DEPLOY_BLOCK).catch(() => []);
                return evList.map((e) => ({
                  bidder: e.args?.bidder || e.args?.[1],
                  commitHash: e.args?.commitHash || e.args?.[2],
                  commitTime: e.args?.commitTime || e.args?.[3],
                }));
              }
              return [];
            },
          ];

          const [d, ms, rev, committed] = await runWithConcurrencyLimit(phase2Tasks, 3);

          if (isMountedRef.current && (selectedIdToFetch === activeTenderIdRef.current || !activeTenderIdRef.current)) {
            const cacheEntry = {
              details: d,
              milestones: ms || [],
              revealedBids: rev || [],
              committedBidders: committed || [],
            };
            tenderCacheRef.current.set(selectedIdToFetch, cacheEntry);

            if (d) {
              setInternalDetails((prev) => (areDataEqual(prev, d) ? prev : d));
            }
            if (ms) {
              setInternalMilestones((prev) => (areDataEqual(prev, ms) ? prev : ms));
            }
            if (rev) {
              setInternalRevealedBids((prev) => (areDataEqual(prev, rev) ? prev : rev));
            }
            if (committed) {
              setInternalCommittedBidders((prev) => (areDataEqual(prev, committed) ? prev : committed));
            }
            setIsInternalLoading(false);
          }
        } catch {
          hadError = true;
        }
      }

      // ==========================================
      // PHASE 3: Activity Logs (Chunked with retries)
      // ==========================================
      if (provider) {
        try {
          const currentBlock = await provider.getBlockNumber();
          const contractAddr = contract.target || (typeof contract.getAddress === "function" ? await contract.getAddress() : null);
          if (contractAddr && currentBlock) {
            const isFirstEventsLoad = lastSeenBlockRef.current === 0;
            const fromBlock = isFirstEventsLoad ? DEPLOY_BLOCK : lastSeenBlockRef.current + 1;

            if (fromBlock <= currentBlock) {
              const logsFilter = { address: contractAddr };
              const rawLogs = await fetchLogsWithRetries(provider, logsFilter, fromBlock, currentBlock);
              const iface = contract.interface;
              const newParsed = [];

              for (let i = 0; i < rawLogs.length; i++) {
                try {
                  const parsed = iface.parseLog(rawLogs[i]);
                  if (parsed) {
                    let evTenderId = null;
                    if (parsed.args) {
                      if (parsed.args.tenderId !== undefined) {
                        evTenderId = Number(parsed.args.tenderId);
                      } else if (
                        (parsed.name.startsWith("Tender") ||
                          parsed.name.startsWith("Bid") ||
                          parsed.name.startsWith("Milestone") ||
                          parsed.name === "EscrowFunded" ||
                          parsed.name === "BondRefundClaimed") &&
                        parsed.args[0] !== undefined
                      ) {
                        try {
                          evTenderId = Number(parsed.args[0]);
                        } catch {
                          evTenderId = null;
                        }
                      }
                    }

                    const description =
                      evTenderId !== null
                        ? `${parsed.name} on tender #${evTenderId}`
                        : `${parsed.name} event`;

                    newParsed.push({
                      name: parsed.name,
                      tenderId: evTenderId,
                      description: description,
                      txHash: rawLogs[i].transactionHash,
                      logIndex: rawLogs[i].index !== undefined ? rawLogs[i].index : i,
                      blockNumber: rawLogs[i].blockNumber,
                      time: "Confirmed",
                      args: parsed.args,
                    });
                  }
                } catch {}
              }

              lastSeenBlockRef.current = currentBlock;

              if (newParsed.length > 0 && isMountedRef.current) {
                setEvents((prev) => {
                  const combined = isFirstEventsLoad ? newParsed.reverse() : [...newParsed.reverse(), ...prev];
                  const seen = new Set();
                  const deduped = [];
                  for (const ev of combined) {
                    const key = `${ev.txHash}-${ev.logIndex ?? 0}`;
                    if (!seen.has(key)) {
                      seen.add(key);
                      deduped.push(ev);
                    }
                  }
                  return deduped.slice(0, 50);
                });
              }
            }
          }
        } catch {
          hadError = true;
        }
      }

      if (isMountedRef.current) {
        if (hadError) {
          setRefreshErrorChip(true);
        } else {
          setRefreshErrorChip(false);
          const d = new Date();
          setLastUpdatedTime(d.toTimeString().split(" ")[0]);
        }
      }
    } catch {
      if (isMountedRef.current) {
        setRefreshErrorChip(true);
      }
    } finally {
      isRefreshRunningRef.current = false;
    }
  }, [contract, fetchLogsWithRetries, sortedTenders]);

  // STEP 1(a): Load once when the page opens
  useEffect(() => {
    performFullDataLoad();
  }, [performFullDataLoad]);

  // STEP 1(b) & STEP 4: When user selects a tender, restore cached immediately and load in background
  useEffect(() => {
    if (!activeTenderId) return;

    const cached = tenderCacheRef.current.get(activeTenderId);
    if (cached) {
      if (cached.details) setInternalDetails(cached.details);
      if (cached.milestones) setInternalMilestones(cached.milestones);
      if (cached.revealedBids) setInternalRevealedBids(cached.revealedBids);
      if (cached.committedBidders) setInternalCommittedBidders(cached.committedBidders);
      setIsInternalLoading(false);
    } else if (!isPropsForActive) {
      setInternalDetails(null);
      setInternalMilestones(null);
      setInternalRevealedBids(null);
      setInternalCommittedBidders(null);
      setIsInternalLoading(true);
    }

    performFullDataLoad(activeTenderId);
  }, [activeTenderId, isPropsForActive, performFullDataLoad]);

  // STEP 1(e): Trigger refresh once when a countdown reaches zero
  const countdownZeroTriggeredRef = useRef(new Set());
  useEffect(() => {
    if (!activeTender || !blockTimestamp) return;
    const tId = Number(activeTender.id);
    const commitPassed = blockTimestamp >= Number(activeTender.commitDeadline);
    const revealPassed = blockTimestamp >= Number(activeTender.revealDeadline);

    const commitKey = `${tId}-commit-zero`;
    const revealKey = `${tId}-reveal-zero`;

    if (commitPassed && !countdownZeroTriggeredRef.current.has(commitKey)) {
      countdownZeroTriggeredRef.current.add(commitKey);
      performFullDataLoad(tId);
    } else if (revealPassed && !countdownZeroTriggeredRef.current.has(revealKey)) {
      countdownZeroTriggeredRef.current.add(revealKey);
      performFullDataLoad(tId);
    }
  }, [activeTender, blockTimestamp, performFullDataLoad]);

  // STEP 1: Optional slow refresh every 45 seconds (ONLY when tab is visible and no request running)
  useEffect(() => {
    const slowInterval = setInterval(() => {
      if (typeof document !== "undefined" && !document.hidden && !isRefreshRunningRef.current) {
        performFullDataLoad();
      }
    }, 45000);

    const handleVisibility = () => {
      if (typeof document !== "undefined" && !document.hidden && !isRefreshRunningRef.current) {
        performFullDataLoad();
      }
    };

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibility);
    }

    return () => {
      clearInterval(slowInterval);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibility);
      }
    };
  }, [performFullDataLoad]);

  // STEP 3: Fallback resolution - NEVER clear data during a refresh
  const effectiveMilestones = isPropsForActive
    ? propMilestones
    : internalMilestones !== null
    ? internalMilestones
    : [];

  const effectiveRevealedBids = isPropsForActive
    ? propRevealedBids
    : internalRevealedBids !== null
    ? internalRevealedBids
    : [];

  const effectiveCommittedBidders = isPropsForActive
    ? propCommittedBidders
    : internalCommittedBidders !== null
    ? internalCommittedBidders
    : [];

  const effectiveTenderDetails = isPropsForActive
    ? propTenderDetails
    : internalDetails || activeTender;

  // Has ANY data loaded yet for bids/stages?
  const hasBidsData = (effectiveCommittedBidders && effectiveCommittedBidders.length > 0) || (effectiveRevealedBids && effectiveRevealedBids.length > 0) || internalCommittedBidders !== null || internalRevealedBids !== null || (propCommittedBidders && propCommittedBidders.length > 0) || (propRevealedBids && propRevealedBids.length > 0);
  const hasStagesData = (effectiveMilestones && effectiveMilestones.length > 0) || internalMilestones !== null || (propMilestones && propMilestones.length > 0);

  // Helper to parse custom contract error names from reverts
  function parseCustomErrorName(err, iface) {
    if (!err) return null;
    if (err.revert?.name) return err.revert.name;

    let hexData = null;
    const candidates = [
      err.data,
      err.info?.error?.data,
      err.revert?.data,
      err.error?.data,
      err.data?.data,
      err.info?.data,
    ];
    for (const c of candidates) {
      if (typeof c === "string" && c.startsWith("0x")) {
        hexData = c;
        break;
      }
    }

    if (hexData) {
      if (hexData.includes("64dbd987")) return "AlreadyCommitted";
      if (hexData.includes("a32084b8")) return "CommitPhaseClosed";
      if (hexData.includes("fea22cda")) return "InvalidTenderStatus";
      if (hexData.includes("85b6b756")) return "BidsNotYetPublic";
      if (iface) {
        try {
          const parsed = iface.parseError(hexData);
          if (parsed?.name) return parsed.name;
        } catch {}
      }
    }

    const combined = `${err.shortMessage || ""} ${err.message || ""} ${err.reason || ""} ${err.info?.error?.message || ""} ${err.error?.message || ""}`;
    if (combined.includes("AlreadyCommitted")) return "AlreadyCommitted";
    if (combined.includes("CommitPhaseClosed")) return "CommitPhaseClosed";
    if (combined.includes("InvalidTenderStatus")) return "InvalidTenderStatus";
    if (combined.includes("BidsNotYetPublic")) return "BidsNotYetPublic";

    return null;
  }

  function isNetworkOrRpcError(err) {
    if (!err) return false;
    const msg = `${err.code || ""} ${err.message || ""} ${err.shortMessage || ""}`.toLowerCase();
    return (
      msg.includes("network") ||
      msg.includes("timeout") ||
      msg.includes("econnrefused") ||
      msg.includes("could not coalesce") ||
      msg.includes("failed to fetch") ||
      msg.includes("connection reset") ||
      msg.includes("server error")
    );
  }

  // Run Step 5 cheat tests
  const runCheatTests = useCallback(async () => {
    if (!contract || !activeTender) {
      setTestAResult("Unavailable tender data.");
      setTestBResult("Unavailable tender data.");
      return;
    }
    if (isTestingRef.current) return;
    isTestingRef.current = true;

    testRunIdRef.current += 1;
    const currentRunId = testRunIdRef.current;

    setCheatTesting(true);
    setTestAResult("Running Test A...");
    setTestBResult("Running Test B...");

    const tenderId = Number(activeTender.id);
    const now = blockTimestampRef.current || Math.floor(Date.now() / 1000);

    const runTestA = async () => {
      let timerA = null;
      let isTimedOutA = false;
      try {
        if (isDataLoading || isInternalLoading) {
          if (isMountedRef.current && testRunIdRef.current === currentRunId) {
            setTestAResult("Waiting for tender data...");
          }
          return;
        }

        if (now > Number(activeTender.revealDeadline)) {
          if (isMountedRef.current && testRunIdRef.current === currentRunId) {
            setTestAResult("Bids are already public for this tender. Choose a tender that is still taking bids.");
          }
          return;
        }

        const timeoutPromiseA = new Promise((_, reject) => {
          timerA = setTimeout(() => {
            isTimedOutA = true;
            reject(new Error("RPC_TIMEOUT"));
          }, 4000);
        });

        const callPromiseA = contract.getRevealedBids(tenderId);

        try {
          await Promise.race([callPromiseA, timeoutPromiseA]);
          if (timerA) clearTimeout(timerA);
          if (isMountedRef.current && testRunIdRef.current === currentRunId) {
            setTestAResult("Privacy protection was not verified: contract returned bids before the reveal deadline.");
          }
        } catch (errA) {
          if (timerA) clearTimeout(timerA);
          if (!isMountedRef.current || testRunIdRef.current !== currentRunId) return;

          if (isTimedOutA || errA?.message === "RPC_TIMEOUT" || errA?.message?.includes("RPC_TIMEOUT")) {
            setTestAResult("Inconclusive: RPC request timed out.");
          } else {
            const errName = parseCustomErrorName(errA, contract.interface);
            if (errName === "BidsNotYetPublic") {
              setTestAResult("Blocked: the contract refuses to show bids before the opening");
            } else if (isNetworkOrRpcError(errA)) {
              setTestAResult("Inconclusive: RPC communication error.");
            } else {
              setTestAResult(`Inconclusive: Contract reverted with unexpected error${errName ? ` (${errName})` : ""}.`);
            }
          }
        }
      } catch {
        if (timerA) clearTimeout(timerA);
        if (isMountedRef.current && testRunIdRef.current === currentRunId) {
          setTestAResult("Inconclusive: Unexpected error executing test.");
        }
      } finally {
        if (timerA) clearTimeout(timerA);
      }
    };

    const runTestB = async () => {
      let timerB = null;
      let isTimedOutB = false;
      try {
        // 1. Confirm tender details have finished loading
        if (isDataLoading || isInternalLoading) {
          if (isMountedRef.current && testRunIdRef.current === currentRunId) {
            setTestBResult("Loading tender data...");
          }
          return;
        }

        // 2. Confirm tender status permits testing (TenderStatus.Open === 1)
        if (Number(activeTender.status) !== 1) {
          if (isMountedRef.current && testRunIdRef.current === currentRunId) {
            setTestBResult("Cannot verify duplicate-bid protection: tender is not in open status.");
          }
          return;
        }

        // 3. Confirm commit phase is open
        if (now > Number(activeTender.commitDeadline)) {
          if (isMountedRef.current && testRunIdRef.current === currentRunId) {
            setTestBResult("Cannot verify duplicate-bid protection: commit phase is closed.");
          }
          return;
        }

        // 4. Confirm an actual existing commitment is available and use the real address
        let targetBidder = null;
        if (effectiveCommittedBidders && effectiveCommittedBidders.length > 0 && effectiveCommittedBidders[0]?.bidder) {
          targetBidder = effectiveCommittedBidders[0].bidder;
        } else if (effectiveRevealedBids && effectiveRevealedBids.length > 0 && effectiveRevealedBids[0]?.bidder) {
          targetBidder = effectiveRevealedBids[0].bidder;
        } else if (events && events.length > 0) {
          const ev = events.find(
            (e) =>
              e.name === "BidCommitted" &&
              (e.tenderId !== null && e.tenderId !== undefined
                ? Number(e.tenderId) === tenderId
                : e.description && e.description.includes(`tender #${tenderId}`))
          );
          if (ev?.args) {
            targetBidder = ev.args.bidder || ev.args[1] || ev.args[0];
          } else if (ev?.bidder) {
            targetBidder = ev.bidder;
          }
        } else if (effectiveTenderDetails?.winningBidder && effectiveTenderDetails.winningBidder !== ethers.ZeroAddress) {
          targetBidder = effectiveTenderDetails.winningBidder;
        } else if (activeTender?.winningBidder && activeTender.winningBidder !== ethers.ZeroAddress) {
          targetBidder = activeTender.winningBidder;
        }

        // Distinguish between zero bids and unavailable data
        if (Number(activeTender.totalCommits || 0) === 0) {
          if (isMountedRef.current && testRunIdRef.current === currentRunId) {
            setTestBResult("No bids yet to test.");
          }
          return;
        }

        if (!targetBidder) {
          if (isMountedRef.current && testRunIdRef.current === currentRunId) {
            setTestBResult("Inconclusive: Bidder commitment data unavailable to test.");
          }
          return;
        }

        // Preconditions satisfied: simulate commitBid using the real committed bidder
        const dummyHash = ethers.id("DUMMY_CHEAT_HASH_" + Date.now());
        const iface = contract.interface;
        const data = iface.encodeFunctionData("commitBid", [tenderId, dummyHash]);
        const provider = contract.runner?.provider || contract.runner;

        if (!provider || typeof provider.call !== "function") {
          if (isMountedRef.current && testRunIdRef.current === currentRunId) {
            setTestBResult("Inconclusive: Provider is unavailable.");
          }
          return;
        }

        const timeoutPromiseB = new Promise((_, reject) => {
          timerB = setTimeout(() => {
            isTimedOutB = true;
            reject(new Error("RPC_TIMEOUT"));
          }, 4000);
        });

        const callPromiseB = (async () => {
          const contractAddress =
            typeof contract.getAddress === "function"
              ? await contract.getAddress()
              : contract.target || contract.address;
          return provider.call({
            to: contractAddress,
            from: targetBidder,
            data: data,
            value: activeTender.bidBond ?? 0n,
          });
        })();

        try {
          await Promise.race([callPromiseB, timeoutPromiseB]);
          if (timerB) clearTimeout(timerB);

          if (isMountedRef.current && testRunIdRef.current === currentRunId) {
            // Simulation succeeded without reverting with AlreadyCommitted
            setTestBResult("Duplicate-bid protection was not verified.");
          }
        } catch (simErr) {
          if (timerB) clearTimeout(timerB);
          if (!isMountedRef.current || testRunIdRef.current !== currentRunId) return;

          if (isTimedOutB || simErr?.message === "RPC_TIMEOUT" || simErr?.message?.includes("RPC_TIMEOUT")) {
            setTestBResult("Inconclusive: RPC request timed out.");
          } else {
            const errName = parseCustomErrorName(simErr, iface);
            if (errName === "AlreadyCommitted") {
              setTestBResult("Blocked: a company cannot bid twice");
            } else if (errName === "CommitPhaseClosed") {
              setTestBResult("Cannot verify duplicate-bid protection: commit phase is closed.");
            } else if (errName === "InvalidTenderStatus") {
              setTestBResult("Cannot verify duplicate-bid protection: tender is not in open status.");
            } else if (isNetworkOrRpcError(simErr)) {
              setTestBResult("Inconclusive: RPC communication error.");
            } else {
              setTestBResult(`Inconclusive: Contract reverted with unexpected error${errName ? ` (${errName})` : ""}.`);
            }
          }
        }
      } catch {
        if (timerB) clearTimeout(timerB);
        if (isMountedRef.current && testRunIdRef.current === currentRunId) {
          setTestBResult("Inconclusive: Unexpected error executing test.");
        }
      } finally {
        if (timerB) clearTimeout(timerB);
      }
    };

    try {
      await Promise.all([runTestA(), runTestB()]);
    } finally {
      if (isMountedRef.current && testRunIdRef.current === currentRunId) {
        setCheatTesting(false);
      }
      isTestingRef.current = false;
    }
  }, [
    contract,
    activeTender,
    isDataLoading,
    isInternalLoading,
    effectiveCommittedBidders,
    effectiveRevealedBids,
    effectiveTenderDetails,
    events,
  ]);

  function handleOpenCheatModal() {
    hasAutoRunRef.current = false;
    setShowCheatModal(true);
  }

  // Auto-run if opened via query param ?cheat=true or modal opened
  useEffect(() => {
    if (showCheatModal && contract && activeTender && !hasAutoRunRef.current) {
      hasAutoRunRef.current = true;
      runCheatTests();
    }
    if (!showCheatModal) {
      hasAutoRunRef.current = false;
    }
  }, [showCheatModal, contract, activeTender, runCheatTests]);

  // When tender details finish loading while modal is open, re-run tests
  const prevLoadingRef = useRef(isDataLoading || isInternalLoading);
  useEffect(() => {
    const loading = isDataLoading || isInternalLoading;
    if (showCheatModal && prevLoadingRef.current && !loading && contract && activeTender) {
      runCheatTests();
    }
    prevLoadingRef.current = loading;
  }, [showCheatModal, isDataLoading, isInternalLoading, contract, activeTender, runCheatTests]);

  const prevActiveTenderIdRef = useRef(activeTender?.id);
  useEffect(() => {
    if (showCheatModal && activeTender && activeTender.id !== prevActiveTenderIdRef.current) {
      runCheatTests();
    }
    prevActiveTenderIdRef.current = activeTender?.id;
  }, [showCheatModal, activeTender, runCheatTests]);

  // Format activity event sentences per Step 4d
  const activityList = useMemo(() => {
    if (!events || events.length === 0) return [];
    const activeId = activeTender ? Number(activeTender.id) : null;
    if (!activeId) return [];

    const PLATFORM_WIDE_EVENT_NAMES = new Set([
      "BidderRegistered",
      "BidderDebarred",
      "DepartmentRegistered",
      "VerifierRegistered",
      "ParticipantRegistered",
      "RoleGranted",
      "RoleRevoked",
      "Paused",
      "Unpaused",
      "BalanceWithdrawn",
      "BalanceCredited",
    ]);

    return events
      .filter((ev) => {
        // Platform-wide events or events flagged as platform wide must never be attributed to individual tenders
        if (ev.isPlatformWide || PLATFORM_WIDE_EVENT_NAMES.has(ev.name)) return false;

        // Only display tender-specific events under their corresponding tender
        if (ev.tenderId !== null && ev.tenderId !== undefined) {
          return Number(ev.tenderId) === activeId;
        }
        // Strict fallback regex for tender #<id> in description if tenderId is not set
        if (ev.description && typeof ev.description === "string") {
          const match = ev.description.match(/tender #(\d+)/i);
          if (match) {
            return Number(match[1]) === activeId;
          }
        }
        // Exclude all other events
        return false;
      })
      .map((ev) => {
        let sentence = ev.description || `${ev.name} event recorded.`;
        if (ev.name === "TenderCreated") {
          sentence = `Tender was created and published on-chain.`;
        } else if (ev.name === "BidCommitted") {
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
        } else if (ev.name === "BondRefundClaimed") {
          sentence = `Bidder claimed their bid deposit refund.`;
        }

        return {
          sentence,
          time: ev.time || "Confirmed",
          txHash: ev.txHash,
          logIndex: ev.logIndex,
        };
      });
  }, [events, activeTender]);

  const isPreReveal = activeTender && blockTimestamp <= Number(activeTender.revealDeadline);
  const progress = getProgressData(activeTender, blockTimestamp);
  const cleanExplorerUrl = (EXPLORER_URL || "").replace(/\/+$/, "");

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
              ? `${fmtAmount(platformStats.tvl)} ${CURRENCY_SYMBOL}`
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

      {/* Main Layout: 2-column on >=1100px, 1-column below */}
      <div className="tenders-main-layout">
        {/* Left Column (360px on >=1100px): Tender List */}
        <aside className="tenders-list-col" aria-label="Tenders Catalog">
          <div className="section-header-clean">
            <h2 className="section-title-clean">Tenders</h2>
            <div className="tenders-header-actions">
              <button
                type="button"
                className="btn-clean-refresh font-mono"
                onClick={() => performFullDataLoad()}
                disabled={isRefreshRunningRef.current}
                title="Refresh Tenders and Activity"
              >
                🔄 Refresh
              </button>
              {lastUpdatedTime && (
                <span className="last-updated-text font-mono">
                  Last updated {lastUpdatedTime}
                </span>
              )}
              {refreshErrorChip && (
                <span
                  className="refresh-error-chip font-mono"
                  role="status"
                  aria-live="polite"
                >
                  Could not refresh, showing last data
                </span>
              )}
            </div>
          </div>

          {tenders.length === 0 ? (
            <div className="empty-state-clean">
              <p>
                {dataLoadError
                  ? "Unable to load tenders due to connection error."
                  : isDataLoading
                  ? "Loading tenders from blockchain..."
                  : "No tenders yet"}
              </p>
            </div>
          ) : (
            <div className="tender-cards-list">
              {sortedTenders.map((t) => {
                const statusInfo = getTenderStatus(t, blockTimestamp);
                const isSelected = activeTender && Number(activeTender.id) === Number(t.id);
                const maxPriceFormatted = `${fmtAmount(t.ceilingPrice)} ${CURRENCY_SYMBOL}`;
                const depositFormatted = `${fmtAmount(t.bidBond)} ${CURRENCY_SYMBOL}`;

                return (
                  <div
                    key={t.id}
                    className={`tender-summary-card ${isSelected ? "selected" : ""}`}
                    onClick={() => handleSelectTender(t.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleSelectTender(t.id);
                      }
                    }}
                    style={{ cursor: "pointer" }}
                    aria-label={`Select Tender #${t.id}`}
                  >
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
                  </div>
                );
              })}
            </div>
          )}
        </aside>

        {/* Right Column: Selected Tender Details */}
        <section className="tenders-detail-col tender-detail-view" aria-label="Selected Tender Details">
          {activeTender ? (
            <>
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

              {/* Deadlines metadata block */}
              <div className="tender-deadlines-bar">
                <div className="deadline-item">
                  <span className="deadline-label">Commit Deadline:</span>{" "}
                  <span className="deadline-val font-mono">{fmtDateTime(activeTender.commitDeadline)}</span>
                </div>
                <div className="deadline-item">
                  <span className="deadline-label">Reveal Deadline:</span>{" "}
                  <span className="deadline-val font-mono">{fmtDateTime(activeTender.revealDeadline)}</span>
                </div>
                {activeTender.escrowDeadline && Number(activeTender.escrowDeadline) > 0 && (
                  <div className="deadline-item">
                    <span className="deadline-label">Escrow Deadline:</span>{" "}
                    <span className="deadline-val font-mono">{fmtDateTime(activeTender.escrowDeadline)}</span>
                  </div>
                )}
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
                {(isDataLoading || (!hasBidsData && isInternalLoading)) ? (
                  <p className="clean-empty-msg">Loading bids...</p>
                ) : (effectiveCommittedBidders?.length ?? 0) === 0 ? (
                  <p className="clean-empty-msg">No bids yet</p>
                ) : isPreReveal ? (
                  <div className="table-responsive">
                    <table className="clean-table">
                      <thead>
                        <tr>
                          <th>Wallet</th>
                          <th>Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {effectiveCommittedBidders.map((b) => {
                          const addrKey = b.bidder || `bid-${b.commitHash || Math.random()}`;
                          return (
                            <tr key={addrKey}>
                              <td className="font-mono">{b.bidder ? `${b.bidder.slice(0, 6)}...${b.bidder.slice(-4)}` : "--"}</td>
                              <td>
                                <span className="status-sealed">🔒 Sealed</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
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
                        {effectiveRevealedBids.map((b) => {
                          const winningBidder = effectiveTenderDetails?.winningBidder || activeTender?.winningBidder;
                          const isWinner =
                            winningBidder &&
                            winningBidder !== ethers.ZeroAddress &&
                            b.bidder &&
                            winningBidder.toLowerCase() === b.bidder.toLowerCase();
                          const rowKey = b.bidder ? `rev-${b.bidder.toLowerCase()}` : `rev-${b.amount}`;
                          return (
                            <tr key={rowKey}>
                              <td className="font-mono">{b.bidder ? `${b.bidder.slice(0, 6)}...${b.bidder.slice(-4)}` : "--"}</td>
                              <td className="font-mono">{fmtAmount(b.amount ?? 0n)} {CURRENCY_SYMBOL}</td>
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
                        {effectiveCommittedBidders
                          .filter((cb) => cb.bidder && !effectiveRevealedBids.some((rb) => rb.bidder && rb.bidder.toLowerCase() === cb.bidder.toLowerCase()))
                          .map((cb) => {
                            const unrevKey = `unrev-${cb.bidder.toLowerCase()}`;
                            return (
                              <tr key={unrevKey}>
                                <td className="font-mono">{cb.bidder ? `${cb.bidder.slice(0, 6)}...${cb.bidder.slice(-4)}` : "--"}</td>
                                <td className="font-mono">-</td>
                                <td>
                                  <span className="label-forfeited">Did not open: deposit forfeited</span>
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* c) "Payment stages" table from getMilestones */}
              <div className="detail-section">
                <h3 className="detail-section-title">Payment stages</h3>
                {(isDataLoading || (!hasStagesData && isInternalLoading)) ? (
                  <p className="clean-empty-msg">Loading payment stages...</p>
                ) : effectiveMilestones && effectiveMilestones.length > 0 ? (
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
                        {effectiveMilestones.map((m, idx) => {
                          const statusNum = Number(m.status);
                          const statusText =
                            statusNum === 2 ? "Approved and paid" : statusNum === 1 ? "Work submitted" : "Waiting";
                          const requiredApprovals = Number(
                            effectiveTenderDetails?.approvalThreshold ||
                            activeTender?.approvalThreshold ||
                            2
                          );
                          const currentApprovals = Number(m.approvalCount || 0);
                          const amountPaidText =
                            statusNum === 2 ? `${fmtAmount(m.payoutAmount ?? 0n)} ${CURRENCY_SYMBOL}` : "-";
                          let hasPenalty = false;
                          try {
                            hasPenalty = m.penaltyDeducted && BigInt(m.penaltyDeducted) > 0n;
                          } catch {
                            hasPenalty = false;
                          }
                          const penaltyText = hasPenalty
                            ? `${fmtAmount(m.penaltyDeducted)} ${CURRENCY_SYMBOL}`
                            : "-";

                          return (
                            <tr key={idx}>
                              <td>Stage #{idx + 1}</td>
                              <td>{(Number(m.percentageBps) / 100).toFixed(1)}%</td>
                              <td>{fmtDateTime(m.dueDate)}</td>
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
                    {activityList.map((act, i) => {
                      const rowKey = act.txHash ? `${act.txHash}-${act.logIndex ?? i}` : `act-${i}`;
                      return (
                        <li key={rowKey} className="activity-clean-item">
                          <span className="activity-sentence">{act.sentence}</span>
                          <span className="activity-time">{act.time}</span>
                          {act.txHash && cleanExplorerUrl && (
                            <a
                              href={`${cleanExplorerUrl}/tx/${act.txHash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="activity-link"
                            >
                              Tx ↗
                            </a>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="clean-empty-msg">No activity recorded for this tender yet.</p>
                )}
              </div>
            </>
          ) : (
            <div className="empty-state-clean">
              <p>Select a tender to view details</p>
            </div>
          )}
        </section>
      </div>

      {/* STEP 5: "Try to cheat" Popup Modal */}
      {showCheatModal && (
        <div className="modal-backdrop" onClick={() => setShowCheatModal(false)}>
          <div className="modal-dialog cheat-modal-dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="cheat-modal-title">
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
