# OpenTender

**Government tenders nobody can rig.**

OpenTender is a smart contract on MST Blockchain that runs a public tender from start to finish. Bids stay sealed until the deadline, the lowest valid bid wins automatically, and the winner is paid in stages only after independent verifiers approve the work.

Built by Omkar Nanaware (solo) for MST Blockchain BUILDATHON #2.

---

## Quick links

| What | Link |
| --- | --- |
| Live app | https://opentender-lior.vercel.app |
| Smart contract | `0x493Bb88ad309346aA84E237aC84c8612eD1852d8` |
| Contract on explorer | https://testnet.mstscan.com/address/0x493Bb88ad309346aA84E237aC84c8612eD1852d8 |
| Network | MST Testnet (chain ID `91562037`) |
| Source code | https://github.com/OmcarSN/opentender |

---

## OpenTender in simple words

Imagine a government office that needs a road repaired. Companies send in prices, and the cheapest qualified company should win. In real life this goes wrong in four ways:

1. **Peeking.** An insider sees one company's price early and tells a friend, who bids a little lower.
2. **Changing.** Someone with system access edits or removes a bid after it was sent.
3. **Secret deals.** Companies that should compete agree on prices in private.
4. **Paying for nothing.** The winner is paid even though the work is not finished.

OpenTender uses a **smart contract**, which is a program on a blockchain that nobody can quietly change, to fix the first, second and fourth problems. Each step below is enforced by code, not by trust in a person.

### How it works (the 6 steps)

1. **Publish.** A government department publishes a tender: a maximum price, a deposit that bidders must put down, a bidding time, an opening time, and the payment stages.
2. **Sealed bids.** Each company puts its price into a "sealed envelope" (a cryptographic fingerprint called a hash) and locks the deposit. Nobody can read or change it, not even the department.
3. **Opening.** After the bidding time ends, each company opens its envelope by revealing the price and its secret code. The contract checks that it matches the sealed envelope.
4. **Automatic winner.** After the opening time ends, the contract picks the lowest valid price. If two companies bid the same price, the one who sealed its bid first wins. Companies that never opened their bid lose their deposit.
5. **Funding.** The department puts the winning amount into the contract (this is called escrow). The money now sits in the contract, not in anyone's pocket.
6. **Paid in stages.** The winner submits proof of each stage of work. When enough independent verifiers approve a stage, the contract pays that part automatically. Late work is penalised automatically. After the final stage, the winner also gets the deposit back.

### What the contract cannot do

OpenTender is honest about its limits:

- It **cannot detect companies agreeing prices in private** outside the system. It only blocks companies registered in the same group from bidding on the same tender.
- It **trusts the registrar** (who approves companies) and the **verifiers** (who check real-world work).
- It is a **prototype on a test network** and has not been audited by an outside security firm.

---

## Who does what (roles)

| Role | What they can do |
| --- | --- |
| **Registrar (admin)** | Registers companies, departments and verifiers. Can block a company. Can pause the contract in an emergency. |
| **Department** | Publishes tenders, chooses the winner after the opening, deposits the contract money, and can cancel or declare a missed deadline. |
| **Bidder (company)** | Places a sealed bid, opens it later, submits proof of work if it wins, and gets money or deposits back. |
| **Verifier** | Approves finished stages of work. Several verifiers must approve (for example 2 of 2). |
| **Anyone** | Can read every tender, bid, payment and event on the public Tenders page, no wallet needed. |

---

## The web app

The app has four pages:

| Page | Who uses it | What it does |
| --- | --- | --- |
| **How it works** | Everyone | Short explanation of the idea. |
| **Tenders** | Everyone (no wallet needed) | Lists all tenders with status, countdown, bids, payment stages and an activity feed. Includes a **Try to cheat** button that tests whether the contract blocks reading hidden bids and changing a submitted bid. |
| **Bid** | Companies | Place a sealed bid, open it, submit proof of work, and collect money. |
| **Department & Verifiers** | Departments, verifiers, admin | Publish tenders, choose the winner, fund the contract, approve work, and manage participants. |

Notes:
- The tender title you type is stored on your own device. Only its fingerprint goes on the blockchain.
- Tenders #1 and #2 on the live site are demo tenders.

---

## Features of the smart contract

**Bidding**
- Sealed bids: each bid is a hash of the amount, a secret code, the bidder's address, the tender number and the chain ID. Copying someone else's hash does not work, because the bidder's address is part of it.
- One bid per company per tender, and a bid cannot be edited.
- A deposit is required with every bid. The deposit must be above zero.
- Bids above the maximum price are rejected.
- Companies from the same registered group cannot both bid on one tender. Unregistered and blocked companies cannot bid.

