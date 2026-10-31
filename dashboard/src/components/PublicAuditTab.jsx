import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
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
  const [internalSelectedId, setInternalSelectedId] = useState(selectedTenderId || null);

  useEffect(() => {
    if (selectedTenderId !== undefined && selectedTenderId !== null) {
      setInternalSelectedId(selectedTenderId);
    }
  }, [selectedTenderId]);

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
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [procurementFilter, setProcurementFilter] = useState("all");

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

  // Sync block timestamp
  useEffect(() => {
    let isMounted = true;
    async function fetchBlockTime() {
      try {
        const provider =
          contract?.runner?.provider ||
          (contract?.runner && typeof contract.runner.getBlock === "function" ? contract.runner : null);
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
      (Number(tenderDetails?.id) === Number(id) && tenderDetails?.documentHash) ||
      tenders.find((t) => Number(t.id) === Number(id))?.documentHash ||
      "";
    const snippet = rawHash && typeof rawHash === "string" ? rawHash.slice(0, 10) : "";
    return `Tender #${id}${snippet ? ` ${snippet}` : ""}`;
  }

  // Sorted and filtered tenders
  // Sorted and filtered tenders
  const sortedTenders = useMemo(() => {
    let list = [...tenders];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((t) => {
        const heading = getTenderHeading(t.id).toLowerCase();
        const idMatch = String(t.id).includes(q);
        const docMatch = (t.documentHash || tenderDocHashes[t.id] || "").toLowerCase().includes(q);
        const catMatch = (t.category || "").toLowerCase().includes(q);
        const depMatch = (t.department || "").toLowerCase().includes(q);
        const titleMatch = (t.title || "").toLowerCase().includes(q);
        const descMatch = (t.description || "").toLowerCase().includes(q);
        const methodMatch = (t.procurementScale || t.scale || t.procurementMethod || "").toLowerCase().includes(q);
        const statusInfo = getTenderStatus(t, blockTimestamp);
        const statusMatch = (statusInfo.label || "").toLowerCase().includes(q);
        return heading.includes(q) || idMatch || docMatch || catMatch || depMatch || titleMatch || descMatch || methodMatch || statusMatch;
      });
    }
    if (categoryFilter !== "all") {
      list = list.filter((t) => (t.category || "").toLowerCase() === categoryFilter.toLowerCase());
    }
    if (procurementFilter !== "all") {
      list = list.filter((t) => {
        const method = (t.procurementScale || t.scale || t.procurementMethod || "").toLowerCase();
        return method === procurementFilter.toLowerCase();
      });
    }
    return list.sort((a, b) => Number(b.id) - Number(a.id));
  }, [tenders, searchQuery, categoryFilter, procurementFilter, tenderDocHashes, tenderDetails, blockTimestamp]);

  // Active tender object
  const activeTender = useMemo(() => {
    const currentId = internalSelectedId !== null && internalSelectedId !== undefined ? internalSelectedId : selectedTenderId;
    if (currentId !== null && currentId !== undefined) {
      const found = tenders.find((t) => Number(t.id) === Number(currentId));
      if (found) return found;
    }
    if (sortedTenders.length > 0) return sortedTenders[0];
    return tenderDetails || null;
  }, [internalSelectedId, selectedTenderId, tenders, sortedTenders, tenderDetails]);

  // Isolated tender state: verify props match active tender, otherwise load independently
  const isPropsForActive = Boolean(tenderDetails && Number(tenderDetails.id) === Number(activeTender?.id));

  const [internalDetails, setInternalDetails] = useState(null);
  const [internalMilestones, setInternalMilestones] = useState([]);
  const [internalRevealedBids, setInternalRevealedBids] = useState([]);
  const [internalCommittedBidders, setInternalCommittedBidders] = useState([]);
  const [isInternalLoading, setIsInternalLoading] = useState(false);

  useEffect(() => {
    if (!activeTender || isPropsForActive || !contract) {
      return;
    }
    let isMounted = true;
    setIsInternalLoading(true);

    async function fetchTenderData() {
      const tenderId = Number(activeTender.id);
      try {
        const [d, ms] = await Promise.all([
          contract.getTenderDetails(tenderId).catch(() => null),
          contract.getMilestones(tenderId).catch(() => []),
        ]);

        let rev = [];
        try {
          rev = await contract.getRevealedBids(tenderId);
        } catch {
          rev = [];
        }

        let committed = [];
        try {
          if (contract.filters?.BidCommitted && typeof contract.queryFilter === "function") {
            const filter = contract.filters.BidCommitted(tenderId);
            const evList = await contract.queryFilter(filter, 0);
            committed = evList.map((e) => ({
              bidder: e.args?.bidder || e.args?.[1],
              commitHash: e.args?.commitHash || e.args?.[2],
              commitTime: e.args?.commitTime || e.args?.[3],
            }));
          }
        } catch {
          committed = [];
        }

        if (isMounted) {
          if (d) setInternalDetails(d);
          setInternalMilestones(ms || []);
          setInternalRevealedBids(rev || []);
          setInternalCommittedBidders(committed || []);
          setIsInternalLoading(false);
        }
      } catch {
        if (isMounted) {
          setIsInternalLoading(false);
        }
      }
    }

    fetchTenderData();

    return () => {
      isMounted = false;
    };
  }, [activeTender?.id, isPropsForActive, contract]);

  const effectiveMilestones = isPropsForActive ? milestones : internalMilestones;
  const effectiveRevealedBids = isPropsForActive ? revealedBids : internalRevealedBids;
  const effectiveCommittedBidders = isPropsForActive ? committedBidders : internalCommittedBidders;
  const effectiveTenderDetails = isPropsForActive ? tenderDetails : internalDetails;

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
        <div className="section-header-clean" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem", marginBottom: "1rem" }}>
          <h2 className="section-title-clean" style={{ margin: 0 }}>Tenders</h2>
          <div className="audit-filters-bar" style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
            <input
              type="text"
              className="audit-search-input"
              placeholder="Search tenders..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search tenders"
              style={{ padding: "0.4rem 0.75rem", borderRadius: "6px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff", fontSize: "0.82rem" }}
            />
            <select
              className="audit-category-select"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              aria-label="Category filter"
              style={{ padding: "0.4rem 0.75rem", borderRadius: "6px", background: "#111827", border: "1px solid rgba(255,255,255,0.1)", color: "#fff", fontSize: "0.82rem" }}
            >
              <option value="all">All Categories</option>
              <option value="infrastructure">Infrastructure</option>
              <option value="technology">Technology</option>
              <option value="services">Services</option>
              <option value="energy">Energy</option>
              <option value="works">Works</option>
              <option value="goods">Goods</option>
            </select>
            <select
              className="audit-procurement-select"
              value={procurementFilter}
              onChange={(e) => setProcurementFilter(e.target.value)}
              aria-label="Procurement filter"
              style={{ padding: "0.4rem 0.75rem", borderRadius: "6px", background: "#111827", border: "1px solid rgba(255,255,255,0.1)", color: "#fff", fontSize: "0.82rem" }}
            >
              <option value="all">All Procurement</option>
              <option value="open">Open Tendering</option>
              <option value="restricted">Restricted</option>
              <option value="direct">Direct</option>
              <option value="two-stage">Two-Stage</option>
            </select>
            {(searchQuery || categoryFilter !== "all" || procurementFilter !== "all") && (
              <button
                type="button"
                className="btn-reset-filters"
                onClick={() => {
                  setSearchQuery("");
                  setCategoryFilter("all");
                  setProcurementFilter("all");
                }}
                style={{ padding: "0.4rem 0.75rem", borderRadius: "6px", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", color: "#fff", cursor: "pointer", fontSize: "0.82rem" }}
              >
                Reset Filters
              </button>
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
        ) : sortedTenders.length === 0 ? (
          <div className="empty-state-clean">
            <p>No tenders match your filters</p>
            <button
              type="button"
              className="btn-reset-filters"
              onClick={() => {
                setSearchQuery("");
                setCategoryFilter("all");
                setProcurementFilter("all");
              }}
              style={{ marginTop: "0.5rem", padding: "0.4rem 0.75rem", borderRadius: "6px", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", color: "#fff", cursor: "pointer", fontSize: "0.82rem" }}
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="tender-cards-list">
            {sortedTenders.map((t) => {
              const statusInfo = getTenderStatus(t, blockTimestamp);
              const isSelected = activeTender && Number(activeTender.id) === Number(t.id);
              const maxPriceFormatted = `${ethers.formatEther(t.ceilingPrice)} ${CURRENCY_SYMBOL}`;
              const depositFormatted = `${ethers.formatEther(t.bidBond)} ${CURRENCY_SYMBOL}`;

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

                  <div className="tender-card-actions">
                    <button
                      type="button"
                      className={`btn-view-tender ${isSelected ? "active" : ""}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectTender(t.id);
                      }}
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
            {isDataLoading || (!isPropsForActive && isInternalLoading) ? (
              <p className="clean-empty-msg">Loading bids...</p>
            ) : isPreReveal ? (
              effectiveCommittedBidders && effectiveCommittedBidders.length > 0 ? (
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
                      {effectiveCommittedBidders.map((b, i) => (
                        <tr key={i}>
                          <td className="font-mono">{b.bidder ? `${b.bidder.slice(0, 6)}...${b.bidder.slice(-4)}` : "--"}</td>
                          <td>
                            <span className="status-sealed">🔒 Sealed</span>
                          </td>
                          <td className="font-mono">{b.commitHash ? `${b.commitHash.slice(0, 10)}...${b.commitHash.slice(-8)}` : "--"}</td>
                          <td>{b.commitTime && Number(b.commitTime) > 0 ? new Date(Number(b.commitTime) * 1000).toLocaleString() : "--"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="clean-empty-msg">No bids submitted yet.</p>
              )
            ) : (
              effectiveRevealedBids && effectiveRevealedBids.length > 0 ? (
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
                      {effectiveRevealedBids.map((b, i) => {
                        const winningBidder = effectiveTenderDetails?.winningBidder || activeTender?.winningBidder;
                        const isWinner =
                          winningBidder &&
                          winningBidder !== ethers.ZeroAddress &&
                          b.bidder &&
                          winningBidder.toLowerCase() === b.bidder.toLowerCase();
                        return (
                          <tr key={`rev-${i}`}>
                            <td className="font-mono">{b.bidder ? `${b.bidder.slice(0, 6)}...${b.bidder.slice(-4)}` : "--"}</td>
                            <td className="font-mono">{ethers.formatEther(b.amount ?? 0n)} {CURRENCY_SYMBOL}</td>
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
            {isDataLoading || (!isPropsForActive && isInternalLoading) ? (
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
                        statusNum === 2 ? `${ethers.formatEther(m.payoutAmount ?? 0n)} ${CURRENCY_SYMBOL}` : "-";
                      let hasPenalty = false;
                      try {
                        hasPenalty = m.penaltyDeducted && BigInt(m.penaltyDeducted) > 0n;
                      } catch {
                        hasPenalty = false;
                      }
                      const penaltyText = hasPenalty
                        ? `${ethers.formatEther(m.penaltyDeducted)} ${CURRENCY_SYMBOL}`
                        : "-";

                      return (
                        <tr key={idx}>
                          <td>Stage #{idx + 1}</td>
                          <td>{(Number(m.percentageBps) / 100).toFixed(1)}%</td>
                          <td>{m.dueDate && Number(m.dueDate) > 0 ? new Date(Number(m.dueDate) * 1000).toLocaleDateString() : "--"}</td>
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
