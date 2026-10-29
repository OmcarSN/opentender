import React, { useState, useEffect } from "react";

// Official vector logos for supported Web3 wallets
function WalletLogo({ walletId, detectedIcon, name }) {
  const [imgError, setImgError] = useState(false);

  if (detectedIcon && !imgError) {
    return (
      <img
        src={detectedIcon}
        alt={name || walletId}
        className="web3-wallet-logo-img"
        onError={() => setImgError(true)}
      />
    );
  }

  if (walletId === "bridgekey") {
    return (
      <svg viewBox="0 0 40 40" width="40" height="40" fill="none" className="web3-wallet-svg">
        <defs>
          <linearGradient id="bkGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#8B5CF6" />
            <stop offset="100%" stopColor="#6D28D9" />
          </linearGradient>
        </defs>
        <rect width="40" height="40" rx="10" fill="url(#bkGradient)" />
        {/* BridgeKey Authentic 'B' Symbol */}
        <g transform="translate(10, 8)" fill="white">
          {/* Left vertical column: rounded upper segment + lower keyhole dot */}
          <rect x="0" y="2" width="4.5" height="10" rx="2.25" />
          <circle cx="2.25" cy="19.5" r="2.25" />
          {/* Right curved lobes of the 'B' */}
          <path d="M5.5 2H13.2C16.4 2 18.5 3.8 18.5 6.5C18.5 8.8 17 10.4 14.8 11C17.5 11.6 19.5 13.4 19.5 16.2C19.5 19.5 16.8 22 13 22H5.5V2Z" />
          {/* Inner counter cuts with purple background matching the gradient */}
          <path d="M9.5 5.2H12.5C14 5.2 14.8 6 14.8 7C14.8 8 14 8.8 12.5 8.8H9.5V5.2Z" fill="#7C3AED" />
          <path d="M9.5 14.2H13C14.8 14.2 15.8 15.2 15.8 16.5C15.8 17.8 14.8 18.8 13 18.8H9.5V14.2Z" fill="#7C3AED" />
        </g>
      </svg>
    );
  }

  if (walletId === "metamask") {
    return (
      <svg viewBox="0 0 318.6 318.6" width="34" height="34" className="web3-wallet-svg">
        <path fill="#E2761B" stroke="#E2761B" strokeLinecap="round" strokeLinejoin="round" d="m274.1 35.5-99.5 73.9L194 65.4z" />
        <path fill="#E4761B" stroke="#E4761B" strokeLinecap="round" strokeLinejoin="round" d="m44.4 35.5 98.7 74.6-17.5-64.7z" />
        <path fill="#E4761B" stroke="#E4761B" strokeLinecap="round" strokeLinejoin="round" d="m238.3 206.8-28.5 42.2 56.8 15.6 16.3-56.7z" />
        <path fill="#E4761B" stroke="#E4761B" strokeLinecap="round" strokeLinejoin="round" d="m35.1 207.9 16.2 56.7 56.8-15.6-28.5-42.2z" />
        <path fill="#E4761B" stroke="#E4761B" strokeLinecap="round" strokeLinejoin="round" d="m103.5 138.7-18.4 27.6 65.3 2.9-2.2-70.2z" />
        <path fill="#E4761B" stroke="#E4761B" strokeLinecap="round" strokeLinejoin="round" d="m215 138.7-45.5-39.8-1.5 70.3 65.4-2.9z" />
        <path fill="#F6851B" stroke="#F6851B" strokeLinecap="round" strokeLinejoin="round" d="m108 250.2 39.8-19.3-33.8-26.4z" />
        <path fill="#F6851B" stroke="#F6851B" strokeLinecap="round" strokeLinejoin="round" d="m170.6 230.9 39.9 19.3-5.9-45.7z" />
        <path fill="#C0AD9E" stroke="#C0AD9E" strokeLinecap="round" strokeLinejoin="round" d="m209.8 250.2-39.9-19.3 5.3 28.3.6 13.9z" />
        <path fill="#161616" stroke="#161616" strokeLinecap="round" strokeLinejoin="round" d="m175.8 259.2-5.2-28.3h-22.7l-5.2 28.3-27.1 27.3h87.3z" />
        <path fill="#763D16" stroke="#763D16" strokeLinecap="round" strokeLinejoin="round" d="m159.2 195.9 8.9-8.7-27.3.3z" />
        <path fill="#F6851B" stroke="#F6851B" strokeLinecap="round" strokeLinejoin="round" d="m147.8 187.5 22.8-21.4 7.7 20.3-19 1z" />
        <path fill="#F6851B" stroke="#F6851B" strokeLinecap="round" strokeLinejoin="round" d="m141.7 186.4 19-1-7.7-20.3-22.8 21.4z" />
        <path fill="#E4761B" stroke="#E4761B" strokeLinecap="round" strokeLinejoin="round" d="m119.9 119.5 28 66.9-4.4-47.7z" />
        <path fill="#E4761B" stroke="#E4761B" strokeLinecap="round" strokeLinejoin="round" d="m170.6 119.5-23.6 19.2-4.4 47.7z" />
        <path fill="#F6851B" stroke="#F6851B" strokeLinecap="round" strokeLinejoin="round" d="m159.3 35.5-16.1 44.5 16.1 39.5 16.1-39.5z" />
        <path fill="#D7C1B3" stroke="#D7C1B3" strokeLinecap="round" strokeLinejoin="round" d="m238.3 206.8-28.5 42.2 44.6-26.6z" />
        <path fill="#D7C1B3" stroke="#D7C1B3" strokeLinecap="round" strokeLinejoin="round" d="m80.3 249-28.5-42.2-16.1 15.6z" />
        <path fill="#233447" stroke="#233447" strokeLinecap="round" strokeLinejoin="round" d="m209.8 249-34 10.2 3.5 13.9 30.5-24.1z" />
        <path fill="#233447" stroke="#233447" strokeLinecap="round" strokeLinejoin="round" d="m108 249-34 10.2 3.5 13.9 30.5-24.1z" />
      </svg>
    );
  }

  if (walletId === "coinbase") {
    return (
      <svg viewBox="0 0 40 40" width="40" height="40" fill="none" className="web3-wallet-svg">
        <rect width="40" height="40" rx="10" fill="#0052FF" />
        <rect x="9" y="9" width="22" height="22" rx="6" fill="white" />
        <circle cx="20" cy="20" r="5" fill="#0052FF" />
      </svg>
    );
  }

  // Default Injected / Web3 Universal Ethereum Diamond
  return (
    <svg viewBox="0 0 40 40" width="40" height="40" fill="none" className="web3-wallet-svg">
      <rect width="40" height="40" rx="10" fill="#141E28" stroke="rgba(45, 212, 191, 0.2)" />
      <g transform="translate(10, 6) scale(0.625)">
        <polygon points="16 0 16 23.5 32 16.3" fill="#8A92B2" />
        <polygon points="16 0 0 16.3 16 23.5" fill="#62688F" />
        <polygon points="16 25.5 16 39.9 32 18.2" fill="#8A92B2" />
        <polygon points="16 39.9 16 25.5 0 18.2" fill="#62688F" />
        <polygon points="16 23.5 32 16.3 16 11.5" fill="#454A75" />
        <polygon points="0 16.3 16 23.5 16 11.5" fill="#454A75" />
      </g>
    </svg>
  );
}

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
        const rawName = (info.name || "").toLowerCase().replace(/\s+/g, "");
        const entry = {
          name: info.name,
          icon: info.icon,
          provider: provider,
          rdns: info.rdns,
        };
        providers[rawName] = entry;

        if (rawName.includes("bridgekey") || (info.rdns && info.rdns.includes("bridgekey"))) {
          providers["bridgekey"] = entry;
        }
        if (rawName.includes("metamask") || (info.rdns && info.rdns.includes("metamask"))) {
          providers["metamask"] = entry;
        }
        if (rawName.includes("coinbase") || (info.rdns && info.rdns.includes("coinbase"))) {
          providers["coinbase"] = entry;
        }
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
          icon: window.bridgekey?.icon || window.bridgeKey?.icon,
          provider: window.bridgekey?.ethereum || window.bridgekey || window.bridgeKey,
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
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
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
              <WalletLogo
                walletId="bridgekey"
                detectedIcon={detectedMap["bridgekey"]?.icon}
                name="BridgeKey"
              />
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
              <WalletLogo
                walletId="metamask"
                detectedIcon={detectedMap["metamask"]?.icon}
                name="MetaMask"
              />
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
              <WalletLogo
                walletId="coinbase"
                detectedIcon={detectedMap["coinbase"]?.icon}
                name="Coinbase Wallet"
              />
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
              <WalletLogo
                walletId="injected"
                detectedIcon={detectedMap["injected"]?.icon}
                name="Browser Injected"
              />
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