**Award**
- Anyone can finalize the tender after the opening time ends. The lowest valid bid wins, and ties go to the earliest sealed bid.
- Deposits of companies that never opened their bid are forfeited to the department.
- If nobody opens a valid bid, the tender is marked as failed.
- Other companies can claim their deposits back themselves (pull payment).

**Money and work**
- The department must fund exactly the winning amount within a set window, or the tender is cancelled and the winner's deposit is returned.
- Work is split into stages (the app uses 30% / 30% / 40%; the contract accepts any split that adds up to 100%).
- A stage is paid automatically once enough verifiers approve it.
- Late delivery reduces the stage payment by a daily percentage (maximum 10% per day). Rounding leftovers go to the final stage.
- If a stage has not been submitted by its due date plus a grace period, anyone can declare a default: the deposit is forfeited, the remaining money returns to the department, and the contractor is blocked. A stage that was already submitted cannot be defaulted.

**Safety**
- Protection against reentrancy attacks on all money movements.
- Refunds use a pull-payment pattern, so one bad contract cannot block others.
- An emergency pause switch for the registrar.
- Role-based access control (OpenZeppelin).

---

## Tests

- **19 automated tests, all passing** (`npx hardhat test`).
- Coverage for `OpenTender.sol`: **93.75% statements, 58.28% branches**.

The tests include named attack scenarios:

| Attack | What the test proves |
| --- | --- |
| Peek | Before the opening, only hashes are readable. |
| Edit | A second bid from the same company is rejected. |
| Copy | Copying another company's hash fails at opening. |
| Wrong secret, wrong amount, early or late opening | All rejected. |
| Not opening a bid | The deposit is forfeited. |
| Same-group, unregistered or blocked bidders | Blocked. |
| Early or repeated award | Rejected. |
| Late or wrong escrow amount | Rejected. |
| Too few verifier approvals | No money is released. |
| Late penalty and rounding | Calculated correctly, nothing is left stuck. |
| Missed deadline | Default works, but not for work already submitted. |
| Malicious contract (reentrancy) | The attack fails. |
| Access control | Restricted functions reject outsiders. |

---

## Try it yourself

**Without a wallet:** open the live app and use the **Tenders** page. Everything is public.

**Full flow:** you need a wallet and test tokens.

1. Add MST Testnet to your wallet:
   - Network name: `MST Testnet`
   - RPC URL: `https://testnetrpc.mstblockchain.com`
   - Chain ID: `91562037`
   - Symbol: `tMSTC`
   - Explorer: `https://testnet.mstscan.com`
2. Get free test tokens from the MST faucet: https://faucet.mstblockchain.com
3. Send your wallet address to the author to receive a role (bidder, department or verifier), or ask for demo wallets. Roles can only be granted by the registrar.

Contact: **ADD YOUR EMAIL OR WHATSAPP HERE**

**Demo walk-through (about 10 minutes, mostly waiting):**
1. As the **department**, open *Department & Verifiers*, click **Fill demo values**, then **Publish tender**.
2. As two different **bidders**, open *Bid* and place sealed bids. Use a lower price for the company you want to win.
3. On *Tenders*, click **Try to cheat** to see the contract block peeking and editing.
4. After the bidding time ends, each bidder opens their bid on the *Bid* page.
5. After the opening time ends, the department clicks **Choose the winner**.
6. The department deposits the contract money.
7. The winner submits proof of work for a stage, and the verifiers approve it.
8. Watch the payment appear on the *Tenders* page and on the explorer.

---

## Run it on your own computer

You need Node.js 18 or newer.

```bash
git clone https://github.com/OmcarSN/opentender.git
cd opentender
npm install
```

**Run the tests**

```bash
npx hardhat test
npx hardhat coverage
```

**Run everything locally (fake blockchain on your machine)**

Open three terminals in the project folder:

```bash
# Terminal 1: start a local blockchain
npx hardhat node

# Terminal 2: deploy and add sample data
npm run deploy:local
npm run seed

# Terminal 3: start the web app
cd dashboard
npm install
npm run dev
```

Open http://localhost:5173. Do **not** run `npm run demo` before using the web app. That script jumps the local chain's clock forward, which breaks the app's countdowns. To get back to a clean state, restart the node and repeat Terminal 2.

**Deploy to MST Testnet**

