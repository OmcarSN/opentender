const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const network = hre.network.name;
  console.log(`\n=== Seeding Live Network Roles on: ${network} ===\n`);

  const deploymentPath = path.join(__dirname, "..", "deployments", `${network}.json`);
  if (!fs.existsSync(deploymentPath)) {
    throw new Error(`Deployment file not found at ${deploymentPath}`);
  }
  const { contractAddress } = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  console.log(`Contract Address: ${contractAddress}`);

  const demoWalletsPath = path.join(__dirname, "..", ".demo-wallets.json");
  if (!fs.existsSync(demoWalletsPath)) {
    throw new Error(`.demo-wallets.json not found at ${demoWalletsPath}`);
  }
  const wallets = JSON.parse(fs.readFileSync(demoWalletsPath, "utf8"));

  const [deployer] = await hre.ethers.getSigners();
  console.log(`Deployer / Registrar: ${deployer.address}`);

  const openTender = await hre.ethers.getContractAt("OpenTender", contractAddress, deployer);

  // 1. Register Department
  console.log(`\n1. Registering Department: ${wallets.department.address}...`);
  const tx1 = await openTender.registerDepartment(wallets.department.address);
  console.log(`- Tx Hash: ${tx1.hash}`);
  const r1 = await tx1.wait();
  console.log(`- Confirmed in block ${r1.blockNumber}`);

  // 2. Register Verifier 1
  console.log(`\n2. Registering Verifier 1: ${wallets.verifier1.address}...`);
  const tx2 = await openTender.registerVerifier(wallets.verifier1.address);
  console.log(`- Tx Hash: ${tx2.hash}`);
  const r2 = await tx2.wait();
  console.log(`- Confirmed in block ${r2.blockNumber}`);

  // 3. Register Verifier 2
  console.log(`\n3. Registering Verifier 2: ${wallets.verifier2.address}...`);
  const tx3 = await openTender.registerVerifier(wallets.verifier2.address);
  console.log(`- Tx Hash: ${tx3.hash}`);
  const r3 = await tx3.wait();
  console.log(`- Confirmed in block ${r3.blockNumber}`);

  // 4. Register Bidder 1 (GROUP_ALPHA)
  console.log(`\n4. Registering Bidder 1 (GROUP_ALPHA): ${wallets.bidder1.address}...`);
  const tx4 = await openTender.registerBidder(
    wallets.bidder1.address,
    hre.ethers.id("ID_BIDDER_1"),
    hre.ethers.id("GROUP_ALPHA")
  );
  console.log(`- Tx Hash: ${tx4.hash}`);
  const r4 = await tx4.wait();
  console.log(`- Confirmed in block ${r4.blockNumber}`);

  // 5. Register Bidder 2 (GROUP_BETA)
  console.log(`\n5. Registering Bidder 2 (GROUP_BETA): ${wallets.bidder2.address}...`);
  const tx5 = await openTender.registerBidder(
    wallets.bidder2.address,
    hre.ethers.id("ID_BIDDER_2"),
    hre.ethers.id("GROUP_BETA")
  );
  console.log(`- Tx Hash: ${tx5.hash}`);
  const r5 = await tx5.wait();
  console.log(`- Confirmed in block ${r5.blockNumber}`);

  // 6. Final Platform Stats
  console.log("\n=== Querying Final Platform Stats from Contract ===");
  const stats = await openTender.getPlatformStats();
  console.log(`Tenders Count: ${stats[0].toString()}`);
  console.log(`Registered Bidders: ${stats[1].toString()}`);
  console.log(`Debarred Bidders: ${stats[2].toString()}`);
  console.log(`Awarded Tenders: ${stats[3].toString()}`);
  console.log(`Completed Tenders: ${stats[4].toString()}`);
  console.log(`Defaulted Tenders: ${stats[5].toString()}`);
  console.log(`Total Value Locked (TVL): ${hre.ethers.formatEther(stats[6])} tMSTC`);
  console.log("===================================================");
}

main().catch((err) => {
  console.error("Seeding live network failed:", err);
  process.exit(1);
});
