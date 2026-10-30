import React, { useState, useEffect, useRef } from "react";
import { CHAIN_NAME, CHAIN_ID, CURRENCY_SYMBOL } from "../config";

export default function Header({
  account,
  chainId,
  roles,
  balance,
  activeTab,
  onTabChange,
  onConnect,
  onDisconnect,
  onSwitchNetwork,
  isRpcOnline = true,
}) {
  const isWrongNetwork = Boolean(account && chainId && chainId !== CHAIN_ID);
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowAccountMenu(false);
      }
    }
    if (showAccountMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showAccountMenu]);

  // Plain words role label from existing role detection: Admin, Department, Verifier, Bidder, or "Visitor (no role)"
  const getRoleLabel = () => {
    if (!roles) return "Visitor (no role)";
    if (roles.isRegistrar) return "Admin";
    if (roles.isDepartment) return "Department";
    if (roles.isVerifier) return "Verifier";
    if (roles.isBidder && !roles.isDebarred) return "Bidder";
    return "Visitor (no role)";
  };

  const roleLabel = getRoleLabel();

  return (
    <>
      <header className="vita-header">
        {/* a) Logo text "OpenTender" */}
        <div
          className="vita-brand"
          onClick={() => onTabChange("home")}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") onTabChange("home");
          }}
          aria-label="OpenTender Home"
        >
          <span className="brand-name">OpenTender</span>
        </div>

        {/* b) Navigation items: "How it works", "Tenders", "Bid", "Department & Verifiers" */}
        <nav className="vita-nav" role="tablist" aria-label="Main Navigation">
          <a
            href="/landing.html"
            className="nav-link"
          >
            How it works
          </a>
          <button
            role="tab"
            aria-selected={activeTab === "audit"}
            className={`nav-link ${activeTab === "audit" ? "active" : ""}`}
            onClick={() => onTabChange("audit")}
          >
            Tenders
          </button>
          <button
            role="tab"
            aria-selected={activeTab === "bidder"}
            className={`nav-link ${activeTab === "bidder" ? "active" : ""}`}
            onClick={() => onTabChange("bidder")}
          >
            Bid
          </button>
          <button
            role="tab"
            aria-selected={activeTab === "officer"}
            className={`nav-link ${activeTab === "officer" ? "active" : ""}`}
            onClick={() => onTabChange("officer")}
          >
            Department &amp; Verifiers
          </button>
        </nav>

        {/* c) On the right: small network chip and wallet button */}
        <div className="vita-actions">
          {/* Network chip: VITE_CHAIN_NAME with green dot (RPC online) or red dot (RPC offline). No warning if no wallet */}
          <div
            className="vita-network-chip"
            title={isRpcOnline ? `${CHAIN_NAME} (RPC Online)` : `${CHAIN_NAME} (RPC Offline)`}
          >
            <span className={`network-dot ${isRpcOnline ? "online" : "offline"}`} />
            <span className="network-name">{CHAIN_NAME}</span>
          </div>

          {/* Wallet button */}
          {account ? (
            <div className="vita-wallet-wrapper" ref={menuRef}>
              <div className="vita-wallet-pill-group">
                <span className="wallet-role-badge">{roleLabel}</span>
                <span className="wallet-balance-amt font-mono">
                  {parseFloat(balance || "0").toFixed(4)} {CURRENCY_SYMBOL}
                </span>
                <button
                  type="button"
                  className={`wallet-address-btn ${showAccountMenu ? "active" : ""}`}
                  onClick={() => setShowAccountMenu((prev) => !prev)}
                  aria-expanded={showAccountMenu}
                  aria-haspopup="true"
                  title="Click to open disconnect menu"
                >
                  <span className="font-mono">{account.slice(0, 6)}...{account.slice(-4)}</span>
                  <span className="dropdown-caret">{showAccountMenu ? "▴" : "▾"}</span>
                </button>
              </div>

              {/* Disconnect inside a small dropdown opened by clicking the address */}
              {showAccountMenu && (
                <div className="account-dropdown-menu">
                  <div className="account-dropdown-info">
                    <span className="dropdown-addr-label">Address:</span>
                    <span className="dropdown-addr-val font-mono">
                      {account.slice(0, 6)}...{account.slice(-4)}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="dropdown-disconnect-btn"
                    onClick={() => {
                      setShowAccountMenu(false);
                      onDisconnect();
                    }}
                  >
                    Disconnect
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button type="button" className="vita-btn-connect" onClick={onConnect}>
              Connect wallet
            </button>
          )}
        </div>
      </header>

      {/* Full-width banner under the header when wallet connected & wrong chain ID */}
      {isWrongNetwork && (
        <div className="wrong-network-banner" role="alert">
          <div className="wrong-network-banner-content">
            <span className="wrong-network-msg">
              Your wallet is on the wrong network. Please switch to {CHAIN_NAME}.
            </span>
            <button
              type="button"
              className="btn-switch-network"
              onClick={onSwitchNetwork}
            >
              Switch network
            </button>
          </div>
        </div>
      )}
    </>
  );
}