1. Copy `.env.example` to `.env` and fill in the values below.
2. Make fresh demo wallets and fund the deployer from the faucet:
   ```bash
   node scripts/make-wallets.js
   ```
   This writes private keys to `.demo-wallets.json`, which is ignored by git. Never share or commit this file.
3. Check the network, fund the other wallets, deploy and register roles:
   ```bash
   node scripts/check-network.js
   node scripts/fund-wallets.js
   npm run deploy:mst
   npx hardhat run scripts/seed-live.js --network mstTestnet
   ```
4. Put the new contract address into `dashboard/.env` (and your hosting settings) as `VITE_CONTRACT_ADDRESS`.

### Environment variables

Smart contract settings (`.env`, names only):

```
MST_RPC_URL
MST_CHAIN_ID
DEPLOYER_PRIVATE_KEY
```

Web app settings (`dashboard/.env`):

```
VITE_CONTRACT_ADDRESS
VITE_RPC_URL
VITE_CHAIN_ID
VITE_CHAIN_NAME
VITE_CURRENCY_SYMBOL
VITE_EXPLORER_URL
VITE_DEMO_VERIFIERS
```

**Security rule:** never commit `.env`, `.demo-wallets.json`, or any private key. Never put a private key on GitHub or in a screenshot.

---

## Project structure

```
opentender/
├── contracts/
│   ├── OpenTender.sol          The main smart contract
│   └── mocks/
│       └── MaliciousBidder.sol  A fake attacker used only in tests
├── test/
│   └── OpenTender.test.js      The 19 automated tests
├── scripts/                    Deploy, seed, demo and testnet helper scripts
├── dashboard/                  The web app (React + Vite + ethers)
├── docs/
│   ├── ARCHITECTURE.md         Tender life cycle and design
│   ├── AUDIT.md                Security notes and attack table
│   └── MST_TESTNET_GUIDE.md    Step-by-step testnet guide
├── hardhat.config.js
└── package.json
```

---

## Tech stack

- **Smart contract:** Solidity 0.8.24, OpenZeppelin v5 (access control, reentrancy guard, pausable)
- **Development and testing:** Hardhat
- **Web app:** React, Vite, ethers v6
- **Blockchain:** MST Testnet (EVM-compatible Layer 1), token symbol tMSTC
- **Hosting:** Vercel

---

## Why blockchain is the core

A normal website keeps bids in a database that an administrator can read or edit. In OpenTender the rules live in a contract that no single person controls:

- A sealed bid cannot be read or changed by anyone, including the department that runs the tender.
- The winner is picked by code, using a rule everyone can read.
- The contract money sits in escrow, and it is released only when several independent verifiers approve.
- Every action is a public record that auditors and journalists can check.

Without the contract, there is no product.

---

## Limitations

- Companies can still agree prices privately outside the system. The contract cannot see that.
- The registrar must register genuine companies. If two related companies are placed in different groups, the group check will not catch them. A real deployment would put the registrar behind a multi-signature wallet or a government identity system.
- If enough verifiers collude with a contractor, they can approve false work. Their approvals stay public and permanent.
- If verifiers never respond to a submitted stage, the money for that stage stays locked, because a submitted stage cannot be defaulted. A timeout is planned.
- Technical evaluation and quality-based scoring are out of scope. The contract awards on lowest valid price only, after the registrar has approved who may bid.
- This is a prototype on a test network and has not had an external security audit.

## Future work

- A step where an evaluation committee qualifies each bidder for a tender before the opening.
- Timeouts and fallback approvals when verifiers do not respond.
- Linking bidder identity to a government identity system and securing the registrar with multi-signature.
- Flagging bidders whose wallets were funded from the same source.
- Combining quality scores with sealed price bids.

---

## Glossary

| Word | Meaning |
| --- | --- |
| **Smart contract** | A program on a blockchain that runs exactly as written and cannot be quietly changed. |
| **Sealed bid** | A bid whose price is hidden inside a hash until the opening. |
| **Hash** | A fingerprint of some data. The same data always gives the same fingerprint, but you cannot work back to the data. |
| **Deposit (bid bond)** | Money a company locks with its bid. It is returned if the company behaves and lost if it does not open its bid. |
| **Escrow** | Money held by the contract until conditions are met. |
| **Milestone / stage** | One part of the work, paid separately. |
| **Verifier** | An independent person who checks the work and approves a stage. |
| **Testnet** | A practice blockchain where tokens have no real value. |
| **tMSTC** | The test token of MST Testnet. |

---

## Author

Built by **Omkar Nanaware** for MST Blockchain BUILDATHON #2. GitHub: [OmcarSN](https://github.com/OmcarSN).
