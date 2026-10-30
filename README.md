# OpenTender

OpenTender: sealed-bid public tenders with automatic award and verified milestone payments, on MST Blockchain.

---

## 2. Live Demo & Deployed Contract

- **Live Demo Link**: [https://opentender-lior.vercel.app](https://opentender-lior.vercel.app)
- **Deployed Contract Address**: [`0x493Bb88ad309346aA84E237aC84c8612eD1852d8`](https://testnet.mstscan.com/address/0x493Bb88ad309346aA84E237aC84c8612eD1852d8)
- **Explorer Link**: [https://testnet.mstscan.com/address/0x493Bb88ad309346aA84E237aC84c8612eD1852d8](https://testnet.mstscan.com/address/0x493Bb88ad309346aA84E237aC84c8612eD1852d8)
- **Network Name**: MST Testnet
- **Chain ID**: 91562037

---

## 3. The Problem & The Solution

### The Problem
- **Insiders can peek at bids before the deadline**: In traditional procurement systems, privileged administrators or corrupt officials can view submitted quotes prior to deadline, leaking price data to favored bidders.
- **Bids can be changed after they are submitted**: Quotes and documentation can be altered, substituted, or forged after official submission.
- **Payments can be made without finished work**: Advance payments and staged disbursements are frequently released without independent, verifiable proof of completed deliverables.

### The Solution
1. **Tender Creation**: A procuring department publishes a tender specifying a ceiling price, required deposit bond, bidding duration, reveal duration, and staged delivery milestones.
2. **Sealed Bids**: Vetted bidders lock their secret price and a high-entropy salt inside a cryptographic hash commitment along with the required deposit, ensuring bid amounts remain concealed.
3. **Bid Opening**: After the bidding deadline closes, bidders reveal their secret price and salt on-chain; the smart contract validates each reveal against its original commitment hash.
4. **Automatic Award**: Once the reveal window ends, the smart contract deterministically awards the tender to the lowest valid revealed bidder without manual intervention.
5. **Escrow Funding**: The department locks the winning contract value into on-chain escrow before work begins.
6. **Verified Milestone Payouts**: The contractor submits completed stage evidence; independent verifiers inspect the work and cast approvals on-chain, automatically unlocking payouts (with daily late penalties deducted if delayed).

---

## 4. Why Blockchain is the Core

Traditional procurement systems rely on centralized databases and administrative trust where bids can be silently inspected or modified before opening. Blockchain provides an immutable, append-only ledger where cryptographic bid commitments cannot be altered, forged, or deleted once submitted. Smart contracts enforce sealed-bid privacy and automatically select the lowest bid without relying on centralized discretion or vulnerable backdoors. Escrowed milestone funds remain held trustlessly in contract code rather than private accounts, releasing payouts only when independent multi-party approvals are recorded on-chain.

---

## 5. Tech Stack

- **Solidity 0.8.24** (Core smart contracts with `viaIR` optimization)
- **Hardhat** (Development environment, testing framework, and deployment scripts)
- **OpenZeppelin v5** (Access control, reentrancy guards, and pausable components)
- **React** (Frontend user interface)
- **Vite** (Frontend development and build tooling)
- **ethers v6** (Ethereum contract interaction library)
- **MST Testnet** (Target EVM-compatible Layer-1 blockchain)

---

## 6. Roles

- **Registrar**: Administrative role responsible for registering verified participants, assigning system permissions, and recording company identity and group hashes to prevent Sybil bidding rings.
- **Department**: Procuring government agency or institutional department that publishes tenders, defines milestone specifications, funds the contract escrow upon award, and receives penalty refunds or forfeited bonds.
- **Verifier**: Independent technical or field inspector assigned to review completed milestone deliverables and cast on-chain approval votes.
- **Bidder**: Vetted company or contractor that submits sealed price commitments, reveals bids during the opening window, executes awarded project milestones, and receives verified stage payouts.

---

## 7. Run Locally

### Run Tests
```bash
npx hardhat test
```

### Run Web Dashboard
```bash
cd dashboard
npm install
npm run dev
```

### Required Environment Variables

#### Smart Contract Environment (`.env`)
- `MST_RPC_URL`
- `MST_CHAIN_ID`
- `DEPLOYER_PRIVATE_KEY`

#### Frontend Dashboard Environment (`dashboard/.env`)
- `VITE_CONTRACT_ADDRESS`
- `VITE_RPC_URL`
- `VITE_CHAIN_ID`
- `VITE_CHAIN_NAME`
- `VITE_CURRENCY_SYMBOL`
- `VITE_EXPLORER_URL`
- `VITE_DEMO_VERIFIERS`

---

## 8. Test Results

- **Automated Tests**: 19 passing tests (`npx hardhat test`)
- **Code Coverage**:
  - `OpenTender.sol`: 93.75% statements, 58.28% branches

---

## 9. Limitations

- **Private price agreements between companies cannot be detected**: It cannot stop companies from agreeing prices privately outside the system (off-chain cartels or collusion).
- **The registrar and verifiers are trusted**: The registrar is trusted to register genuine parties, and verifiers are trusted to inspect and verify actual milestone work honestly.
- **If verifiers never respond to a submitted stage the funds stay locked**: Escrowed stage payments remain in the contract until the required approval threshold is reached.
- **Technical evaluation and quality-based scoring are out of scope**: The smart contract awards purely based on the lowest valid economic bid below the ceiling price.
- **This is a prototype without an external security audit**: This project is an MVP prototype built for the hackathon and has not been audited by a third-party cybersecurity firm.

---

## 10. Future Work

- **Decentralized dispute resolution and timeout mechanisms**: Introduce multi-signature fallbacks, escalation windows, or third-party arbitration to release or return funds if verifiers become unresponsive.
- **Multi-criteria evaluation**: Add on-chain scoring mechanisms that combine technical capability scores with sealed economic bids.
- **Mobile field verifier attestations**: Develop mobile-friendly attestations allowing field inspectors to record photo hashes and geolocation proofs directly on-chain.
