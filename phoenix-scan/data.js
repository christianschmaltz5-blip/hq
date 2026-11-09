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
  updated: "2026-11-09",
  listingsScanned: 18,
  benchmarks: { "A": 4.75, "B": 4.90, "C": 5.40, "2-4 unit": 5.50 },

  qualifying: [
    {
      name: "2242 E Taylor St",
      address: "2242 E Taylor St, Phoenix AZ 85006",
      zip: "85006",
      ask: 639000,
      units: 5,
      cls: "C",
      noi: 56100,
      capPct: 8.78,
      spreadBps: 338,
      confidence: "LOW",
      notes: "Headline states '5 Units | $127k/Unit | 8.78% Current Cap Rate' (implied NOI ~$56.1k). No rents, P&L or year built visible, so the cap is unverified marketing. Story note (spread >=200bps): at $127k/unit in 85006 an 8.78% cap likely reflects deferred maintenance, understated expenses or pro forma figures; confirm rent roll and actual expenses.",
      url: "https://www.crexi.com/properties/search?term=2242%20E%20Taylor%20St%20Phoenix%20AZ%2085006"
    },
    {
      name: "Midtown Phoenix 8-unit (Fairmount)",
      address: "1017-1031 E Fairmount Ave, Phoenix AZ 85014",
      zip: "85014",
      ask: 1895000,
      units: 8,
      cls: "C",
      noi: 123200,
      capPct: 6.50,
      spreadBps: 110,
      confidence: "LOW",
      notes: "Headline states '8 Units | Midtown Phoenix | 6.50% Current Cap Rate' (implied NOI ~$123.2k, $237k/unit). No rents or P&L visible, so unverified; class assumed C as no year built shown.",
      url: "https://www.crexi.com/properties/search?term=1017%20E%20Fairmount%20Ave%20Phoenix%20AZ%2085014"
    }
  ],

  nearMisses: [],

  disqualified: [
    {
      address: "1477 S Warner Dr, Apache Junction AZ 85120 (Mesquite Ranch RV Park)",
      statedCapPct: null,
      realCapPct: null,
      reason: "$1,125,000 ask, 20 RV sites ($53k/site). No cap shown in this run's feed. RV park, outside conventional multifamily."
    },
    {
      address: "No financials disclosed (cannot underwrite): 1747 E Virginia Ave Phoenix ($825k, 4 units); 3020 E Yale St Phoenix ($759k, triplex); The Mojave, 2020 W Orangewood Ave ($3.895M, 27 units, 1986); Clubhouse at Arcadia ($11.8M, 43 units); Arcadia 52 ($10.1M); 118-unit 1429 N Scottsdale Rd Tempe ($19M)",
      statedCapPct: null,
      realCapPct: null,
      reason: "No cap rate, NOI or rents in the logged-out view."
    },
    {
      address: "Land: The Capistrano Glendale ($18M), 903 & 909 N Miller Rd Tempe ($7.1M), I-17 Corridor land. Outside metro/specialty: Bouse RV Park, Globe retail+2 apts, 113 & 119 E District St Tucson quadplex, Jerome 3-unit, Whispering Pines Resort Pinetop, Patton's Playground RV Salome",
      statedCapPct: null,
      realCapPct: null,
      reason: "Land, hospitality/RV/specialty, or outside the Phoenix metro; no financials to underwrite."
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
    { date: "2026-10-19", scanned: 12, qualifyingCount: 0, top: "No qualifiers, no near misses. Headless scrape again returned only the unfiltered 'Recommended' feed (430 in pool; 12 unique search listings, pages 1-2 populated, page 3 empty) plus 6 detail pages; nearly all financials login-gated. Only stated cap in feed: Rare Arcadia 9.37% (5 units), previously identified as sober-living/specialty income, excluded. Last week's 2719 W Maryland Ave and Payson 2-home property not in this scrape and dropped. Clubhouse at Arcadia (prior near miss) has no financials visible - verify individually." },
    { date: "2026-11-02", scanned: 16, qualifyingCount: 2, top: "5035 N 23rd Ave +178bps (Class C, 9 units, broker-stated 2025 NOI $122k = 7.18%, MEDIUM) and 8910-8912 N 3rd St +142bps (Class C, 10 units, 6.82% stated, LOW; calculator shows 7.85% likely pro forma). Headless scrape again returned only the unfiltered 'Recommended' feed (442 in pool; 12 unique search listings plus 4 extra detail pages); most financials login-gated and nothing independently verified. Tucson Benson Hwy 7.61% (+221bps) excluded as outside the Phoenix metro. Clubhouse at Arcadia (prior near miss) not in this scrape and dropped - verify individually." },
    { date: "2026-11-09", scanned: 18, qualifyingCount: 2, top: "2242 E Taylor St +338bps (5 units, Class C, 8.78% stated, LOW, unverified) and 1017-1031 E Fairmount Ave +110bps (8 units, 6.50% stated, LOW). Headless scrape again returned only the unfiltered 'Recommended' feed (451 in pool; 18 unique search listings, 6 detail pages all outside the metro); no financials visible, nothing independently verified. 5035 N 23rd Ave and 8910-8912 N 3rd St (last week's qualifiers) not in this scrape and dropped - verify individually." }
  ]
};
