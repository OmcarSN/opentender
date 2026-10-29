import React, { useState, useEffect } from "react";

export default function WalletModal({ isOpen, onClose, onSelectWallet }) {
  const [detectedMap, setDetectedMap] = useState({});
  const [connectingId, setConnectingId] = useState(null);

  useEffect(() => {
    if (!isOpen) {
      setConnectingId(null);
      return;
    }

    const providers = {};

    // 1. EIP-6963 Standard Multi-Wallet Announcement
    function onAnnounce(event) {
      const { info, provider } = event.detail || {};
      if (info && provider) {
        const key = (info.name || "").toLowerCase();
        providers[key] = {
          name: info.name,
          icon: info.icon,
          provider: provider,
          rdns: info.rdns
        };
        setDetectedMap({ ...providers });
      }
    }

    window.addEventListener("eip6963:announceProvider", onAnnounce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));

    // 2. Direct Window Injections (BridgeKey, MetaMask, Multi-providers)
    if (typeof window !== "undefined") {
      // BridgeKey specific detection
      if (window.bridgekey || window.bridgeKey) {
        providers["bridgekey"] = {
          name: "BridgeKey",
          provider: window.bridgekey?.ethereum || window.bridgekey || window.bridgeKey
        };
      }

      // Check window.ethereum.providers array
      if (window.ethereum && Array.isArray(window.ethereum.providers)) {
        window.ethereum.providers.forEach((p) => {
          if (p.isBridgeKey) {
            providers["bridgekey"] = { name: "BridgeKey", provider: p };
          }
          if (p.isMetaMask && !p.isBridgeKey) {
            providers["metamask"] = { name: "MetaMask", provider: p };
          }
          if (p.isCoinbaseWallet) {
            providers["coinbase"] = { name: "Coinbase Wallet", provider: p };
          }
        });
      }

      // Default window.ethereum
      if (window.ethereum && !Array.isArray(window.ethereum.providers)) {
        if (window.ethereum.isBridgeKey) {
          providers["bridgekey"] = { name: "BridgeKey", provider: window.ethereum };
        } else if (window.ethereum.isMetaMask) {
          providers["metamask"] = { name: "MetaMask", provider: window.ethereum };
        }
      }
    }

    setDetectedMap({ ...providers });

    return () => {
      window.removeEventListener("eip6963:announceProvider", onAnnounce);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  async function handleSelect(id, name, fallbackProviderResolver) {
    setConnectingId(id);
    let chosenProvider = detectedMap[id]?.provider;
    if (!chosenProvider && fallbackProviderResolver) {
      chosenProvider = fallbackProviderResolver();
    }
    if (!chosenProvider && typeof window !== "undefined") {
      chosenProvider = window.ethereum;
    }
    try {
      await onSelectWallet(chosenProvider, name);
    } finally {
      setConnectingId(null);
    }
  }

  const isBridgeKeyDetected = Boolean(
    detectedMap["bridgekey"] ||
    (typeof window !== "undefined" && (window.bridgekey || window.bridgeKey || window.ethereum?.isBridgeKey))
  );

  const isMetaMaskDetected = Boolean(
    detectedMap["metamask"] ||
    (typeof window !== "undefined" && window.ethereum?.isMetaMask && !window.ethereum?.isBridgeKey)
  );

  const isCoinbaseDetected = Boolean(
    detectedMap["coinbase"] ||
    (typeof window !== "undefined" && window.ethereum?.isCoinbaseWallet)
  );

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-dialog web3-connect-modal" onClick={(e) => e.stopPropagation()}>
        <div className="web3-modal-header">
          <div>
            <h3 className="web3-modal-title">Connect Wallet</h3>
            <p className="web3-modal-subtitle">Choose a wallet to connect to OpenTender</p>
          </div>
          <button className="web3-modal-close" onClick={onClose} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div className="web3-wallet-list">
          {/* BridgeKey - Featured Wallet */}
          <button
            className={`web3-wallet-row ${connectingId === "bridgekey" ? "is-connecting" : ""}`}
            onClick={() =>
              handleSelect("bridgekey", "BridgeKey", () => {
                return (
                  window.bridgekey?.ethereum ||
                  window.bridgekey ||
                  (window.ethereum?.providers || []).find((p) => p.isBridgeKey) ||
                  window.ethereum
                );
              })
            }
          >
            <div className="web3-wallet-icon-wrap bridgekey-brand">
              <svg viewBox="0 0 40 40" width="28" height="28" fill="none">
                <rect width="40" height="40" rx="9" fill="#5850EC" />
                <path
                  d="M13 11H22C24.8 11 27 13 27 15.5C27 17.2 26 18.6 24.5 19.3C26.5 20 27.5 21.8 27.5 24C27.5 26.8 25 29 22 29H13V11Z"
                  fill="white"
                  fillOpacity="0.18"
                />
                <path d="M16 14H21.5C23 14 24.2 15 24.2 16.5C24.2 18 23 19 21.5 19H16V14Z" fill="white" />
                <path d="M16 21H22C23.6 21 24.8 22.1 24.8 23.6C24.8 25.1 23.6 26.2 22 26.2H16V21Z" fill="white" />
              </svg>
            </div>
            <div className="web3-wallet-details">
              <div className="web3-wallet-name-line">
                <span className="web3-wallet-name">BridgeKey</span>
                <span className="web3-chain-tag">MST &amp; EVM</span>
              </div>
              <span className="web3-wallet-status-text">
                {isBridgeKeyDetected ? "Detected in Browser" : "BridgeKey Wallet"}
              </span>
            </div>
            <div className="web3-wallet-end">
              {connectingId === "bridgekey" ? (
                <span className="web3-spinner" />
              ) : isBridgeKeyDetected ? (
                <span className="web3-detected-pill">Installed</span>
              ) : (
                <span className="web3-chevron">›</span>
              )}
            </div>
          </button>

          {/* MetaMask */}
          <button
            className={`web3-wallet-row ${connectingId === "metamask" ? "is-connecting" : ""}`}
            onClick={() =>
              handleSelect("metamask", "MetaMask", () => {
                return (
                  (window.ethereum?.providers || []).find((p) => p.isMetaMask && !p.isBridgeKey) ||
                  window.ethereum
                );
              })
            }
          >
            <div className="web3-wallet-icon-wrap metamask-brand">
              <svg viewBox="0 0 32 32" width="28" height="28" fill="none">
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
            <div className="web3-wallet-details">
              <span className="web3-wallet-name">MetaMask</span>
              <span className="web3-wallet-status-text">
                {isMetaMaskDetected ? "Detected in Browser" : "Browser Extension"}
              </span>
            </div>
            <div className="web3-wallet-end">
              {connectingId === "metamask" ? (
                <span className="web3-spinner" />
              ) : isMetaMaskDetected ? (
                <span className="web3-detected-pill">Installed</span>
              ) : (
                <span className="web3-chevron">›</span>
              )}
            </div>
          </button>

          {/* Coinbase Wallet */}
          <button
            className={`web3-wallet-row ${connectingId === "coinbase" ? "is-connecting" : ""}`}
            onClick={() =>
              handleSelect("coinbase", "Coinbase Wallet", () => {
                return (
                  (window.ethereum?.providers || []).find((p) => p.isCoinbaseWallet) ||
                  window.ethereum
                );
              })
            }
          >
            <div className="web3-wallet-icon-wrap coinbase-brand">
              <svg viewBox="0 0 32 32" width="28" height="28" fill="none">
                <rect width="32" height="32" rx="7" fill="#0052FF" />
                <path d="M16 6C10.4772 6 6 10.4772 6 16C6 21.5228 10.4772 26 16 26C21.5228 26 26 21.5228 26 16C26 10.4772 21.5228 6 16 6ZM13.5 13.5H18.5V18.5H13.5V13.5Z" fill="white" />
              </svg>
            </div>
            <div className="web3-wallet-details">
              <span className="web3-wallet-name">Coinbase Wallet</span>
              <span className="web3-wallet-status-text">
                {isCoinbaseDetected ? "Detected in Browser" : "Coinbase Extension"}
              </span>
            </div>
            <div className="web3-wallet-end">
              {connectingId === "coinbase" ? (
                <span className="web3-spinner" />
              ) : isCoinbaseDetected ? (
                <span className="web3-detected-pill">Installed</span>
              ) : (
                <span className="web3-chevron">›</span>
              )}
            </div>
          </button>

          {/* Default Browser Wallet */}
          <button
            className={`web3-wallet-row ${connectingId === "injected" ? "is-connecting" : ""}`}
            onClick={() => handleSelect("injected", "Browser Wallet", () => window.ethereum)}
          >
            <div className="web3-wallet-icon-wrap default-brand">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="5" width="20" height="14" rx="2"></rect>
                <line x1="2" y1="10" x2="22" y2="10"></line>
              </svg>
            </div>
            <div className="web3-wallet-details">
              <span className="web3-wallet-name">Browser Injected</span>
              <span className="web3-wallet-status-text">Default window.ethereum provider</span>
            </div>
            <div className="web3-wallet-end">
              {connectingId === "injected" ? (
                <span className="web3-spinner" />
              ) : (
                <span className="web3-chevron">›</span>
              )}
            </div>
          </button>
        </div>

        <div className="web3-modal-footer">
          <span>By connecting, you agree to OpenTender's sealed-bid procurement protocol rules.</span>
        </div>
      </div>
    </div>
  );
}
