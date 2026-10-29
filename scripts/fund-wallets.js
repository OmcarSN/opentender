const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

const RPC_URL = "https://testnetrpc.mstblockchain.com";
const AMOUNT_TO_SEND = ethers.parseEther("0.05");

async function main() {
  console.log(`Connecting to MST Testnet RPC: ${RPC_URL}`);
  const provider = new ethers.JsonRpcProvider(RPC_URL);

  const demoWalletsPath = path.join(__dirname, "..", ".demo-wallets.json");
  if (!fs.existsSync(demoWalletsPath)) {
    throw new Error(".demo-wallets.json not found! Please run scripts/make-wallets.js first.");
  }

  const wallets = JSON.parse(fs.readFileSync(demoWalletsPath, "utf8"));
  const deployer = new ethers.Wallet(wallets.deployer.privateKey, provider);

  const balance = await provider.getBalance(deployer.address);
  console.log(`Deployer Address: ${deployer.address}`);
  console.log(`Deployer Balance: ${ethers.formatEther(balance)} tMSTC`);

  const requiredTotal = AMOUNT_TO_SEND * 5n;
  if (balance < requiredTotal) {
    console.error(
      `ERROR: Deployer balance (${ethers.formatEther(balance)} tMSTC) is too low. Required: at least ${ethers.formatEther(requiredTotal)} tMSTC + gas.`
    );
    process.exit(1);
  }

  const recipients = ["department", "verifier1", "verifier2", "bidder1", "bidder2"];

  console.log("\n=== Funding 5 Demo Wallets (0.05 tMSTC each) ===");
  for (const role of recipients) {
    const toAddress = wallets[role].address;
    console.log(`\nSending 0.05 tMSTC to ${role} (${toAddress})...`);

    const tx = await deployer.sendTransaction({
      to: toAddress,
      value: AMOUNT_TO_SEND,
    });
    console.log(`- Tx Hash: ${tx.hash}`);

    const receipt = await tx.wait();
    console.log(`- Confirmed in block ${receipt.blockNumber}`);
  }

  console.log("\n=== All 5 Wallets Successfully Funded! ===");
}

main().catch((err) => {
  console.error("Funding failed:", err);
  process.exit(1);
});
