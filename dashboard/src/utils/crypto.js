import { ethers } from "ethers";

export function generateRandomSalt() {
  return ethers.hexlify(ethers.randomBytes(32));
}

export function computeCommitHash(amountEth, salt, bidderAddress, tenderId, chainId) {
  const amountWei = ethers.parseEther(amountEth.toString());
  const coder = ethers.AbiCoder.defaultAbiCoder();
  const encoded = coder.encode(
    ["uint256", "bytes32", "address", "uint256", "uint256"],
    [amountWei, salt, bidderAddress, BigInt(tenderId), BigInt(chainId)]
  );
  return ethers.keccak256(encoded);
}

export function downloadBidBackup(tenderId, bidderAddress, amountEth, salt, commitHash) {
  const backupData = {
    app: "OpenTender Sealed-Bid Backup",
    tenderId: Number(tenderId),
    bidder: bidderAddress,
    amountEth: amountEth.toString(),
    salt: salt,
    commitHash: commitHash,
    createdAt: new Date().toISOString(),
    notice: "Keep this file safe! You will need your secret salt and exact amount to reveal your bid after the commit phase ends."
  };

  const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `opentender-bid-tender${tenderId}-${bidderAddress.slice(0, 6)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
