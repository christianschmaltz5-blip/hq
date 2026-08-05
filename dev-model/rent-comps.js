// Rent Comps — populated by a separate weekly-scan agent (same pattern as
// phoenix-scan/data.js): ~/hq/agents/rent_comps/prompt.md + run.sh.
//
// Shape:
// window.RENT_COMPS = {
//   updated: "YYYY-MM-DD",
//   zips: [...],           // zip codes scanned this run
//   comps: [
//     { property, address, zip, unitType, beds, sqft, rent, tier: "Classic"|"Renovated"|null, source, url }
//   ]
// };
//
// Seeded 2026-08-05 from a manual scan (before the weekly agent's first run) —
// see the 5035 N 23rd Ave underwriting session for how these were found.

window.RENT_COMPS = {
  updated: "2026-08-05",
  zips: ["85015"],
  comps: [
    { property: "Thunderbird Apartments on 23rd Ave", address: "2302 W Colter St", zip: "85015",
      unitType: "2x1", beds: 2, sqft: 713, rent: 1025, tier: null,
      source: "apartments.com", url: "https://www.apartments.com/thunderbird-apartments-on-23rd-ave-phoenix-az/cggt1bf/" },
    { property: "San Aurelio", address: "5530 N 17th Ave", zip: "85015",
      unitType: "2x2", beds: 2, sqft: 878, rent: 1250, tier: "Renovated",
      source: "apartments.com", url: "https://www.apartments.com/san-aurelio-phoenix-az/jrpn5r5/" },
    { property: "Acacia Gardens", address: "1515 W Missouri Ave", zip: "85015",
      unitType: "1x1", beds: 1, sqft: 650, rent: 847, tier: "Classic",
      source: "apartments.com", url: "https://www.apartments.com/acacia-gardens-phoenix-az/g0y1dqy/" },
    { property: "Acacia Gardens", address: "1515 W Missouri Ave", zip: "85015",
      unitType: "1x1", beds: 1, sqft: 650, rent: 897, tier: "Renovated",
      source: "apartments.com", url: "https://www.apartments.com/acacia-gardens-phoenix-az/g0y1dqy/" },
    { property: "Acacia Gardens", address: "1515 W Missouri Ave", zip: "85015",
      unitType: "2x2", beds: 2, sqft: 860, rent: 1097, tier: "Classic",
      source: "apartments.com", url: "https://www.apartments.com/acacia-gardens-phoenix-az/g0y1dqy/" },
    { property: "Acacia Gardens", address: "1515 W Missouri Ave", zip: "85015",
      unitType: "2x2", beds: 2, sqft: 860, rent: 1197, tier: "Renovated",
      source: "apartments.com", url: "https://www.apartments.com/acacia-gardens-phoenix-az/g0y1dqy/" }
  ]
};
