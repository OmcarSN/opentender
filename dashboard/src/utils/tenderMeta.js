// OpenTender Document Hash Formatting Helper
export function formatTenderTitle(id, documentHash) {
  if (documentHash && typeof documentHash === "string" && documentHash.startsWith("0x")) {
    return `Tender #${id} ${documentHash.slice(0, 10)}`;
  }
  return `Tender #${id}`;
}
