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
  updated: "2026-09-29",
  listingsScanned: 27,
  benchmarks: { "A": 4.75, "B": 4.90, "C": 5.40, "2-4 unit": 5.50 },

  qualifying: [],

  nearMisses: [
    {
      name: "Clubhouse at Arcadia",
      address: "2620 N 40th St",
      zip: "85008",
      ask: 12247000,
      units: 43,
      cls: "B",
      noi: 704197,
      capPct: 5.75,
      spreadBps: 85,
      confidence: "MEDIUM",
      notes: "Built 1951, renovated 2018, listed by CBRE, 211 days on market. Real dollar NOI disclosed ($704,197; matches Crexi valuation box) but no rent roll to rebuild it. Reconfirmed 2026-09-29: same price and NOI as prior scan. 15bps short of the +100bps line.",
      url: "https://www.crexi.com/properties/2370896/arizona-clubhouse-at-arcadia"
    }
  ],

  disqualified: [
    {
      address: "2014 W Berridge Ln, Phoenix AZ 85015 (Signature 18 Apartments)",
      statedCapPct: 8.0,
      realCapPct: null,
      reason: "18 units, Class C, built 1961, renovated 2023, listed by HomeSmart, price cut from $4,495,000 to $3,780,000 (141 days on market). Broker markets an '8% actual T-4 cap' (~$302k NOI per Crexi's calculator) - a ~260bps spread over the 5.40% Class C benchmark, but NOI/rents are login-gated. Unbelievable on its face: at 40-42% opex an $302k NOI needs ~$2,100/unit/month gross rent for 800 SF units, and the same asset was marketed in the prior scan at NOI $273,652 (6.09%) after a '7.04% actual' claim - the story keeps changing. Treated as pro-forma fluff; LOW confidence, not a qualifier. Verify with a T-12 and rent roll if interested."
    },
    {
      address: "3139 N 40th St, Phoenix AZ 85018 (\"Rare Arcadia Multi Family Opportunity\")",
      statedCapPct: 9.37,
      realCapPct: null,
      reason: "5 units, Class B. Marketing copy describes sober-living/residential-assisted-living use (>$5,000/unit/month) - specialty board-and-care income, not conventional apartment rent. Excluded as non-comparable. Reconfirmed 2026-09-29: still listed at $2,599,000 / 9.37% cap."
    },
    {
      address: "1429 N Scottsdale Rd, Tempe AZ 85288 (118 Unit Apartment Complex)",
      statedCapPct: null,
      realCapPct: null,
      reason: "$19,000,000 ask (~$161k/unit), 118 units. Currently operating as a hotel and 'in the process of being converted' to apartments - no rent roll or NOI, so no going-in cap exists. Conversion/entitlement play, not a stabilized multifamily comp. Excluded as non-comparable."
    }
  ],

  history: [
    { date: "2026-07-16", scanned: 110, qualifyingCount: 2, top: "Ocotillo +185bps" },
    { date: "2026-07-23a", scanned: 12, qualifyingCount: 1, top: "2916 E Monroe St +213bps (partial spot-check, page 1 of 128 only)" },
    { date: "2026-07-23b", scanned: 19, qualifyingCount: 3, top: "Encanto Bungalows +169bps (cap-rate>=5.75% filter shortlisted 43 of 128; 16 visible without login)" },
    { date: "2026-07-23c", scanned: 37, qualifyingCount: 9, top: "5035 N 23rd Ave +178bps (logged in, unlocked 33-34 of 43 shortlisted listings via a rotating/non-paginated results feed; ~7-9 of the 43 and ~85 outside the filter remain unreviewed)" },
    { date: "2026-07-23d", scanned: 52, qualifyingCount: 11, top: "5035 N 23rd Ave +178bps (swept the unfiltered 127-listing pool via 'NOI (High to Low)' sort — confirms every listing with disclosed real financials is now covered; remainder has no NOI/cap posted at all, unscreenable without contacting the broker)" },
    { date: "2026-09-09", scanned: 3, qualifyingCount: 0, top: "Spot-check only, not a full sweep — 45 listings currently match the 5.75%+ filter (pool has moved since July) but only 3 previously-flagged addresses were reopened for reconfirmation (Maryland Ave, Rare Arcadia, Campo Bello); all three unchanged from prior findings. The July 23 qualifying/near-miss lists (Ocotillo, Monroe St, Polk Terrace, etc.) were NOT rechecked this pass and may be stale (sold/repriced) — verify before acting on them." },
    { date: "2026-09-29", scanned: 27, qualifyingCount: 0, top: "Clubhouse at Arcadia +85bps (near miss). Headless scrape returned only the unfiltered 'Recommended' feed (pages 1-3, ~25 unique listings, 437 in pool) plus 8 detail pages; no cap-rate filter and most financials login-gated. Also reviewed, no flag: Macallister 5.04% actual vs 4.48% headline (Class A, +29bps), Alegre Park Tempe 5.75% (+35bps vs C), Row 31 in lease-up (~4.6% re-underwritten at $1,587 avg rent, Class A). Prior-scan qualifying/near-miss lists not re-scraped this run and dropped - verify individually before acting." }
  ]
};
