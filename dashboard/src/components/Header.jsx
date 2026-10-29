import React from "react";
import { CHAIN_NAME, CHAIN_ID, CURRENCY_SYMBOL } from "../config";

export default function Header({
  account,
  chainId,
  roles,
  balance,
  activeTab,
  onTabChange,
  onConnect,
  onSwitchNetwork,
  searchQuery,
  onSearchChange
}) {
  const isCorrectNetwork = chainId === CHAIN_ID;

  return (
    <header className="vita-header">
      {/* Brand Logo with star icon */}
      <div className="vita-brand" onClick={() => onTabChange("audit")}>
        <span className="brand-symbol">✻</span>
        <span className="brand-name">OpenTender</span>
      </div>

      {/* Global Search Pill */}
      <div className="vita-search-pill">
        <span className="search-icon">🔍</span>
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

        {/* Wallet Connect */}
        {account ? (
          <div className="vita-wallet-pill">
            <span className="wallet-amt">
              {parseFloat(balance || "0").toFixed(3)} {CURRENCY_SYMBOL}
            </span>
            <span className="wallet-addr">
              {account.slice(0, 6)}...{account.slice(-4)}
            </span>
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
