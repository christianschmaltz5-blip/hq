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
  updated: "2026-10-19",
  listingsScanned: 12,
  benchmarks: { "A": 4.75, "B": 4.90, "C": 5.40, "2-4 unit": 5.50 },

  qualifying: [],

  nearMisses: [],

  disqualified: [
    {
      address: "3139 N 40th St, Phoenix AZ 85018 (Rare Arcadia Multi Family Opportunity)",
      statedCapPct: 9.37,
      realCapPct: null,
      reason: "$2,599,000 ask, 5 units. Stated 9.37% = +397bps vs Class C 5.40% on paper, but no rents/NOI visible in logged-out view (LOW confidence). Prior scans found the listing copy describes sober-living / assisted-living income (~$28k/mo), specialty board-and-care, not conventional apartment rent, so the spread measures the wrong asset class. Excluded; story note: specialty use."
    },
    {
      address: "1477 S Warner Dr, Apache Junction AZ 85120 (Mesquite Ranch RV Park)",
      statedCapPct: 6.11,
      realCapPct: null,
      reason: "$1,125,000 ask, 20 RV/MH sites. Carried from prior scan (6.11% stated, 64% occupied, pro forma); no cap shown in this run's feed. RV/MH park, outside conventional multifamily. LOW confidence."
    },
    {
      address: "Clubhouse at Arcadia ($12.247M, 43 units) and Arcadia 52 ($10.571M)",
      statedCapPct: null,
      realCapPct: null,
      reason: "Detail pages open but Cap Rate / NOI / Units are login-gated (asterisked); only Crexi's default 5.75% calculator placeholder shows, which is not a listing figure. Class B, 231 days on market. Cannot underwrite; prior near miss (Clubhouse +85bps) unverifiable this run."
    },
    {
      address: "Other listings in feed with no financials or non-comparable: 3044-3048 E Beck Ln ($1.65M, 8 units, 1983), 118-unit Scottsdale Rd Tempe ($19M, hotel conversion); land: The Capistrano Glendale ($18M), 903 & 909 N Miller Rd Tempe ($7.1M); rural/specialty: Lazy D Ranch Star Valley, Blue Sage Eagar, Dateland compound, Desert Ridge Quartzsite",
      statedCapPct: null,
      realCapPct: null,
      reason: "No cap rate, NOI or rents disclosed in the logged-out view (cannot underwrite), or land/hospitality/RV/specialty, or outside the Phoenix metro."
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
    { date: "2026-10-05", scanned: 9, qualifyingCount: 0, top: "No qualifiers, no near misses. Headless scrape again returned only the unfiltered 'Recommended' feed (438 in pool; 9 unique listings, most outside the Phoenix metro: Payson, Yuma, Prescott, Tucson, Williams, Casa Grande) plus 8 detail pages; no cap-rate filter and nearly all financials login-gated. Closest: Mesquite Ranch RV Park (Apache Junction) stated 6.11% = +71bps vs Class C, but 64% occupied, 20 sites, RV/MH specialty, so excluded. Prior near-miss (Clubhouse at Arcadia) and Signature 18 / Rare Arcadia / Tempe 118-unit not in this scrape and dropped - verify individually before acting." },
    { date: "2026-10-12", scanned: 19, qualifyingCount: 0, top: "No qualifiers, no near misses. Headless scrape again returned only the unfiltered 'Recommended' feed (439 in pool, 17 unique search listings plus 2 extra detail pages) with nearly all financials login-gated. Closest: 2719 W Maryland Ave (8 units, 1958) stated 7.82% but re-underwrites to 5.29% (-11bps vs Class C) at stated rents with 42% opex. Payson 2-home property stated 7.83% re-underwrites to 5.78% (+28bps, outside metro). Clubhouse at Arcadia (prior near miss) had no financials visible this run - verify individually." },
    { date: "2026-10-19", scanned: 12, qualifyingCount: 0, top: "No qualifiers, no near misses. Headless scrape again returned only the unfiltered 'Recommended' feed (430 in pool; 12 unique search listings, pages 1-2 populated, page 3 empty) plus 6 detail pages; nearly all financials login-gated. Only stated cap in feed: Rare Arcadia 9.37% (5 units), previously identified as sober-living/specialty income, excluded. Last week's 2719 W Maryland Ave and Payson 2-home property not in this scrape and dropped. Clubhouse at Arcadia (prior near miss) has no financials visible - verify individually." }
  ]
};
