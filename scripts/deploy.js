const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const network = hre.network.name;
  console.log(`\n=== Deploying OpenTender to network: ${network} ===\n`);

  const signers = await hre.ethers.getSigners();
  if (signers.length === 0) {
    throw new Error("No signer accounts available.");
  }
  const deployer = signers[0];
  console.log(`Deployer / Registrar: ${deployer.address}`);

  const OpenTender = await hre.ethers.getContractFactory("OpenTender", deployer);
  const openTender = await OpenTender.deploy(deployer.address);
  await openTender.waitForDeployment();
  const contractAddress = await openTender.getAddress();
  console.log(`OpenTender deployed to: ${contractAddress}`);

  // Register default department and verifiers if accounts available (e.g. localhost or hardhat)
  if (signers.length >= 5) {
    const department = signers[1];
    const verifier1 = signers[2];
    const verifier2 = signers[3];
    const bidder1 = signers[4];
    const bidder2 = signers[5] || signers[4];

    await (await openTender.registerDepartment(department.address)).wait();
    console.log(`Registered Department: ${department.address}`);

    await (await openTender.registerVerifier(verifier1.address)).wait();
    await (await openTender.registerVerifier(verifier2.address)).wait();
    console.log(`Registered Verifiers: ${verifier1.address}, ${verifier2.address}`);

    await (
      await openTender.registerBidder(
        bidder1.address,
        hre.ethers.id("ID_BIDDER_1"),
        hre.ethers.id("GROUP_A")
      )
    ).wait();
    if (signers.length >= 6) {
      await (
        await openTender.registerBidder(
          bidder2.address,
          hre.ethers.id("ID_BIDDER_2"),
          hre.ethers.id("GROUP_B")
        )
      ).wait();
    }
    console.log("Registered default bidders.");
  }

  // Save deployment info
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const deploymentData = {
    network,
    chainId: Number((await hre.ethers.provider.getNetwork()).chainId),
    contractAddress,
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
  };

  const deploymentFilePath = path.join(deploymentsDir, `${network}.json`);
  fs.writeFileSync(deploymentFilePath, JSON.stringify(deploymentData, null, 2));
  console.log(`Deployment saved to: ${deploymentFilePath}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
