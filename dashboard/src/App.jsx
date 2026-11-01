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
  if (n === "bridgekey" && (window.bridgekey || window.bridgeKey)) {
    return window.bridgekey?.ethereum || window.bridgekey || window.bridgeKey;
  }
  if (window.ethereum && Array.isArray(window.ethereum.providers)) {
    if (n === "bridgekey") {
      const p = window.ethereum.providers.find((x) => x.isBridgeKey);
      if (p) return p;
    }
    if (n === "metamask") {
      const p = window.ethereum.providers.find((x) => x.isMetaMask && !x.isBridgeKey);
      if (p) return p;
    }
    if (n === "coinbase" || n.includes("coinbase")) {
      const p = window.ethereum.providers.find((x) => x.isCoinbaseWallet);
      if (p) return p;
    }
  }
  return window.ethereum || null;
}

export default function App() {
  const [account, setAccount] = useState(null);
  const [signer, setSigner] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [balance, setBalance] = useState("0");
  const [roles, setRoles] = useState({
    isRegistrar: false,
    isDepartment: false,
    isVerifier: false,
    isBidder: false,
    isDebarred: false,
    isLoading: false,
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

  // Check roles and balances for connected account with retry, normalization, and stale result protection
  const roleRequestCounter = useRef(0);
  const checkAccountRoles = useCallback(async (userAddress, userSigner) => {
    if (!userAddress) return;

    let normAddress;
    try {
      normAddress = ethers.getAddress(userAddress);
    } catch {
      normAddress = userAddress;
    }

    const currentRequestId = ++roleRequestCounter.current;
    setRoles((prev) => ({ ...prev, isLoading: true }));

    const contract = readContract;
    const provider = contract.runner.provider;

    const REGISTRAR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("REGISTRAR_ROLE"));
    const DEPARTMENT_ROLE = ethers.keccak256(ethers.toUtf8Bytes("DEPARTMENT_ROLE"));
    const VERIFIER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("VERIFIER_ROLE"));
    const DEFAULT_ADMIN = ethers.ZeroHash;

    let lastError = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const [userBalance, isReg, isAdm, isDept, isVerif, bInfo, cBal] = await Promise.all([
          provider.getBalance(normAddress),
          contract.hasRole(REGISTRAR_ROLE, normAddress),
          contract.hasRole(DEFAULT_ADMIN, normAddress),
          contract.hasRole(DEPARTMENT_ROLE, normAddress),
          contract.hasRole(VERIFIER_ROLE, normAddress),
          contract.getBidderStatus(normAddress),
          contract.claimableBalance(normAddress).catch(() => 0n),
        ]);

        // Protect against stale results: if a newer request was dispatched, ignore this one
        if (roleRequestCounter.current !== currentRequestId) {
          return;
        }

        setBalance(ethers.formatEther(userBalance));
        setRoles({
          isRegistrar: Boolean(isReg || isAdm),
          isDepartment: Boolean(isDept),
          isVerifier: Boolean(isVerif),
          isBidder: Boolean(bInfo.registered),
          isDebarred: Boolean(bInfo.debarred),
          isLoading: false,
        });
        setClaimableBalance(cBal);
        return;
      } catch (err) {
        lastError = err;
        if (attempt < 3) {
          await new Promise((r) => setTimeout(r, 600));
        }
      }
    }

    // If all attempts failed and this is still the active request, keep "Checking role..."
    if (roleRequestCounter.current === currentRequestId) {
      console.warn("Role check error after retries:", lastError);
      setRoles((prev) => ({ ...prev, isLoading: true }));
    }
  }, []);

  // Connect Wallet (opens Multi-Wallet selection modal or connects directly)
  function handleOpenConnect() {
    setShowWalletModal(true);
  }

  async function connectWalletWithProvider(chosenProvider, walletName = "") {
    const rawProvider = chosenProvider || activeWalletProvider || window.ethereum;
    if (!rawProvider) {
      setNotification({
        active: false,
        title: "No Wallet Detected",
        error: "Please install or unlock BridgeKey, MetaMask, or a compatible Web3 browser extension."
      });
      return;
    }
    try {
      if (rawProvider.request) {
        await rawProvider.request({ method: "eth_requestAccounts" });
      }
      const browserProvider = new ethers.BrowserProvider(rawProvider);
      const s = await browserProvider.getSigner();
      const addr = await s.getAddress();
      const network = await browserProvider.getNetwork();

      setActiveWalletProvider(rawProvider);
      if (walletName) {
        setActiveWalletName(walletName);
        try { localStorage.setItem("opentender_wallet_name", walletName); } catch {}
      }
      try { localStorage.removeItem("opentender_disconnected"); } catch {}
      setAccount(addr);
      setSigner(s);
      setChainId(Number(network.chainId));

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
      setTimeout(() => {
        checkAccountRoles(addr, s);
      }, 2000);

      await loadContractData();
      setShowWalletModal(false);
    } catch (err) {
      setNotification({ active: false, title: "Connection Failed", error: parseContractError(err) });
    }
  }

  function disconnectWallet() {
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
    });
    try {
      localStorage.removeItem("opentender_wallet_name");
      localStorage.setItem("opentender_disconnected", "true");
    } catch {}
  }

  // Add / Switch Network
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
      if (switchError.code === 4902) {
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
      }
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

    if (!account && !isExplicitlyDisconnected && p.request) {
      p.request({ method: "eth_accounts" })
        .then((accounts) => {
          if (accounts && accounts.length > 0) {
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
      const handleChain = () => {
        window.location.reload();
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
  }, [activeWalletProvider, activeWalletName, checkAccountRoles]);

  useEffect(() => {
    loadContractData();
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
