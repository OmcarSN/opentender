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
  searchQuery,
  onSearchChange,
  activeWalletName
}) {
  const isCorrectNetwork = chainId === CHAIN_ID;
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [copied, setCopied] = useState(false);
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

  return (
    <header className="vita-header">
      {/* Brand Logo with star icon */}
      <div className="vita-brand" onClick={() => onTabChange("audit")}>
        <span className="brand-symbol">✻</span>
        <span className="brand-name">OpenTender</span>
      </div>

      {/* Global Search Pill */}
      <div className="vita-search-pill">
        <svg className="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <input
          type="text"
          placeholder="Search tenders, departments, categories..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>

      {/* Navigation Links */}
      <nav className="vita-nav">
        <button
          className={`nav-link ${activeTab === "audit" ? "active" : ""}`}
          onClick={() => onTabChange("audit")}
        >
          Public Audit
        </button>
        <button
          className={`nav-link ${activeTab === "bidder" ? "active" : ""}`}
          onClick={() => onTabChange("bidder")}
        >
          Bidder Portal
        </button>
        <button
          className={`nav-link ${activeTab === "officer" ? "active" : ""}`}
          onClick={() => onTabChange("officer")}
        >
          Officer &amp; Verifiers
        </button>
      </nav>

      {/* Right Actions: Network & Wallet */}
      <div className="vita-actions">
        {/* Network indicator */}
        <div className="vita-network-badge">
          <span className={`network-dot ${isCorrectNetwork ? "online" : "warning"}`} />
          <span className="network-name">{isCorrectNetwork ? CHAIN_NAME : "Switch Network"}</span>
          {!isCorrectNetwork && (
            <button className="btn-switch-mini" onClick={onSwitchNetwork}>
              Switch
            </button>
          )}
        </div>

        {/* Roles Badges */}
        {account && (
          <div className="vita-role-badges">
            {roles.isRegistrar && <span className="vita-pill pill-purple">Registrar</span>}
            {roles.isDepartment && <span className="vita-pill pill-blue">Department</span>}
            {roles.isVerifier && <span className="vita-pill pill-cyan">Verifier</span>}
            {roles.isBidder && !roles.isDebarred && (
              <span className="vita-pill pill-emerald">Registered Bidder</span>
            )}
            {roles.isDebarred && <span className="vita-pill pill-red">Debarred</span>}
            {!roles.isRegistrar && !roles.isDepartment && !roles.isVerifier && !roles.isBidder && (
              <span className="vita-pill pill-gray">Public Wallet</span>
            )}
          </div>
        )}

        {/* Wallet Connect / Connected Group */}
        {account ? (
          <div className="vita-wallet-connected-group">
            <div className="vita-wallet-wrapper" ref={menuRef}>
              <button
                className={`vita-wallet-pill ${showAccountMenu ? "active" : ""}`}
                onClick={() => setShowAccountMenu(!showAccountMenu)}
                title="Click for account details & copy address"
                aria-label="Account details"
              >
                <span className="wallet-dot-connected" />
                <span className="wallet-amt">
                  {parseFloat(balance || "0").toFixed(3)} {CURRENCY_SYMBOL}
                </span>
                <span className="wallet-addr font-mono">
                  {account.slice(0, 6)}...{account.slice(-4)}
                </span>
                <span className="wallet-dropdown-caret">{showAccountMenu ? "▴" : "▾"}</span>
              </button>

              {/* Account Details & Disconnect Menu */}
              {showAccountMenu && (
                <div className="account-dropdown-menu">
                  <div className="dropdown-account-header">
                    <div className="dropdown-wallet-title">
                      <span className="dropdown-indicator online" />
                      <span className="dropdown-wallet-name">{activeWalletName || "Connected Wallet"}</span>
                    </div>
                    <span className="dropdown-network-name">{isCorrectNetwork ? CHAIN_NAME : "Wrong Network"}</span>
                  </div>

                  <div className="dropdown-address-box">
                    <span className="dropdown-address-text font-mono">
                      {account.slice(0, 10)}...{account.slice(-8)}
                    </span>
                    <button
                      className="dropdown-copy-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (navigator.clipboard) {
                          navigator.clipboard.writeText(account);
                          setCopied(true);
                          setTimeout(() => setCopied(false), 2000);
                        }
                      }}
                    >
                      {copied ? "✓ Copied" : "Copy"}
                    </button>
                  </div>

                  <div className="dropdown-balance-row">
                    <span className="dropdown-label">Balance</span>
                    <span className="dropdown-val font-mono">
                      {parseFloat(balance || "0").toFixed(4)} {CURRENCY_SYMBOL}
                    </span>
                  </div>

                  <div className="dropdown-divider" />

                  <button
                    className="dropdown-disconnect-btn"
                    onClick={() => {
                      setShowAccountMenu(false);
                      if (onDisconnect) onDisconnect();
                    }}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
                      <line x1="12" y1="2" x2="12" y2="12" />
                    </svg>
                    <span>Disconnect Wallet</span>
                  </button>
                </div>
              )}
            </div>

            {/* Always Visible Direct Disconnect Button */}
            <button
              className="vita-btn-disconnect-direct"
              onClick={onDisconnect}
              title="Disconnect Wallet"
              aria-label="Disconnect Wallet"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
                <line x1="12" y1="2" x2="12" y2="12" />
              </svg>
              <span>Disconnect</span>
            </button>
          </div>
        ) : (
          <button className="vita-btn-connect" onClick={onConnect}>
            Connect Wallet
          </button>
        )}
      </div>
    </header>
  );
}
