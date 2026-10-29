# OpenTender (MST Blockchain)

> **Sealed-Bid Public Procurement & Milestone-Escrow Smart Contract Suite**  
> *Developed for MST Blockchain BUILDATHON #2*

OpenTender is an institutional-grade decentralized e-procurement suite providing end-to-end fairness, sealed-bid privacy, conflict-of-interest prevention, and escrow-backed milestone payouts with automated late penalty calculations on the MST Blockchain.

---

## Key Features

- **Sealed-Bid Commit-Reveal**: Zero front-running or quote peeking. Bid amounts and random salts are concealed until the commit phase closes.
- **Sybil & Conflict Prevention**: Group ID matching prevents affiliated shell companies from submitting multiple coordinated bids.
- **Automated Late Penalty Math**: Verifiable daily penalties (capped at 10%/day) deducted automatically upon multi-verifier approval.
- **Fair Default Handling**: Insolvent contractors are defaulted and debarred; contractors who have submitted evidence on time are protected while awaiting reviews.
- **O(1) Solvency & Pull Payments**: Losers and penalty recipients withdraw via pull-payments, preventing denial-of-service (DoS) attack vectors.
- **Testnet-Ready Live Script**: `scripts/demo-live.js` runs a wall-clock countdown demo without requiring Hardhat time-travel hacks.

---

## Test & Audit Verification

- **Automated Test Suite**: 19 / 19 passing tests (`npx hardhat test`)
- **Code Coverage (`solidity-coverage`)**:
  - `OpenTender.sol`: 93.75% Statements, 58.28% Branches, 91.18% Functions, 88.06% Lines.
  - Overall Suite: 93.90% Statements, 58.84% Branches, 93.02% Functions, 88.57% Lines.

---

## Project Structure

```
opentender/
├── contracts/
│   ├── OpenTender.sol               # Core procurement & milestone escrow contract
│   └── mocks/
│       └── MaliciousBidder.sol      # Reentrancy & DoS attack mock for security testing
├── scripts/
│   ├── deploy.js                    # Contract deployment and role initialization
│   ├── seed.js                      # Mock tender population
│   ├── demo.js                      # Fast local demo with time-travel helpers
│   ├── demo-live.js                 # Live testnet demo (real wall-clock delays)
│   └── reset.js                     # Local environment & artifacts cleanup
├── test/
│   └── OpenTender.test.js           # Comprehensive 19-test security audit suite
├── docs/
│   ├── ARCHITECTURE.md              # Technical design, state machines, math models
│   ├── AUDIT.md                     # Vulnerability assessments & mitigation matrix
│   └── MST_TESTNET_GUIDE.md         # Step-by-step testnet deployment & demo guide
├── hardhat.config.js                # Hardhat configuration (Solidity 0.8.24 viaIR)
├── package.json                     # Scripts & project dependencies
├── .env.example                     # Environment template
└── README.md
```

---

## Quickstart

### 1. Install Dependencies
```bash
npm install
```

### 2. Compile Smart Contracts
```bash
npx hardhat compile
```

### 3. Run Test Suite
```bash
npx hardhat test
```

### 4. Run Coverage Report
```bash
npx hardhat coverage
```

### 5. Run Local Node & Demo
```bash
# Terminal 1: Start local node
npx hardhat node

# Terminal 2: Deploy and run demo
npm run deploy:local
npm run demo
```

### 6. Run Live MST Testnet Demo
Ensure `.env` has your `DEPLOYER_PRIVATE_KEY`:
```bash
npm run demo:live
```
