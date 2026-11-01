const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const deploymentPath = path.join(__dirname, "..", "deployments", "mstTestnet.json");
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const contractAddress = deployment.contractAddress;

  const demoWalletsPath = path.join(__dirname, "..", ".demo-wallets.json");
  const demoWallets = JSON.parse(fs.readFileSync(demoWalletsPath, "utf8"));

  const bidder1Address = hre.ethers.getAddress(demoWallets.bidder1.address);

  // Signer is configured via DEPLOYER_PRIVATE_KEY from .env in hardhat.config.js for mstTestnet
  const [signer] = await hre.ethers.getSigners();
  const signerAddress = await signer.getAddress();

  console.log(`Executing reinstateBidder for ${bidder1Address}`);
  console.log(`Caller / Registrar account: ${signerAddress}`);

  const openTender = await hre.ethers.getContractAt("OpenTender", contractAddress, signer);

  const tx = await openTender.reinstateBidder(bidder1Address);
  console.log(`Transaction sent! Hash: ${tx.hash}`);

  console.log("Waiting for block confirmation on mstTestnet...");
  const receipt = await tx.wait();
  console.log(`Confirmed in block: ${receipt.blockNumber} (status: ${receipt.status})`);
}

main().catch((err) => {
  console.error("Error executing reinstate-bidder:", err);
  process.exit(1);
});
