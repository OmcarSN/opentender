export const TENDER_METADATA = {
  1: {
    title: "Municipal Fiber Optic Grid & Smart Traffic Signaling",
    sector: "Digital Infrastructure",
    location: "City of Metro West, MST Province",
    rating: "5.0",
    reviewsCount: 132,
    badge: "Public Works Dossier",
    image: "/thumbnails/fiber.svg",
    description: "Deployment of 48-strand single-mode fiber optic backbone and automated adaptive traffic controller nodes across 12 civic intersections."
  },
  2: {
    title: "Regional Medical Center Hybrid Cloud & PACS Archive",
    sector: "Healthcare IT",
    location: "State Health Authority, MST Network",
    rating: "4.9",
    reviewsCount: 98,
    badge: "Critical Infrastructure",
    image: "/thumbnails/cloud.svg",
    description: "HIPAA-compliant on-chain milestone escrow for multi-site medical imaging archive storage and zero-trust cloud disaster recovery."
  },
  3: {
    title: "Civic Solar Microgrid & 5MW Battery Energy Storage",
    sector: "Clean Energy",
    location: "Renewable Power Directorate, MST Hub",
    rating: "5.0",
    reviewsCount: 184,
    badge: "Clean Energy Initiative",
    image: "/thumbnails/solar.svg",
    description: "Engineering, procurement, and verified commissioning of utility-scale solar photovoltaic array and lithium iron phosphate BESS."
  }
};

export function getTenderMeta(id) {
  if (TENDER_METADATA[id]) {
    return TENDER_METADATA[id];
  }
  const images = ["/thumbnails/fiber.svg", "/thumbnails/cloud.svg", "/thumbnails/solar.svg"];
  return {
    title: `Public Tender #${id}: Civic Infrastructure & Milestone Escrow`,
    sector: "Public Procurement",
    location: "MST Municipal Jurisdiction, On-Chain",
    rating: "5.0",
    reviewsCount: 42 + Number(id) * 7,
    badge: "Verified Specification",
    image: images[(Number(id) - 1) % images.length],
    description: "Institutional public sector procurement contract backed by on-chain milestone escrow and sealed-bid privacy."
  };
}
