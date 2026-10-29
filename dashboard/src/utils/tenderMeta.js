export const TENDER_METADATA = {
  1: {
    title: "Municipal Fiber Optic Backbone",
    isDemo: true,
    image: "/thumbnails/fiber.svg",
    description: "Deployment of 48-strand single-mode fiber optic backbone and traffic controller nodes."
  },
  2: {
    title: "Healthcare PACS Imaging & Archive Storage",
    isDemo: true,
    image: "/thumbnails/cloud.svg",
    description: "On-chain milestone escrow for multi-site medical imaging archive storage."
  },
  3: {
    title: "Solar Photovoltaic Microgrid & BESS",
    isDemo: true,
    image: "/thumbnails/solar.svg",
    description: "Commissioning of utility-scale solar photovoltaic array and battery storage."
  }
};

export function getTenderMeta(id) {
  if (TENDER_METADATA[id]) {
    return TENDER_METADATA[id];
  }
  const images = ["/thumbnails/fiber.svg", "/thumbnails/cloud.svg", "/thumbnails/solar.svg"];
  return {
    title: `Public Procurement Contract #${id}`,
    isDemo: false,
    image: images[(Number(id) - 1) % images.length],
    description: "On-chain public tender backed by milestone escrow and sealed-bid privacy."
  };
}
