const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

async function main() {
  const roles = [
    "deployer",
    "department",
    "verifier1",
    "verifier2",
    "bidder1",
    "bidder2",
  ];

  const wallets = {};
  const addresses = {};

  for (const role of roles) {
    const w = ethers.Wallet.createRandom();
    wallets[role] = {
      address: w.address,
      privateKey: w.privateKey,
    };
    addresses[role] = w.address;
  }

  // Write private keys ONLY to .demo-wallets.json (gitignored)
  const rootDir = path.join(__dirname, "..");
  const demoWalletsPath = path.join(rootDir, ".demo-wallets.json");
  fs.writeFileSync(demoWalletsPath, JSON.stringify(wallets, null, 2), "utf8");

  // Write DEPLOYER_PRIVATE_KEY into .env
  const envPath = path.join(rootDir, ".env");
  let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";

  if (/^DEPLOYER_PRIVATE_KEY=.*$/m.test(envContent)) {
    envContent = envContent.replace(
      /^DEPLOYER_PRIVATE_KEY=.*$/m,
      `DEPLOYER_PRIVATE_KEY=${wallets.deployer.privateKey}`
    );
  } else {
    envContent += `\nDEPLOYER_PRIVATE_KEY=${wallets.deployer.privateKey}\n`;
  }
  fs.writeFileSync(envPath, envContent, "utf8");

  // Print ONLY the 6 public addresses
  console.log("=== Generated 6 Demo Public Addresses ===");
  for (const role of roles) {
    console.log(`${role}: ${addresses[role]}`);
  }
  console.log("=========================================");
}

main().catch((err) => {
  console.error("Wallet generation failed:", err);
  process.exit(1);
});
