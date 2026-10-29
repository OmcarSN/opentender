# MST Testnet Deployment & Live Demo Guide

This guide details how to configure, deploy, and execute the automated live demonstration script on the MST Testnet for **MST Blockchain BUILDATHON #2**.

---

## 1. Network Parameters

- **Network Name**: MST Testnet
- **RPC URL**: `https://testnetrpc.mstblockchain.com`
- **Chain ID**: `91562037`
- **Currency Symbol**: `tMSTC`
- **Explorer**: `https://testnet.mstscan.com`

---

## 2. Environment Setup

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
2. Populate `DEPLOYER_PRIVATE_KEY` with your funded MST Testnet account private key:
   ```env
   MST_RPC_URL=https://testnetrpc.mstblockchain.com
   MST_CHAIN_ID=91562037
   DEPLOYER_PRIVATE_KEY=your_private_key_here
   ```
   > **Note:** The deployer key must have at least `0.3 tMSTC` to fund the ephemeral roles and deploy the contracts.

---

## 3. Deployment & Demo Commands

### Deploy Contract to MST Testnet
```bash
npm run deploy:mst
```

### Run Live Multi-Party Demo (No Time Travel)
The live testnet demo (`scripts/demo-live.js`) performs a realistic multi-party simulation across real wall-clock intervals:
```bash
npm run demo:live
```

**How the Live Script Works:**
1. Generates ephemeral wallets for Department, Verifier 1, Verifier 2, Bidder 1, and Bidder 2.
2. Funds each ephemeral wallet with 0.05 tMSTC from the Deployer account.
3. Deploys/attaches `OpenTender` and registers all roles and bidder credentials.
4. Opens a Tender with a **3-minute commit phase** and a **3-minute reveal phase**.
5. Submits sealed commitments from Bidder 1 (0.018 MSTC) and Bidder 2 (0.015 MSTC).
6. Polls on-chain block timestamps every 15 seconds until the commit deadline elapses.
7. Reveals bids on-chain.
8. Polls until reveal deadline elapses.
9. Finalizes award to Bidder 2 (lowest bid), refunds Bidder 1's bond, and funds escrow.
10. Submits and approves Milestone 0 (50%) and Milestone 1 (50% Final), returning performance bond.
