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
  updated: "2026-10-05",
  listingsScanned: 9,
  benchmarks: { "A": 4.75, "B": 4.90, "C": 5.40, "2-4 unit": 5.50 },

  qualifying: [],

  nearMisses: [],

  disqualified: [
    {
      address: "1477 S Warner Dr, Apache Junction AZ 85120 (Mesquite Ranch RV Park)",
      statedCapPct: 6.11,
      realCapPct: null,
      reason: "$1,125,000 ask, 20 sites (17 RV, 2 MH, 1 apartment), Class C, Marcus & Millichap, 416 days on market. Stated NOI $68,761 (6.11%, +71bps vs Class C) is a broker underwrite at 53.73% expense ratio, but the park is only 64% occupied post-renovation with infill in progress, so it is pro forma, not actual. RV/MH park, not conventional multifamily - non-comparable. LOW confidence."
    },
    {
      address: "409 S Montezuma St, Prescott AZ 86303",
      statedCapPct: 5.4,
      realCapPct: null,
      reason: "$2,375,000 ask, hotel/apartment mixed use, outside Phoenix metro. Stated 5.40% cap, NOI gated, spread ~0bps vs Class C. Not a qualifier."
    },
    {
      address: "257-267 W 5 St, Yuma AZ 85364",
      statedCapPct: null,
      realCapPct: null,
      reason: "$788,000 ask, 8 units ($98.5k/unit), triplex plus 5 cottages, 196 days on market. No rents or NOI disclosed, cannot underwrite. Outside Phoenix metro."
    },
    {
      address: "1407 N Gilbert Ave, Casa Grande AZ 85122",
      statedCapPct: null,
      realCapPct: null,
      reason: "$995,000 ask, 6 units, ABI Multifamily. No rents or NOI disclosed, cannot underwrite. Outside Phoenix metro (Pinal County)."
    },
    {
      address: "Other listings in feed: 1022 S Hunter Creek Dr (Payson cabins), Surprise 10-bed assisted living home, 1082 W Picacho Dr (Williams land), 207 W Speedway Blvd (Tucson), 2873 N Edmond Dantes Ct (Tucson townhomes)",
      statedCapPct: null,
      realCapPct: null,
      reason: "Non-comparable: hospitality/cabin, assisted living business, vacant land/RV lot, unfinished townhomes, or outside the Phoenix metro. No financials disclosed."
    }
  ],

  history: [
    { date: "2026-07-16", scanned: 110, qualifyingCount: 2, top: "Ocotillo +185bps" },
    { date: "2026-07-23a", scanned: 12, qualifyingCount: 1, top: "2916 E Monroe St +213bps (partial spot-check, page 1 of 128 only)" },
    { date: "2026-07-23b", scanned: 19, qualifyingCount: 3, top: "Encanto Bungalows +169bps (cap-rate>=5.75% filter shortlisted 43 of 128; 16 visible without login)" },
    { date: "2026-07-23c", scanned: 37, qualifyingCount: 9, top: "5035 N 23rd Ave +178bps (logged in, unlocked 33-34 of 43 shortlisted listings via a rotating/non-paginated results feed; ~7-9 of the 43 and ~85 outside the filter remain unreviewed)" },
    { date: "2026-07-23d", scanned: 52, qualifyingCount: 11, top: "5035 N 23rd Ave +178bps (swept the unfiltered 127-listing pool via 'NOI (High to Low)' sort — confirms every listing with disclosed real financials is now covered; remainder has no NOI/cap posted at all, unscreenable without contacting the broker)" },
    { date: "2026-09-09", scanned: 3, qualifyingCount: 0, top: "Spot-check only, not a full sweep — 45 listings currently match the 5.75%+ filter (pool has moved since July) but only 3 previously-flagged addresses were reopened for reconfirmation (Maryland Ave, Rare Arcadia, Campo Bello); all three unchanged from prior findings. The July 23 qualifying/near-miss lists (Ocotillo, Monroe St, Polk Terrace, etc.) were NOT rechecked this pass and may be stale (sold/repriced) — verify before acting on them." },
    { date: "2026-09-29", scanned: 27, qualifyingCount: 0, top: "Clubhouse at Arcadia +85bps (near miss). Headless scrape returned only the unfiltered 'Recommended' feed (pages 1-3, ~25 unique listings, 437 in pool) plus 8 detail pages; no cap-rate filter and most financials login-gated. Also reviewed, no flag: Macallister 5.04% actual vs 4.48% headline (Class A, +29bps), Alegre Park Tempe 5.75% (+35bps vs C), Row 31 in lease-up (~4.6% re-underwritten at $1,587 avg rent, Class A). Prior-scan qualifying/near-miss lists not re-scraped this run and dropped - verify individually before acting." },
    { date: "2026-10-05", scanned: 9, qualifyingCount: 0, top: "No qualifiers, no near misses. Headless scrape again returned only the unfiltered 'Recommended' feed (438 in pool; 9 unique listings, most outside the Phoenix metro: Payson, Yuma, Prescott, Tucson, Williams, Casa Grande) plus 8 detail pages; no cap-rate filter and nearly all financials login-gated. Closest: Mesquite Ranch RV Park (Apache Junction) stated 6.11% = +71bps vs Class C, but 64% occupied, 20 sites, RV/MH specialty, so excluded. Prior near-miss (Clubhouse at Arcadia) and Signature 18 / Rare Arcadia / Tempe 118-unit not in this scrape and dropped - verify individually before acting." }
  ]
};
