import React, { useState, useEffect } from "react";

export default function WalletModal({ isOpen, onClose, onSelectWallet }) {
  const [detectedWallets, setDetectedWallets] = useState([]);

  useEffect(() => {
    if (!isOpen) return;

    const list = [];
    const seenNames = new Set();

    // 1. EIP-6963 Discovery: Modern standard for multi-wallet extensions
    function handleEip6963(event) {
      const { info, provider } = event.detail || {};
      if (info && provider) {
        const nameLower = (info.name || "").toLowerCase();
        if (!seenNames.has(nameLower)) {
          seenNames.add(nameLower);
          list.push({
            id: info.uuid || info.name,
            name: info.name,
            icon: info.icon,
            provider: provider,
            rdns: info.rdns,
            type: "eip6963"
          });
          setDetectedWallets([...list]);
        }
      }
    }

    window.addEventListener("eip6963:announceProvider", handleEip6963);
    window.dispatchEvent(new Event("eip6963:requestProvider"));

    // 2. Discover window.bridgekey specifically
    if (typeof window !== "undefined") {
      const bk = window.bridgekey || window.bridgeKey;
      if (bk && !seenNames.has("bridgekey")) {
        seenNames.add("bridgekey");
        list.push({
          id: "bridgekey-injected",
          name: "BridgeKey",
          provider: bk.ethereum || bk,
          type: "bridgekey",
          badge: "BridgeKey Extension"
        });
      }
    }

    // 3. Inspect multi-providers in window.ethereum.providers
    if (typeof window !== "undefined" && window.ethereum && Array.isArray(window.ethereum.providers)) {
      window.ethereum.providers.forEach((p, idx) => {
        let name = "Web3 Provider " + (idx + 1);
        let key = "provider-" + idx;
        if (p.isBridgeKey) {
          name = "BridgeKey";
          key = "bridgekey";
        } else if (p.isMetaMask && !p.isBridgeKey) {
          name = "MetaMask";
          key = "metamask";
        } else if (p.isCoinbaseWallet) {
          name = "Coinbase Wallet";
          key = "coinbase";
        } else if (p.isRabby) {
          name = "Rabby Wallet";
          key = "rabby";
        }

        if (!seenNames.has(name.toLowerCase())) {
          seenNames.add(name.toLowerCase());
          list.push({
            id: key,
            name: name,
            provider: p,
            type: "multi-provider"
          });
        }
      });
    }

    // 4. Default window.ethereum if not already populated
    if (typeof window !== "undefined" && window.ethereum && !Array.isArray(window.ethereum.providers)) {
      const isBk = window.ethereum.isBridgeKey;
      const isMm = window.ethereum.isMetaMask && !isBk;
      const defaultName = isBk ? "BridgeKey" : isMm ? "MetaMask" : "Browser Injected Wallet";
      if (!seenNames.has(defaultName.toLowerCase())) {
        seenNames.add(defaultName.toLowerCase());
        list.push({
          id: "default-ethereum",
          name: defaultName,
          provider: window.ethereum,
          type: "default"
        });
      }
    }

    setDetectedWallets([...list]);

    return () => {
      window.removeEventListener("eip6963:announceProvider", handleEip6963);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  // Ensure standard wallets (BridgeKey, MetaMask, Injected) are available as options
  const hasBridgeKey = detectedWallets.some((w) => w.name.toLowerCase().includes("bridgekey"));
  const hasMetaMask = detectedWallets.some((w) => w.name.toLowerCase().includes("metamask"));

  // Resolver for explicit wallet choice
  function handleChoose(wallet) {
    if (wallet && wallet.provider) {
      onSelectWallet(wallet.provider, wallet.name);
    } else if (wallet?.id === "bridgekey-fallback") {
      // Direct attempt via bridgekey globals or current ethereum provider
      const provider = window.bridgekey?.ethereum || window.bridgekey || window.ethereum;
      onSelectWallet(provider, "BridgeKey");
    } else if (wallet?.id === "metamask-fallback") {
      const provider = (window.ethereum?.providers || []).find((p) => p.isMetaMask) || window.ethereum;
      onSelectWallet(provider, "MetaMask");
    } else {
      onSelectWallet(window.ethereum, "Browser Wallet");
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-dialog wallet-modal-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3 className="wallet-modal-title">Connect a Wallet</h3>
            <span className="modal-subtitle">Choose your preferred Web3 wallet to interact with OpenTender.</span>
          </div>
          <button className="btn-close" onClick={onClose} aria-label="Close modal">×</button>
        </div>

        <div className="modal-body wallet-modal-body">
          {/* BridgeKey Option - Featured First */}
          <div
            className={`wallet-option-card ${hasBridgeKey ? "is-detected" : ""}`}
            onClick={() => {
              const bk = detectedWallets.find((w) => w.name.toLowerCase().includes("bridgekey"));
              handleChoose(bk || { id: "bridgekey-fallback", name: "BridgeKey" });
            }}
          >
            <div className="wallet-icon-box bridgekey-icon-box">
              <svg viewBox="0 0 40 40" width="34" height="34" fill="none">
                <rect width="40" height="40" rx="10" fill="#6366F1" />
                <path
                  d="M13 11H22C24.8 11 27 13 27 15.5C27 17.2 26 18.6 24.5 19.3C26.5 20 27.5 21.8 27.5 24C27.5 26.8 25 29 22 29H13V11Z"
                  fill="white"
                  fillOpacity="0.18"
                />
                <path d="M16 14H21.5C23 14 24.2 15 24.2 16.5C24.2 18 23 19 21.5 19H16V14Z" fill="white" />
                <path d="M16 21H22C23.6 21 24.8 22.1 24.8 23.6C24.8 25.1 23.6 26.2 22 26.2H16V21Z" fill="white" />
              </svg>
            </div>
            <div className="wallet-option-info">
              <div className="wallet-name-row">
                <span className="wallet-name">BridgeKey</span>
                <span className="wallet-tag-bridgekey">MST &amp; EVM</span>
                {hasBridgeKey && <span className="wallet-status-dot online" title="Detected in Browser" />}
              </div>
              <span className="wallet-desc">
                {hasBridgeKey ? "Detected & Ready to Connect" : "Connect via BridgeKey Extension"}
              </span>
            </div>
            <button className="wallet-connect-action-btn">Connect ↗</button>
          </div>

          {/* MetaMask Option */}
          <div
            className={`wallet-option-card ${hasMetaMask ? "is-detected" : ""}`}
            onClick={() => {
              const mm = detectedWallets.find((w) => w.name.toLowerCase().includes("metamask"));
              handleChoose(mm || { id: "metamask-fallback", name: "MetaMask" });
            }}
          >
            <div className="wallet-icon-box metamask-icon-box">
              <svg viewBox="0 0 32 32" width="32" height="32" fill="none">
                <path d="M29.5 3L18.5 11.2L20.5 6.5L29.5 3Z" fill="#E2761B" stroke="#E2761B" />
                <path d="M2.5 3L13.4 11.2L11.5 6.5L2.5 3Z" fill="#E4761B" stroke="#E4761B" />
                <path d="M25 22.5L22 27L28.5 28.5L30.5 22.5H25Z" fill="#E4761B" stroke="#E4761B" />
                <path d="M1.5 22.5L3.5 28.5L10 27L7 22.5H1.5Z" fill="#E4761B" stroke="#E4761B" />
                <path d="M9.8 14.5L7.5 18L13.8 18.3L13.5 11.5L9.8 14.5Z" fill="#E4761B" stroke="#E4761B" />
                <path d="M22.2 14.5L18.5 11.5L18.2 18.3L24.5 18L22.2 14.5Z" fill="#E4761B" stroke="#E4761B" />
                <path d="M10 27L13.5 25.2L10.5 22.5L10 27Z" fill="#D7C1B3" stroke="#D7C1B3" />
                <path d="M22 27L21.5 22.5L18.5 25.2L22 27Z" fill="#D7C1B3" stroke="#D7C1B3" />
                <path d="M18.5 25.2L21.5 22.5H10.5L13.5 25.2H18.5Z" fill="#233447" stroke="#233447" />
                <path d="M16 3L11.5 6.5L13.5 11.5L16 10L18.5 11.5L20.5 6.5L16 3Z" fill="#F6851B" stroke="#F6851B" />
              </svg>
            </div>
            <div className="wallet-option-info">
              <div className="wallet-name-row">
                <span className="wallet-name">MetaMask</span>
                {hasMetaMask && <span className="wallet-status-dot online" title="Detected in Browser" />}
              </div>
              <span className="wallet-desc">
                {hasMetaMask ? "Detected & Ready to Connect" : "Standard Web3 Browser Extension"}
              </span>
            </div>
            <button className="wallet-connect-action-btn">Connect ↗</button>
          </div>

          {/* Any other EIP-6963 detected wallets (Coinbase, Rabby, Phantom, etc.) */}
          {detectedWallets
            .filter(
              (w) =>
                !w.name.toLowerCase().includes("bridgekey") &&
                !w.name.toLowerCase().includes("metamask")
            )
            .map((w, idx) => (
              <div
                key={idx}
                className="wallet-option-card is-detected"
                onClick={() => handleChoose(w)}
              >
                <div className="wallet-icon-box generic-icon-box">
                  {w.icon ? (
                    <img src={w.icon} alt={w.name} width="32" height="32" />
                  ) : (
                    <span className="generic-wallet-symbol">⟠</span>
                  )}
                </div>
                <div className="wallet-option-info">
                  <div className="wallet-name-row">
                    <span className="wallet-name">{w.name}</span>
                    <span className="wallet-status-dot online" />
                  </div>
                  <span className="wallet-desc">Detected via EIP-6963 Provider</span>
                </div>
                <button className="wallet-connect-action-btn">Connect ↗</button>
              </div>
            ))}

          {/* Browser Injected Fallback Option */}
          <div
            className="wallet-option-card fallback-option"
            onClick={() => handleChoose({ id: "injected", name: "Injected Browser Wallet" })}
          >
            <div className="wallet-icon-box generic-icon-box">
              <span className="generic-wallet-symbol">◈</span>
            </div>
            <div className="wallet-option-info">
              <div className="wallet-name-row">
                <span className="wallet-name">Default Injected Provider</span>
              </div>
              <span className="wallet-desc">Connect directly to active browser wallet (window.ethereum)</span>
            </div>
            <button className="wallet-connect-action-btn">Connect ↗</button>
          </div>
        </div>

        <div className="modal-footer wallet-modal-footer">
          <span className="wallet-footer-help">
            Using MST Testnet? Ensure your wallet network is set to MST Testnet (Chain ID 31337 or custom RPC).
          </span>
          <button className="btn-details" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
