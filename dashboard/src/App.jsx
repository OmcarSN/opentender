import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { ethers } from "ethers";
import {
  CONTRACT_ADDRESS,
  CHAIN_ID,
  CHAIN_NAME,
  RPC_URL,
  CURRENCY_SYMBOL,
  EXPLORER_URL,
  getReadOnlyContract,
  getSignerContract,
  OpenTenderABI,
} from "./config";
import Header from "./components/Header";
import WalletModal from "./components/WalletModal";
import HomeTab from "./components/HomeTab";
import PublicAuditTab from "./components/PublicAuditTab";
import BidderTab from "./components/BidderTab";
import OfficerTab from "./components/OfficerTab";
import TxNotification from "./components/TxNotification";
import { parseContractError } from "./utils/errors";

// Helper to resolve the correct wallet provider (handling multi-wallet collision)
function getWalletProviderByName(name) {
  if (typeof window === "undefined") return null;
  const n = (name || "").toLowerCase();
  if (n === "bridgekey") {
    if (window.bridgekey || window.bridgeKey) {
      return window.bridgekey?.ethereum || window.bridgekey || window.bridgeKey;
    }
    if (window.ethereum?.isBridgeKey) return window.ethereum;
    if (window.ethereum && Array.isArray(window.ethereum.providers)) {
      const p = window.ethereum.providers.find((x) => x.isBridgeKey);
      if (p) return p;
    }
    return null; // Never silently fall back to MetaMask when user asked for BridgeKey!
  }
  if (n === "metamask") {
    if (window.ethereum && Array.isArray(window.ethereum.providers)) {
      const p = window.ethereum.providers.find((x) => x.isMetaMask && !x.isBridgeKey);
      if (p) return p;
    }
    if (window.ethereum?.isMetaMask && !window.ethereum?.isBridgeKey) return window.ethereum;
    return null;
  }
  if (n === "coinbase" || n.includes("coinbase")) {
    if (window.ethereum && Array.isArray(window.ethereum.providers)) {
      const p = window.ethereum.providers.find((x) => x.isCoinbaseWallet);
      if (p) return p;
    }
    if (window.ethereum?.isCoinbaseWallet) return window.ethereum;
    return null;
  }
  if (n === "injected" || n === "browser wallet") {
    return window.ethereum || null;
  }
  return window.ethereum || null;
}

