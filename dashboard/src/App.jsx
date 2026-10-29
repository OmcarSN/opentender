import React, { useState, useEffect, useCallback } from "react";
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
import PublicAuditTab from "./components/PublicAuditTab";
import BidderTab from "./components/BidderTab";
import OfficerTab from "./components/OfficerTab";
import TxNotification from "./components/TxNotification";
import { parseContractError } from "./utils/errors";

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
  });

  const [searchQuery, setSearchQuery] = useState("");

  const [activeTab, setActiveTab] = useState(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get("tab");
      if (tabParam === "bidder" || tabParam === "officer" || tabParam === "audit") {
        return tabParam;
      }
      const hash = window.location.hash.replace("#", "");
      if (hash === "bidder" || hash === "officer" || hash === "audit") {
        return hash;
      }
    } catch {
      // Fallback
    }
    return "audit";
  });

  function handleTabChange(tab) {
    setActiveTab(tab);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", tab);
      window.history.replaceState({}, "", url);
    } catch {
      // Fallback
    }
  }

  function handleSwitchToBidder(tenderId) {
    if (tenderId) setSelectedTenderId(Number(tenderId));
    handleTabChange("bidder");
  }
  const [tenders, setTenders] = useState([]);
  const [selectedTenderId, setSelectedTenderId] = useState(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const t = params.get("tender");
      if (t) return parseInt(t, 10);
    } catch {}
    return 1;
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

  const [notification, setNotification] = useState({
    active: false,
    title: "",
    hash: "",
    error: "",
    success: "",
  });

  // Load tenders, stats, and events from contract
  const loadContractData = useCallback(async () => {
    try {
      const readContract = getReadOnlyContract();

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

      // Fetch all tenders
      const count = Number(await readContract.tenderCount().catch(() => 0n));
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
            status: Number(t.status),
            winningBidder: t.winningBidder,
            winningAmount: t.winningAmount,
            approvalThreshold: Number(t.approvalThreshold),
            totalCommits: Number(t.totalCommits),
          });
        } catch (e) {
          console.warn(`Error loading tender #${i}:`, e);
        }
      }
      setTenders(loadedTenders);

      // Selected tender data
      const targetId = selectedTenderId || (loadedTenders.length > 0 ? loadedTenders[0].id : 1);
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

        // Query committed bidders via event
        try {
          const commitFilter = readContract.filters.BidCommitted(targetId);
          const commitEvents = await readContract.queryFilter(commitFilter);
          const bList = commitEvents.map((e) => ({
            bidder: e.args.bidder || e.args[1],
            commitHash: e.args.commitHash || e.args[2],
            commitTime: e.args.commitTime || e.args[3],
          }));
          setCommittedBidders(bList);
        } catch {
          setCommittedBidders([]);
        }

        // Try reading revealed bids if phase ended
        try {
          const rev = await readContract.getRevealedBids(targetId);
          setRevealedBids(rev);
        } catch {
          setRevealedBids([]);
        }
      }

      // Load recent past events
      try {
        const latestBlock = await readContract.runner.provider.getBlockNumber();
        const fromBlock = Math.max(0, latestBlock - 500);
        const filter = {
          address: CONTRACT_ADDRESS,
          fromBlock,
          toBlock: "latest",
        };
        const rawLogs = await readContract.runner.provider.getLogs(filter);
        const iface = readContract.interface;
        const parsedLogs = [];

        for (let i = rawLogs.length - 1; i >= 0 && parsedLogs.length < 15; i--) {
          try {
            const parsed = iface.parseLog(rawLogs[i]);
            if (parsed) {
              parsedLogs.push({
                name: parsed.name,
                description: `${parsed.name} on tender #${parsed.args?.tenderId?.toString() || ""}`,
                txHash: rawLogs[i].transactionHash,
                time: "Confirmed",
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
    }
  }, [selectedTenderId]);

  // Check roles and balances for connected account
  const checkAccountRoles = useCallback(async (userAddress, userSigner) => {
    if (!userAddress) return;
    try {
      const contract = getReadOnlyContract();
      const provider = contract.runner.provider;

      const userBalance = await provider.getBalance(userAddress);
      setBalance(ethers.formatEther(userBalance));

      const REGISTRAR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("REGISTRAR_ROLE"));
      const DEPARTMENT_ROLE = ethers.keccak256(ethers.toUtf8Bytes("DEPARTMENT_ROLE"));
      const VERIFIER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("VERIFIER_ROLE"));
      const DEFAULT_ADMIN = ethers.ZeroHash;

      const [isReg, isAdm, isDept, isVerif, bInfo, cBal] = await Promise.all([
        contract.hasRole(REGISTRAR_ROLE, userAddress).catch(() => false),
        contract.hasRole(DEFAULT_ADMIN, userAddress).catch(() => false),
        contract.hasRole(DEPARTMENT_ROLE, userAddress).catch(() => false),
        contract.hasRole(VERIFIER_ROLE, userAddress).catch(() => false),
        contract.getBidderStatus(userAddress).catch(() => ({ registered: false, debarred: false })),
        contract.claimableBalance(userAddress).catch(() => 0n),
      ]);

      setRoles({
        isRegistrar: isReg || isAdm,
        isDepartment: isDept,
        isVerifier: isVerif,
        isBidder: bInfo.registered,
        isDebarred: bInfo.debarred,
      });

      setClaimableBalance(cBal);
    } catch (err) {
      console.warn("Role check error:", err);
    }
  }, []);

  // Connect MetaMask
  async function connectWallet() {
    if (!window.ethereum) {
      alert("MetaMask is not installed. Please install MetaMask to interact with OpenTender.");
      return;
    }
    try {
      const browserProvider = new ethers.BrowserProvider(window.ethereum);
      const s = await browserProvider.getSigner();
      const addr = await s.getAddress();
      const network = await browserProvider.getNetwork();

      setAccount(addr);
      setSigner(s);
      setChainId(Number(network.chainId));

      if (Number(network.chainId) === 31337) {
        try {
          await browserProvider.send("hardhat_setBalance", [
            addr,
            "0x3635C9ADC5DEA00000", // 1,000 ETH
          ]);
        } catch {
          // Ignore if provider doesn't support
        }
      }

      await checkAccountRoles(addr, s);
      await loadContractData();
    } catch (err) {
      setNotification({ active: false, title: "Connection Failed", error: parseContractError(err) });
    }
  }

  // Add / Switch Network
  async function switchNetwork() {
    if (!window.ethereum) return;
    const hexChainId = "0x" + CHAIN_ID.toString(16);
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: hexChainId }],
      });
    } catch (switchError) {
      if (switchError.code === 4902) {
        await window.ethereum.request({
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

  // Handle account and network changes in MetaMask
  useEffect(() => {
    if (window.ethereum) {
      window.ethereum.on("accountsChanged", (accounts) => {
        if (accounts.length > 0) {
          connectWallet();
        } else {
          setAccount(null);
          setSigner(null);
        }
      });
      window.ethereum.on("chainChanged", () => {
        window.location.reload();
      });
    }
    loadContractData();
    const interval = setInterval(loadContractData, 8000);
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
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onConnect={connectWallet}
          onSwitchNetwork={switchNetwork}
        />

        {/* Main Tab Panels */}
        <main className="main-content">
          {activeTab === "audit" && (
            <PublicAuditTab
              contract={getReadOnlyContract()}
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
              searchQuery={searchQuery}
              latestBlockTimestamp={latestBlockTimestamp}
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
          />
        )}
      </main>

        {/* Notification Toast */}
        <TxNotification
          notification={notification}
          onDismiss={() => setNotification({ active: false, title: "", hash: "", error: "", success: "" })}
        />
      </div>
    </div>
  );
}
