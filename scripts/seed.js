const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const network = hre.network.name;
  console.log(`\n=== Seeding Mock Tenders on: ${network} ===\n`);

  const deploymentPath = path.join(__dirname, "..", "deployments", `${network}.json`);
  if (!fs.existsSync(deploymentPath)) {
    throw new Error(`Deployment file not found at ${deploymentPath}. Please run deploy first.`);
  }

  const { contractAddress } = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const signers = await hre.ethers.getSigners();
  const deployer = signers[0];
  const department = signers[1] || deployer;
  const verifier1 = signers[2] || deployer;
  const verifier2 = signers[3] || deployer;
  const bidder1 = signers[4] || deployer;
  const bidder2 = signers[5] || deployer;

  const openTender = await hre.ethers.getContractAt("OpenTender", contractAddress, deployer);
  const latestBlock = await hre.ethers.provider.getBlock("latest");
  const now = Number(latestBlock.timestamp);
  const chainId = (await hre.ethers.provider.getNetwork()).chainId;

  // Tender 1: Fresh Open Tender (Commit Phase active for 2 hours)
  console.log("Creating Tender #1: Active Commit Phase...");
  const commit1 = now + 7200;
  const reveal1 = commit1 + 7200;
  const milestones1 = [
    { percentageBps: 4000, dueDate: reveal1 + 86400 * 7 },
    { percentageBps: 6000, dueDate: reveal1 + 86400 * 14 },
  ];

  const tx1 = await openTender
    .connect(department)
    .createTender(
      hre.ethers.parseEther("50"),
      hre.ethers.parseEther("2"),
      commit1,
      reveal1,
      86400 * 2,
      86400 * 3,
      150,
      hre.ethers.id("DOC_MOCK_TENDER_1"),
      milestones1,
      [verifier1.address, verifier2.address],
      2
    );
  await tx1.wait();
  const t1Id = await openTender.tenderCount();
  console.log(`- Created Tender #${t1Id} (Ceiling: 50 MSTC, Bond: 2 MSTC)`);

  // Tender 2: Tender with committed sealed bids
  console.log("Creating Tender #2: With bids committed...");
  const commit2 = now + 3600;
  const reveal2 = commit2 + 3600;
  const milestones2 = [
    { percentageBps: 5000, dueDate: reveal2 + 86400 * 5 },
    { percentageBps: 5000, dueDate: reveal2 + 86400 * 10 },
  ];

  const tx2 = await openTender
    .connect(department)
    .createTender(
      hre.ethers.parseEther("100"),
      hre.ethers.parseEther("5"),
      commit2,
      reveal2,
      86400 * 2,
      86400 * 3,
      200,
      hre.ethers.id("DOC_MOCK_TENDER_2"),
      milestones2,
      [verifier1.address, verifier2.address],
      2
    );
  await tx2.wait();
  const t2Id = await openTender.tenderCount();

  const bidAmount1 = hre.ethers.parseEther("85");
  const salt1 = hre.ethers.id("SEED_SALT_1");
  const hash1 = await openTender.computeCommitHash(bidAmount1, salt1, bidder1.address, t2Id, chainId);
  await (await openTender.connect(bidder1).commitBid(t2Id, hash1, { value: hre.ethers.parseEther("5") })).wait();
  console.log(`- Bidder 1 committed sealed bid on Tender #${t2Id}`);

  // Pre-fund and grant roles to browser test account
  const browserUser = "0x3276ddefd4a54e4ed3b3d59dcd829ce61d392f59";
  try {
    await hre.ethers.provider.send("hardhat_setBalance", [
      browserUser,
      "0x3635C9ADC5DEA00000", // 1000 ETH
    ]);
    const DEPARTMENT_ROLE = await openTender.DEPARTMENT_ROLE();
    const VERIFIER_ROLE = await openTender.VERIFIER_ROLE();
    await (await openTender.grantRole(DEPARTMENT_ROLE, browserUser)).wait();
    await (await openTender.grantRole(VERIFIER_ROLE, browserUser)).wait();
    await (await openTender.registerBidder(browserUser, hre.ethers.id("USER_BROWSER_ID"), hre.ethers.id("GROUP_ALPHA"))).wait();
    console.log(`- Granted Department, Verifier, Bidder roles and 1,000 ETH to browser account: ${browserUser}`);
  } catch (err) {
    // Non-fatal if on public testnet
  }

  console.log("\nSeed completed successfully!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