// Helper for 6-second timeout on individual RPC calls
function withTimeout(promise, ms = 6000, callName = "call") {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const err = new Error(`${callName} timed out after ${ms / 1000}s`);
      reject(err);
    }, ms);

    promise
      .then((res) => {
        clearTimeout(timer);
        resolve(res);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

// Concurrency pool runner: executes tasks with at most `limit` running concurrently (max 2)
async function runWithConcurrency(tasks, limit = 2) {
  const results = new Array(tasks.length);
  let nextIdx = 0;

  async function worker() {
    while (nextIdx < tasks.length) {
      const idx = nextIdx++;
      try {
        results[idx] = await tasks[idx]();
      } catch (err) {
        results[idx] = { __error: err };
      }
    }
  }

  const workerCount = Math.min(limit, tasks.length);
  const workers = [];
  for (let i = 0; i < workerCount; i++) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return results;
}

export default function App() {
  const [account, setAccount] = useState(null);
  const [signer, setSigner] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [balance, setBalance] = useState("...");
  const [roles, setRoles] = useState({
    isRegistrar: false,
    isDepartment: false,
    isVerifier: false,
    isBidder: false,
    isDebarred: false,
    isLoading: false,
    isError: false,
  });

  const [showWalletModal, setShowWalletModal] = useState(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      return p.get("walletModal") === "true" || p.get("connect") === "true";
    } catch {
      return false;
    }
  });
  const [activeWalletProvider, setActiveWalletProvider] = useState(() => {
    if (typeof window === "undefined") return null;
    try {
      const savedName = localStorage.getItem("opentender_wallet_name");
      if (savedName) {
        const resolved = getWalletProviderByName(savedName);
        if (resolved) return resolved;
      }
    } catch {}
    return window.ethereum || null;
  });
  const [activeWalletName, setActiveWalletName] = useState(() => {
    try {
      return localStorage.getItem("opentender_wallet_name") || "";
    } catch {
      return "";
    }
  });
  const [searchQuery, setSearchQuery] = useState("");

  const [activeTab, setActiveTab] = useState(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get("tab");
      // Explicit deep links to specific role portals
      if (tabParam === "bidder" || tabParam === "officer") {
        return tabParam;
      }
      // Explicit deep link to specific tender or cheat test
      if (tabParam === "audit" && (params.get("cheat") === "true" || params.get("tender"))) {
        return "audit";
      }
      if (tabParam === "home") {
        return "home";
      }
      const hash = window.location.hash.replace("#", "");
      if (hash === "bidder" || hash === "officer") {
        return hash;
      }
    } catch {
      // Fallback
    }
    // Website always opens on "How it works" (home) page first
    return "home";
  });

  // Clean root URL when opening website on home
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get("tab");
      if (tabParam === "audit" || tabParam === "home") {
        if (!params.get("tender") && params.get("cheat") !== "true") {
          const url = new URL(window.location.href);
          url.searchParams.delete("tab");
          window.history.replaceState({}, "", url);
        }
      }
    } catch {
      // Fallback
    }
  }, []);

  function handleTabChange(tab, openCheat = false) {
    setActiveTab(tab);
    try {
      const url = new URL(window.location.href);
      if (tab === "home") {
        url.searchParams.delete("tab");
      } else {
        url.searchParams.set("tab", tab);
      }
      if (openCheat && tab === "audit") {
        url.searchParams.set("cheat", "true");
      } else {
        url.searchParams.delete("cheat");
      }
      window.history.replaceState({}, "", url);
    } catch {
      // Fallback
    }
  }

  function handleSwitchToBidder(tenderId) {
    if (tenderId) setSelectedTenderId(Number(tenderId));
    handleTabChange("bidder");
  }

  const readContract = useMemo(() => getReadOnlyContract(), []);

  const [tenders, setTenders] = useState([]);
  const [selectedTenderId, setSelectedTenderId] = useState(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const t = params.get("tender");
      if (t) return parseInt(t, 10);
    } catch {}
    return null;
  });
  const [selectedTenderDetails, setSelectedTenderDetails] = useState(null);
  const [milestones, setMilestones] = useState([]);
  const [timeline, setTimeline] = useState(null);
  const [revealedBids, setRevealedBids] = useState([]);
  const [committedBidders, setCommittedBidders] = useState([]);
  const [platformStats, setPlatformStats] = useState(null);
  const [events, setEvents] = useState([]);
  const [claimableBalance, setClaimableBalance] = useState(0n);
  const [latestBlockTimestamp, setLatestBlockTimestamp] = useState(0);
  const [isDataLoading, setIsDataLoading] = useState(true);
  const [dataLoadError, setDataLoadError] = useState(null);

  const [notification, setNotification] = useState({
    active: false,
    title: "",
    hash: "",
    error: "",
    success: "",
  });

  // Load tenders, stats, and events from contract
  const loadContractData = useCallback(async () => {
    setIsDataLoading(true);
    setDataLoadError(null);
    try {
      // Latest on-chain block timestamp
      const latestBlock = await readContract.runner.provider.getBlock("latest").catch(() => null);
      if (latestBlock) {
        setLatestBlockTimestamp(Number(latestBlock.timestamp));
      }

      // Platform stats
      const stats = await readContract.getPlatformStats().catch(() => null);
      if (stats) {
        setPlatformStats({
          tendersCount: stats[0],
          registeredBidders: stats[1],
          debarredBidders: stats[2],
          awardedTenders: stats[3],
          completedTenders: stats[4],
          defaultedTenders: stats[5],
          tvl: stats[6],
        });
      }

      // Fetch all tenders with error detection
      let count = 0;
      try {
        const countBig = await readContract.tenderCount();
        count = Number(countBig);
      } catch (err) {
        console.warn("Could not query tenderCount from contract:", err);
        setDataLoadError("Can't reach the blockchain right now");
      }

      const loadedTenders = [];
      for (let i = 1; i <= count; i++) {
        try {
          const t = await readContract.getTenderDetails(i);
          loadedTenders.push({
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
        } catch (e) {
          console.warn(`Error loading tender #${i}:`, e);
        }
      }
      setTenders(loadedTenders);

      // Selected tender data: default to newest tender if not explicitly set
      const targetId = selectedTenderId || (loadedTenders.length > 0 ? loadedTenders[loadedTenders.length - 1].id : 1);
      if (count > 0 && targetId <= count) {
        const [details, ms, tl] = await Promise.all([
          readContract.getTenderDetails(targetId).catch(() => null),
          readContract.getMilestones(targetId).catch(() => []),
          readContract.getTenderTimeline(targetId).catch(() => null),
        ]);

        setSelectedTenderDetails(details);
        setMilestones(ms);
        if (tl) {
          setTimeline({
            commitDeadline: tl[0],
            revealDeadline: tl[1],
            escrowDeadline: tl[2],
            gracePeriod: tl[3],
            currentPhase: tl[4],
          });
        }

        // Query committed bidders via event with recent fromBlock limit
        try {
          const commitFilter = readContract.filters.BidCommitted(targetId);
          const latestBlockNum = latestBlock?.number || (await readContract.runner.provider.getBlockNumber().catch(() => 0));
          const fromBlock = Math.max(0, latestBlockNum - 20000);
          const commitEvents = await readContract.queryFilter(commitFilter, fromBlock);
          const bList = commitEvents.map((e) => ({
            bidder: e.args.bidder || e.args[1],
            commitHash: e.args.commitHash || e.args[2],
            commitTime: e.args.commitTime || e.args[3],
          }));
          setCommittedBidders((prev) => (bList && bList.length > 0 ? bList : prev));
        } catch {
          // Keep previous bidders on RPC error, never wipe to empty
        }

        // Try reading revealed bids if phase ended
        try {
          const rev = await readContract.getRevealedBids(targetId);
          setRevealedBids((prev) => (rev && rev.length > 0 ? rev : prev));
        } catch {
          // Keep previous revealed bids on error
        }
      }

      // Load recent past events
      try {
        const latestBlock = await readContract.runner.provider.getBlockNumber();
        const fromBlock = Math.max(0, latestBlock - 5000);
        const filter = {
          address: CONTRACT_ADDRESS,
          fromBlock,
          toBlock: "latest",
        };
        const rawLogs = await readContract.runner.provider.getLogs(filter);
        const iface = readContract.interface;
        const parsedLogs = [];

        for (let i = rawLogs.length - 1; i >= 0 && parsedLogs.length < 30; i--) {
          try {
            const parsed = iface.parseLog(rawLogs[i]);
            if (parsed) {
              // Extract tenderId if defined on event arguments
              let tenderId = null;
              if (parsed.args) {
                if (parsed.args.tenderId !== undefined) {
                  tenderId = Number(parsed.args.tenderId);
                } else if (
                  (parsed.name.startsWith("Tender") ||
                    parsed.name.startsWith("Bid") ||
                    parsed.name.startsWith("Milestone") ||
                    parsed.name === "EscrowFunded" ||
                    parsed.name === "BondRefundClaimed") &&
                  parsed.args[0] !== undefined
                ) {
                  try {
                    tenderId = Number(parsed.args[0]);
                  } catch {
                    tenderId = null;
                  }
                }
              }

              const description =
                tenderId !== null
                  ? `${parsed.name} on tender #${tenderId}`
                  : `${parsed.name} event`;

              parsedLogs.push({
                name: parsed.name,
                tenderId: tenderId, // Normalized number or null for platform-wide events
                description: description,
                txHash: rawLogs[i].transactionHash,
                time: "Confirmed",
                args: parsed.args,
              });
            }
          } catch {
            // Ignore non-contract logs
          }
        }
        setEvents(parsedLogs);
      } catch {
        // Events optional
      }
    } catch (err) {
      console.warn("Read-only contract load notice:", err);
      setDataLoadError("Can't reach the blockchain right now");
    } finally {
      setIsDataLoading(false);
    }
  }, [selectedTenderId]);

  // Check roles and balances for connected account with retry, normalization, concurrency limit (max 2), 6s timeout, BrowserProvider fallback, and 20s watchdog
  const roleRequestCounter = useRef(0);
  const roleWatchdogTimer = useRef(null);

  const checkAccountRoles = useCallback(async (userAddress, userSigner) => {
    if (!userAddress) return;

    let normAddress;
    try {
      normAddress = ethers.getAddress(userAddress);
    } catch {
      normAddress = userAddress;
    }

    const currentRequestId = ++roleRequestCounter.current;
    let isWatchdogAborted = false;

    // Reset error, show loading, and set balance to "..." while fetching
    setRoles((prev) => ({ ...prev, isLoading: true, isError: false }));
    setBalance((prev) => (prev && prev !== "0" && prev !== "0.0000" ? prev : "..."));

    // Watchdog timer: never show "Checking role..." for more than 20 seconds
    if (roleWatchdogTimer.current) {
      clearTimeout(roleWatchdogTimer.current);
    }
    roleWatchdogTimer.current = setTimeout(() => {
      if (roleRequestCounter.current === currentRequestId) {
        console.warn("[OpenTender] Role check 20-second limit reached. Displaying retry.");
        isWatchdogAborted = true;
        setRoles((prev) => ({ ...prev, isLoading: false, isError: true }));
        setBalance((prev) => (prev && prev !== "0" && prev !== "0.0000" ? prev : "..."));
      }
    }, 20000);

    const REGISTRAR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("REGISTRAR_ROLE"));
    const DEPARTMENT_ROLE = ethers.keccak256(ethers.toUtf8Bytes("DEPARTMENT_ROLE"));
    const VERIFIER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("VERIFIER_ROLE"));
    const DEFAULT_ADMIN = ethers.ZeroHash;

    // Helper to run batch of queries with 6s timeout per call and at most 2 requests concurrently
    const executeQueryBatch = async (targetContract, targetProvider, providerName) => {
      const taskList = [
        // 0: balance
        async () => {
          try {
            return await withTimeout(targetProvider.getBalance(normAddress), 6000, `${providerName} getBalance`);
          } catch (err) {
            console.error(`[OpenTender] ${providerName} getBalance failed:`, err?.message || err);
            throw err;
          }
        },
        // 1: registrar
        async () => {
          try {
            return await withTimeout(targetContract.hasRole(REGISTRAR_ROLE, normAddress), 6000, `${providerName} hasRole(REGISTRAR)`);
          } catch (err) {
            console.error(`[OpenTender] ${providerName} hasRole(REGISTRAR) failed:`, err?.message || err);
            throw err;
          }
        },
        // 2: admin
        async () => {
          try {
            return await withTimeout(targetContract.hasRole(DEFAULT_ADMIN, normAddress), 6000, `${providerName} hasRole(ADMIN)`);
          } catch (err) {
            console.error(`[OpenTender] ${providerName} hasRole(ADMIN) failed:`, err?.message || err);
            throw err;
          }
        },
        // 3: department
        async () => {
          try {
            return await withTimeout(targetContract.hasRole(DEPARTMENT_ROLE, normAddress), 6000, `${providerName} hasRole(DEPARTMENT)`);
          } catch (err) {
            console.error(`[OpenTender] ${providerName} hasRole(DEPARTMENT) failed:`, err?.message || err);
            throw err;
          }
        },
        // 4: verifier
        async () => {
          try {
            return await withTimeout(targetContract.hasRole(VERIFIER_ROLE, normAddress), 6000, `${providerName} hasRole(VERIFIER)`);
          } catch (err) {
            console.error(`[OpenTender] ${providerName} hasRole(VERIFIER) failed:`, err?.message || err);
            throw err;
          }
        },
        // 5: bidderStatus
        async () => {
          try {
            return await withTimeout(targetContract.getBidderStatus(normAddress), 6000, `${providerName} getBidderStatus`);
          } catch (err) {
            console.error(`[OpenTender] ${providerName} getBidderStatus failed:`, err?.message || err);
            throw err;
          }
        },
        // 6: claimableBalance
        async () => {
          try {
            return await withTimeout(targetContract.claimableBalance(normAddress), 6000, `${providerName} claimableBalance`);
          } catch (err) {
            console.error(`[OpenTender] ${providerName} claimableBalance failed:`, err?.message || err);
            throw err;
          }
        },
      ];

      return await runWithConcurrency(taskList, 2);
    };

    // Helper to get fallback provider from connected wallet's BrowserProvider
    const getWalletFallback = () => {
      try {
        let p = null;
        if (userSigner && userSigner.provider) {
          p = userSigner.provider;
        } else if (activeWalletProvider) {
          p = new ethers.BrowserProvider(activeWalletProvider);
        } else if (typeof window !== "undefined" && window.ethereum) {
          p = new ethers.BrowserProvider(window.ethereum);
        }
        if (p) {
          const c = new ethers.Contract(CONTRACT_ADDRESS, OpenTenderABI, p);
          return { provider: p, contract: c };
        }
      } catch (e) {
        console.error("[OpenTender] Failed to create wallet fallback provider:", e?.message || e);
      }
      return { provider: null, contract: null };
    };

    try {
      for (let attempt = 1; attempt <= 3; attempt++) {
        if (isWatchdogAborted || roleRequestCounter.current !== currentRequestId) {
          return;
        }

        // 1. Try read-only provider first
        let results = await executeQueryBatch(readContract, readContract.runner.provider, "ReadOnly");

        if (isWatchdogAborted || roleRequestCounter.current !== currentRequestId) {
          return;
        }

        // Check if any role call failed
        const [balRes, regRes, admRes, deptRes, verifRes, bidderRes, claimRes] = results;
        const roleFailed = regRes?.__error || admRes?.__error || deptRes?.__error || verifRes?.__error || bidderRes?.__error;

        // 2. If read-only provider failed on roles, retry through wallet's BrowserProvider before giving up
        let finalResults = results;
        if (roleFailed) {
          const fallback = getWalletFallback();
          if (fallback.contract && fallback.provider) {
            console.warn(`[OpenTender] Attempt ${attempt}: Read-only provider failed for roles. Retrying through wallet BrowserProvider...`);
            const fallbackResults = await executeQueryBatch(fallback.contract, fallback.provider, "WalletBrowserProvider");
            if (isWatchdogAborted || roleRequestCounter.current !== currentRequestId) {
              return;
            }
            finalResults = fallbackResults;
          }
        }

        const [fBal, fReg, fAdm, fDept, fVerif, fBidder, fClaim] = finalResults;
        const fRoleFailed = fReg?.__error || fAdm?.__error || fDept?.__error || fVerif?.__error || fBidder?.__error;

        if (!fRoleFailed) {
          // Success! Clear watchdog timer
          if (roleWatchdogTimer.current) {
            clearTimeout(roleWatchdogTimer.current);
            roleWatchdogTimer.current = null;
          }

          // Handle balance: if read fails, show "..." and not 0.0000
          if (!fBal?.__error && fBal !== undefined) {
            setBalance(ethers.formatEther(fBal));
          } else {
            setBalance("...");
          }

          setRoles({
            isRegistrar: Boolean(fReg || fAdm),
            isDepartment: Boolean(fDept),
            isVerifier: Boolean(fVerif),
            isBidder: Boolean(fBidder?.registered),
            isDebarred: Boolean(fBidder?.debarred),
            isLoading: false,
            isError: false,
          });

          if (!fClaim?.__error && fClaim !== undefined) {
            setClaimableBalance(fClaim);
          }
          return;
        }

        // If attempt failed, wait briefly before retrying if attempts remain
        if (attempt < 3) {
          await new Promise((r) => setTimeout(r, 600));
        }
      }

      // If all 3 attempts failed across providers and still the active request:
      if (roleRequestCounter.current === currentRequestId && !isWatchdogAborted) {
        if (roleWatchdogTimer.current) {
          clearTimeout(roleWatchdogTimer.current);
          roleWatchdogTimer.current = null;
        }
        console.error("[OpenTender] All 3 role check attempts failed across providers. Displaying retry.");
        setRoles((prev) => ({
          ...prev,
          isLoading: false,
          isError: true,
        }));
        setBalance((prev) => (prev && prev !== "0" && prev !== "0.0000" ? prev : "..."));
      }
    } catch (err) {
      console.error("[OpenTender] Unexpected error in checkAccountRoles:", err?.message || err);
      if (roleRequestCounter.current === currentRequestId) {
        if (roleWatchdogTimer.current) {
          clearTimeout(roleWatchdogTimer.current);
          roleWatchdogTimer.current = null;
        }
        setRoles((prev) => ({
          ...prev,
          isLoading: false,
          isError: true,
        }));
        setBalance("...");
      }
    }
  }, [readContract, activeWalletProvider]);

  // Connect Wallet (opens Multi-Wallet selection modal or connects directly)
  function handleOpenConnect() {
    setShowWalletModal(true);
  }

  const isConnectingRef = useRef(false);

  async function connectWalletWithProvider(chosenProvider, walletName = "", walletId = "") {
    if (isConnectingRef.current) {
      console.warn("[OpenTender] Connection operation already in progress, ignoring duplicate trigger.");
      return;
    }

    const resolvedName = walletName || (walletId === "bridgekey" ? "BridgeKey" : "Wallet");
    const rawProvider = chosenProvider || (walletName ? getWalletProviderByName(walletName) : null) || activeWalletProvider;

    if (!rawProvider) {
      setNotification({
        active: false,
        title: `${resolvedName} Not Detected`,
        error: `${resolvedName} extension was not found in this browser. Please install or enable it to continue.`
      });
      return;
    }

    isConnectingRef.current = true;
    try {
      if (rawProvider.request) {
        await rawProvider.request({ method: "eth_requestAccounts" });
      }
      const browserProvider = new ethers.BrowserProvider(rawProvider);
      const s = await browserProvider.getSigner();
      const addr = await s.getAddress();
      const network = await browserProvider.getNetwork();

      setActiveWalletProvider(rawProvider);
      if (resolvedName) {
        setActiveWalletName(resolvedName);
        try { localStorage.setItem("opentender_wallet_name", resolvedName); } catch {}
      }
      try { localStorage.removeItem("opentender_disconnected"); } catch {}
      setAccount(addr);
      setSigner(s);
      setChainId(Number(network.chainId));
      setBalance("...");

      if (Number(network.chainId) === 31337) {
        try {
          await browserProvider.send("hardhat_setBalance", [
            addr,
            "0x3635C9ADC5DEA00000",
          ]);
        } catch {
          // Ignore if provider doesn't support
        }
      }

      await checkAccountRoles(addr, s);
      await loadContractData();
      setShowWalletModal(false);
    } catch (err) {
      console.error("[OpenTender] Connection error:", err);
      setNotification({ active: false, title: "Connection Failed", error: parseContractError(err, "connection") });
    } finally {
      isConnectingRef.current = false;
    }
  }

  function disconnectWallet() {
    if (roleWatchdogTimer.current) {
      clearTimeout(roleWatchdogTimer.current);
      roleWatchdogTimer.current = null;
    }
    roleRequestCounter.current++; // Invalidate pending role check

    // Attempt wallet permission revocation if supported by the provider
    if (activeWalletProvider && activeWalletProvider.request) {
      activeWalletProvider.request({
        method: "wallet_revokePermissions",
        params: [{ eth_accounts: {} }]
      }).catch(() => {
        // Not all wallets support wallet_revokePermissions, safely ignore
      });
    }

    setAccount(null);
    setSigner(null);
    setActiveWalletProvider(null);
    setActiveWalletName("");
    setBalance("0");
    setClaimableBalance(0n);
    setRoles({
      isRegistrar: false,
      isDepartment: false,
      isVerifier: false,
      isBidder: false,
      isDebarred: false,
      isLoading: false,
      isError: false,
    });
    try {
      localStorage.removeItem("opentender_wallet_name");
      localStorage.setItem("opentender_disconnected", "true");
    } catch {}
  }

  // Add / Switch Network with immediate in-place verification (no disruptive page reloads)
  async function switchNetwork() {
    const provider = activeWalletProvider || window.ethereum;
    if (!provider || !provider.request) return;
    const hexChainId = "0x" + CHAIN_ID.toString(16);
    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: hexChainId }],
      });
    } catch (switchError) {
      const errCode = switchError?.code || switchError?.data?.originalError?.code;
      const errMsg = (switchError?.message || "").toLowerCase();
      if (errCode === 4902 || errMsg.includes("unrecognized") || errMsg.includes("not found") || errMsg.includes("add")) {
        try {
          await provider.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: hexChainId,
                chainName: CHAIN_NAME,
                rpcUrls: [RPC_URL],
                nativeCurrency: {
                  name: CURRENCY_SYMBOL,
                  symbol: CURRENCY_SYMBOL,
                  decimals: 18,
                },
                blockExplorerUrls: EXPLORER_URL ? [EXPLORER_URL] : null,
              },
            ],
          });
        } catch (addError) {
          setNotification({
            active: false,
            title: "Network Switch Failed",
            error: parseContractError(addError, "general"),
          });
          return;
        }
      } else {
        setNotification({
          active: false,
          title: "Network Switch Rejected",
          error: parseContractError(switchError, "general"),
        });
        return;
      }
    }

    // Verify network immediately post-switch without reloading page
    try {
      const browserProvider = new ethers.BrowserProvider(provider);
      const net = await browserProvider.getNetwork();
      const newChainId = Number(net.chainId);
      setChainId(newChainId);
      if (newChainId === Number(CHAIN_ID) && account) {
        const newSigner = await browserProvider.getSigner();
        setSigner(newSigner);
        checkAccountRoles(account, newSigner);
        setNotification({
          active: false,
          title: "Network Switched",
          success: `Connected to ${CHAIN_NAME}.`,
        });
      }
    } catch (e) {
      console.warn("[OpenTender] Post-switch check notice:", e);
    }
  }

  // Handle account and network changes in active wallet & silent auto-reconnect if already authorized
  useEffect(() => {
    const p = activeWalletProvider || (typeof window !== "undefined" ? getWalletProviderByName(activeWalletName) : null);
    if (!p) return;

    // Silent auto-reconnect if the user did NOT explicitly click disconnect
    let isExplicitlyDisconnected = false;
    try {
      isExplicitlyDisconnected = localStorage.getItem("opentender_disconnected") === "true";
    } catch {}

    if (!account && !isExplicitlyDisconnected && p.request && !isConnectingRef.current) {
      p.request({ method: "eth_accounts" })
        .then((accounts) => {
          if (accounts && accounts.length > 0 && !isConnectingRef.current) {
            connectWalletWithProvider(p, activeWalletName);
          }
        })
        .catch(() => {});
    }

    if (p.on) {
      const handleAccounts = (accounts) => {
        if (accounts && accounts.length > 0) {
          connectWalletWithProvider(p, activeWalletName);
        } else {
          disconnectWallet();
        }
      };
      const handleChain = (newChainHex) => {
        let newChainNum = null;
        try {
          if (typeof newChainHex === "string") {
            newChainNum = parseInt(newChainHex, 16);
          }
        } catch {}
        if (!newChainNum && p) {
          const bp = new ethers.BrowserProvider(p);
          bp.getNetwork().then((net) => {
            const cid = Number(net.chainId);
            setChainId(cid);
            if (cid === Number(CHAIN_ID) && account) {
              bp.getSigner().then((s) => {
                setSigner(s);
                checkAccountRoles(account, s);
              }).catch(() => {});
            }
          }).catch(() => {});
          return;
        }
        setChainId(newChainNum);
        if (newChainNum === Number(CHAIN_ID) && account && p) {
          const bp = new ethers.BrowserProvider(p);
          bp.getSigner().then((s) => {
            setSigner(s);
            checkAccountRoles(account, s);
          }).catch(() => {});
        }
      };
      const handleDisconnect = () => {
        disconnectWallet();
      };

      p.on("accountsChanged", handleAccounts);
      p.on("chainChanged", handleChain);
      if (p.on) p.on("disconnect", handleDisconnect);

      return () => {
        if (p.removeListener) {
          p.removeListener("accountsChanged", handleAccounts);
          p.removeListener("chainChanged", handleChain);
          p.removeListener("disconnect", handleDisconnect);
        }
      };
    }
  }, [activeWalletProvider, activeWalletName, checkAccountRoles, account]);

  useEffect(() => {
    loadContractData();
    const interval = setInterval(() => {
      loadContractData();
    }, 20000);
    return () => clearInterval(interval);
  }, [loadContractData]);

  const signerContract = signer ? getSignerContract(signer) : null;

  return (
    <div className="app-layout">
      <div className="vita-container">
        <Header
          account={account}
          chainId={chainId}
          roles={roles}
          balance={balance}
          activeTab={activeTab}
          onTabChange={handleTabChange}
          onConnect={handleOpenConnect}
          onDisconnect={disconnectWallet}
          onSwitchNetwork={switchNetwork}
          onRetryRoleCheck={() => {
            if (account) checkAccountRoles(account, signer);
          }}
          isRpcOnline={!dataLoadError}
        />

        {/* Main Tab Panels */}
        <main className="main-content">
          {activeTab === "home" && (
            <HomeTab
              onNavigate={(tab, openCheat) => handleTabChange(tab, openCheat)}
            />
          )}

          {activeTab === "audit" && (
            <PublicAuditTab
              contract={readContract}
              tenders={tenders}
              selectedTenderId={selectedTenderId}
              onSelectTender={setSelectedTenderId}
              tenderDetails={selectedTenderDetails}
              milestones={milestones}
              timeline={timeline}
              revealedBids={revealedBids}
              committedBidders={committedBidders}
              platformStats={platformStats}
              events={events}
              account={account}
              signer={signer}
              onSwitchToBidder={handleSwitchToBidder}
              searchQuery=""
              latestBlockTimestamp={latestBlockTimestamp}
              isDataLoading={isDataLoading}
              dataLoadError={dataLoadError}
              onRetry={loadContractData}
            />
          )}

        {activeTab === "bidder" && (
          <BidderTab
            account={account}
            signerContract={signerContract}
            tenders={tenders}
            selectedTenderId={selectedTenderId}
            onSelectTender={setSelectedTenderId}
            claimableBalance={claimableBalance}
            onRefresh={() => {
              loadContractData();
              if (account) checkAccountRoles(account, signer);
            }}
            setNotification={setNotification}
            isDataLoading={isDataLoading}
            dataLoadError={dataLoadError}
            chainId={chainId}
            roles={roles}
            latestBlockTimestamp={latestBlockTimestamp}
            onConnectWallet={() => setShowWalletModal(true)}
          />
        )}

        {activeTab === "officer" && (
          <OfficerTab
            account={account}
            roles={roles}
            signerContract={signerContract}
            tenders={tenders}
            selectedTenderId={selectedTenderId}
            selectedTenderDetails={selectedTenderDetails}
            onRefresh={() => {
              loadContractData();
              if (account) checkAccountRoles(account, signer);
            }}
            setNotification={setNotification}
            isDataLoading={isDataLoading}
            dataLoadError={dataLoadError}
            chainId={chainId}
            latestBlockTimestamp={latestBlockTimestamp}
          />
        )}
      </main>

        {/* Global Footer (Step 4) */}
        <footer className="vita-footer">
          <div className="vita-footer-content">
            <span>Demo prototype on {CHAIN_NAME}. Test tokens only. </span>
            <a
              href={`${EXPLORER_URL}/address/${CONTRACT_ADDRESS}`}
              target="_blank"
              rel="noopener noreferrer"
              className="footer-contract-link"
            >
              Contract {CONTRACT_ADDRESS.slice(0, 6)}...{CONTRACT_ADDRESS.slice(-4)} ↗
            </a>
          </div>
        </footer>

        {/* Notification Toast */}
        <TxNotification
          notification={notification}
          onDismiss={() => setNotification({ active: false, title: "", hash: "", error: "", success: "" })}
        />

        {/* Multi-Wallet Connection Modal */}
        <WalletModal
          isOpen={showWalletModal}
          onClose={() => setShowWalletModal(false)}
          onSelectWallet={connectWalletWithProvider}
        />
      </div>
    </div>
  );
}
