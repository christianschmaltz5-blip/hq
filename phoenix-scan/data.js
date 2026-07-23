// Phoenix Cap-Rate Watch — scan data
//
// This is the ONLY file the weekly scan updater should touch. Structure:
//
// window.PHX_SCAN = {
//   updated: "YYYY-MM-DD",              // date of the most recent scan
//   listingsScanned: <int>,             // how many listings were reviewed this pass
//   benchmarks: { "<class>": <cap%> },  // class -> benchmark going-in cap rate;
//                                       // a deal "qualifies" at benchmark + 1.00 (100bps)
//   qualifying: [{                      // deals that cleared benchmark + 100bps
//     name, address, zip, ask, units, cls, noi, capPct, spreadBps, confidence, notes, url
//   }],
//   nearMisses: [ /* same shape as qualifying — 50-99bps or unverifiable spread */ ],
//   disqualified: [{                    // broker-stated cap vs re-underwritten reality
//     address, statedCapPct, realCapPct, reason
//   }],
//   history: [{ date, scanned, qualifyingCount, top }]   // one row per past scan run
// };

window.PHX_SCAN = {
  updated: "2026-07-23",
  listingsScanned: 12,
  benchmarks: { "A": 4.75, "B": 4.90, "C": 5.40, "2-4 unit": 5.50 },

  qualifying: [
    {
      name: "2916 E Monroe St",
      address: "2916 E Monroe St",
      zip: "85008",
      ask: 1040000,
      units: 9,
      cls: "C",
      noi: 78335,
      capPct: 7.53,
      spreadBps: 213,
      confidence: "MEDIUM",
      notes: "Built 1946, 100% occupied, 4,309 SF. Real dollar NOI disclosed ($78,335) rather than a stated-cap-only listing, which is more credible — but no rent roll was available to independently rebuild that NOI and sanity-check the expense ratio behind it. Verify: request trailing rent roll and expense detail before treating as confirmed.",
      url: "https://www.crexi.com/properties/2371894/Phoenix-AZ-85008"
    }
  ],

  nearMisses: [
    {
      name: "2242 E Taylor St",
      address: "2242 E Taylor St",
      zip: "85006",
      ask: 675000,
      units: 5,
      cls: "C",
      noi: null,
      capPct: 5.95,
      spreadBps: 55,
      confidence: "MEDIUM",
      notes: "Marketed at 8.32% cap, but that number doesn't hold up: disclosed avg rent $1,214/unit implies $72,840 gross, while the stated NOI of $56,147 implies only ~23% expenses — unrealistic for an 80-year-old (1944) property. Re-underwritten at 5% vacancy / 42% opex: NOI ≈ $40,135, real cap ≈5.95% — a genuine +55bps over the 5.40% Class C benchmark, just short of the +100bps qualify line. Not a fake deal, just not enough spread once realistically underwritten.",
      url: "https://www.crexi.com/properties/2357577/arizona-2242-e-taylor-st"
    },
    {
      name: "Latona Fontaine",
      address: "105-141 West Latona Road",
      zip: "85041",
      ask: 4995000,
      units: 11,
      cls: "C",
      noi: null,
      capPct: 5.89,
      spreadBps: 49,
      confidence: "LOW",
      notes: "Stated 5.89% cap, no NOI/rent disclosed to sanity-check. At face value, +49bps over the 5.40% Class C benchmark — just under the near-miss floor, but close enough to flag. Treat as a broker-call lead, not a confirmed deal.",
      url: ""
    }
  ],

  disqualified: [
    {
      address: "2719 W Maryland Ave, Phoenix AZ 85017",
      statedCapPct: 7.82,
      realCapPct: 5.1,
      reason: "8 units, built 1958, renovated 2025-2026, 100% occupied. Stated NOI $108,345 on $127,128 gross implies only ~15% opex — unrealistic for an 8-unit Phoenix property. Re-underwritten at 5% vacancy / 42% opex: NOI ≈ $70,000, real cap ≈5.1% — below the 5.40% Class C benchmark, not above it. Reconfirmed still listed at same price/cap as of 2026-07-23."
    },
    {
      address: "1017-1031 E Fairmount Ave, Phoenix AZ 85014",
      statedCapPct: 6.50,
      realCapPct: 4.1,
      reason: "8 units, built 1966, renovated 2021, 100% occupied. Stated NOI $126,680 on $146,688 gross implies ~14% opex. Re-underwritten at 5% vacancy / 42% opex: NOI ≈ $80,825, real cap ≈4.1% — well below benchmark. Reconfirmed still listed at same price/cap as of 2026-07-23."
    },
    {
      address: "3139 N 40th St, Phoenix AZ 85018 (\"Rare Arcadia Multi Family Opportunity\")",
      statedCapPct: 9.37,
      realCapPct: null,
      reason: "5 units, Class B. Listing's own marketing copy describes sober-living/residential-assisted-living use averaging $28,000/month (>$5,000/unit/month) — specialty board-and-care income, not conventional apartment rent. Excluded as non-comparable; the \"spread\" would be measuring the wrong asset class, not a mispricing. Not re-checked in the 2026-07-23 run — carried forward as a standing exclusion."
    },
    {
      address: "8910 N 8th St, Phoenix AZ 85020",
      statedCapPct: null,
      realCapPct: null,
      reason: "Listed at $580,000 for 20 units ($29k/unit) — looked like a screaming deal, but it's vacant land with an approved development plan (\"Acacia Affordable Housing\"), not an operating asset. No NOI, no comparable going-in cap. Excluded as non-comparable."
    }
  ],

  history: [
    { date: "2026-07-16", scanned: 110, qualifyingCount: 2, top: "Ocotillo +185bps" },
    { date: "2026-07-23", scanned: 12, qualifyingCount: 1, top: "2916 E Monroe St +213bps (partial spot-check, page 1 of 128 only)" }
  ]
};
