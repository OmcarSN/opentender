import { ethers } from "ethers";
import OpenTenderArtifact from "../../artifacts/contracts/OpenTender.sol/OpenTender.json";

export const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS || "0x0DCd1Bf9A1b36cE34237eEaFef220932846BCD82";
export const RPC_URL = import.meta.env.VITE_RPC_URL || "http://127.0.0.1:8545";
export const CHAIN_ID = parseInt(import.meta.env.VITE_CHAIN_ID || "31337", 10);
export const CHAIN_NAME = import.meta.env.VITE_CHAIN_NAME || "Hardhat Localhost";
export const CURRENCY_SYMBOL = import.meta.env.VITE_CURRENCY_SYMBOL || "ETH";
export const EXPLORER_URL = import.meta.env.VITE_EXPLORER_URL || "";

export const OpenTenderABI = OpenTenderArtifact.abi;

// Read-only provider for public audit tab (requires zero wallet connection)
export function getReadOnlyProvider() {
  return new ethers.JsonRpcProvider(
    RPC_URL,
    { chainId: CHAIN_ID, name: CHAIN_NAME },
    { staticNetwork: true }
  );
}

export function getReadOnlyContract() {
  const provider = getReadOnlyProvider();
  return new ethers.Contract(CONTRACT_ADDRESS, OpenTenderABI, provider);
}

export function getSignerContract(signer) {
  return new ethers.Contract(CONTRACT_ADDRESS, OpenTenderABI, signer);
}
