import { ethers } from "ethers";
import OpenTenderABIJson from "./abi/OpenTenderABI.json";

export const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS || "0x493Bb88ad309346aA84E237aC84c8612eD1852d8";
export const DEPLOY_BLOCK = parseInt(import.meta.env.VITE_DEPLOY_BLOCK || "6681138", 10);
export const RPC_URL = import.meta.env.VITE_RPC_URL || "https://testnetrpc.mstblockchain.com";
export const CHAIN_ID = parseInt(import.meta.env.VITE_CHAIN_ID || "91562037", 10);
export const CHAIN_NAME = import.meta.env.VITE_CHAIN_NAME || "MST Testnet";
export const CURRENCY_SYMBOL = import.meta.env.VITE_CURRENCY_SYMBOL || "tMSTC";
export const EXPLORER_URL = import.meta.env.VITE_EXPLORER_URL || "https://testnet.mstscan.com";
export const DEMO_VERIFIERS =
  import.meta.env.VITE_DEMO_VERIFIERS ||
  "0xF96F5EBC048B8A0d7c9abE2926fda6cc9cC1AD93, 0x88667C745272bCb1f45001ac97a4E521cD5a168c";

export const OpenTenderABI = OpenTenderABIJson;

// Shared singleton read-only provider for public audit tab (STEP 4)
let _sharedProvider = null;
export function getReadOnlyProvider() {
  if (!_sharedProvider) {
    _sharedProvider = new ethers.JsonRpcProvider(
      RPC_URL,
      { chainId: CHAIN_ID, name: CHAIN_NAME },
      { staticNetwork: true }
    );
  }
  return _sharedProvider;
}

export function getReadOnlyContract() {
  const provider = getReadOnlyProvider();
  return new ethers.Contract(CONTRACT_ADDRESS, OpenTenderABI, provider);
}

export function getSignerContract(signer) {
  return new ethers.Contract(CONTRACT_ADDRESS, OpenTenderABI, signer);
}
