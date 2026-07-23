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
  listingsScanned: 36,
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
    },
    {
      name: "Polk Terrace",
      address: "338 N 23rd St",
      zip: "85006",
      ask: 3895000,
      units: 30,
      cls: "C",
      noi: null,
      capPct: 6.76,
      spreadBps: 136,
      confidence: "MEDIUM",
      notes: "Built 1985, 90% occupied, listed by Newmark. Stated current cap 6.76% (separate from a higher 7.03% pro-forma) — more credible than a small independent listing since a major institutional brokerage is putting its name on the current number, but still no rent roll disclosed to independently verify. Verify: request trailing rent roll before treating as confirmed.",
      url: "https://www.crexi.com/properties/1469283/Phoenix-AZ-85006"
    },
    {
      name: "Encanto Bungalows",
      address: "1801-1807 N 25th Pl",
      zip: "85008",
      ask: 1575000,
      units: 7,
      cls: "C",
      noi: null,
      capPct: 7.09,
      spreadBps: 169,
      confidence: "LOW",
      notes: "7 stand-alone cottage units, built 1958, renovated 2022, 100% occupied. Stated cap only — no NOI or rent disclosed to sanity-check. Verify before treating as real.",
      url: "https://www.crexi.com/properties/2559722/Phoenix-AZ-85008"
    },
    {
      name: "Missouri Apartments",
      address: "825 E Missouri Ave",
      zip: "85014",
      ask: 2709000,
      units: 10,
      cls: "B",
      noi: 162499,
      capPct: 6.00,
      spreadBps: 110,
      confidence: "MEDIUM",
      notes: "Built 1954, fully renovated 2019, 100% occupied, listed by CBRE. Real dollar NOI disclosed ($162,499) — institutional brokerage backing this current number adds credibility, but still no independent rent-roll verification. Clears the +100bps line by only 10bps, so treat as marginal.",
      url: "https://www.crexi.com/properties/2372766/Phoenix-AZ-85014"
    },
    {
      name: "5035 N 23rd Ave",
      address: "5035 N 23rd Ave",
      zip: "85015",
      ask: 1699000,
      units: 9,
      cls: "C",
      noi: 122000,
      capPct: 7.18,
      spreadBps: 178,
      confidence: "HIGH",
      notes: "9 units across 7 buildings, built 1929-1962, renovated 2022, 97% occupied. NOI is explicitly stated as actual trailing 2025 P&L (not pro-forma) — the strongest confidence basis of anything found this scan.",
      url: "https://www.crexi.com/properties/2372857/Phoenix-AZ-85015"
    },
    {
      name: "Central Park Villas",
      address: "4128 N 10th St",
      zip: "85014",
      ask: 2873000,
      units: 10,
      cls: "B",
      noi: 172335,
      capPct: 6.00,
      spreadBps: 110,
      confidence: "MEDIUM",
      notes: "Built 1966, renovated 2020, 100% occupied, listed by CBRE. Real dollar NOI disclosed ($172,335). Same marginal +110bps clearance as Missouri Apartments, same broker.",
      url: "https://www.crexi.com/properties/2372784/Phoenix-AZ-85014"
    },
    {
      name: "3rd Street Apartments",
      address: "8910-8912 N 3rd St",
      zip: "85020",
      ask: 1500000,
      units: 10,
      cls: "C",
      noi: 102000,
      capPct: 6.8,
      spreadBps: 140,
      confidence: "MEDIUM",
      notes: "Built 1945, renovated 2025, 100% occupied. Real dollar NOI disclosed ($102,000). Pro-forma cap is 8.00% — this figure is the current/actual, not the upside case.",
      url: "https://www.crexi.com/properties/2289585/Phoenix-AZ-85020"
    },
    {
      name: "Urbana @ 39th",
      address: "2936 N 39th St",
      zip: "85018",
      ask: 3100000,
      units: 14,
      cls: "A",
      noi: 180651,
      capPct: 5.83,
      spreadBps: 108,
      confidence: "MEDIUM",
      notes: "Built 1983, renovated 2025, 100% occupied, listed by Newmark. Real NOI disclosed, and current cap exactly matches the pro-forma (5.83% both) — meaning it's already fully stabilized, not a value-add story. Clears the line by only 8bps.",
      url: "https://www.crexi.com/properties/2419649/Phoenix-AZ-85018"
    },
    {
      name: "3044-3048 E Beck Ln",
      address: "3044-3048 E Beck Ln",
      zip: "85032",
      ask: 1800000,
      units: 8,
      cls: "B",
      noi: null,
      capPct: 6.20,
      spreadBps: 130,
      confidence: "LOW",
      notes: "Built 1983. Stated cap only, no NOI/rent disclosed. The listing's own marketing text is internally inconsistent — calls the neighborhood 'stable Class B' in one sentence and the building itself 'Class C' in the next. Verify before trusting.",
      url: "https://www.crexi.com/properties/2257563/Phoenix-AZ-85032"
    }
  ],

  nearMisses: [
    {
      name: "Alameda Villas",
      address: "3805 E Monterey Wy",
      zip: "85018",
      ask: 9250000,
      units: 15,
      cls: "A",
      noi: 516426,
      capPct: 5.58,
      spreadBps: 83,
      confidence: "MEDIUM",
      notes: "Built 2024, Class A. The listing's own 'Details' field states a stale 6.00% cap rate, but the disclosed NOI ($516,426) divided by ask ($9,250,000) is actually 5.58% — matching Crexi's own auto-calculated valuation box, not the headline number. A real discrepancy between the marketed label and the math — always compute from disclosed NOI/ask rather than trusting the stated cap field.",
      url: "https://www.crexi.com/properties/1521990/Phoenix-AZ-85018"
    },
    {
      name: "4429 N 53rd Ln",
      address: "4429 N 53rd Ln",
      zip: "85031",
      ask: 615000,
      units: 4,
      cls: "2-4 unit",
      noi: 39375,
      capPct: 6.40,
      spreadBps: 90,
      confidence: "MEDIUM",
      notes: "4 units, built 1973, 100% occupied. Real dollar NOI disclosed ($39,375). Falls in the 2-4 unit tier (5.50% benchmark) — 6.40% cap is +90bps, just 10bps short of the +100bps qualify line.",
      url: "https://www.crexi.com/properties/2604987/PHOENIX-AZ-85031"
    },
    {
      name: "102 E Hatcher Rd & 9404 E 2nd Pl",
      address: "102 E Hatcher Rd",
      zip: "85020",
      ask: 1500000,
      units: 8,
      cls: "C",
      noi: null,
      capPct: 6.21,
      spreadBps: 81,
      confidence: "LOW",
      notes: "8 units, built 1948, renovated 2022. The listing's own text conflates 'current' and 'pro-forma' cap (both shown as 6.21%), and the marketing copy explicitly calls it a target to 'achieve' — meaning the 6.21% is likely aspirational, not actual trailing performance. No dollar NOI disclosed. Verify actual current rents before trusting this number at all.",
      url: "https://www.crexi.com/properties/2559723/Phoenix-AZ-85020"
    },
    {
      name: "746 W Coolidge St",
      address: "746 W Coolidge St",
      zip: "85013",
      ask: 999000,
      units: 4,
      cls: "2-4 unit",
      noi: null,
      capPct: 6.20,
      spreadBps: 70,
      confidence: "LOW",
      notes: "4 units across 3 buildings on one lot, only 75% occupied — yet the stated 'current' cap (6.20%) barely differs from the pro-forma (6.19%/$61,824 NOI), which is inconsistent with a partially-vacant property. Likely priced off asking rents rather than actual trailing collections. Verify real occupancy/rent roll before trusting.",
      url: "https://www.crexi.com/properties/2552039/Phoenix-AZ-85013"
    },
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
    },
    {
      name: "Arcadia 52",
      address: "2930 N 52nd St",
      zip: "85018",
      ask: 10571000,
      units: 34,
      cls: "B",
      noi: 607798,
      capPct: 5.75,
      spreadBps: 85,
      confidence: "MEDIUM",
      notes: "Built 1979, renovated 2020, 100% occupied, listed by CBRE. Real dollar NOI disclosed ($607,798). Just short of the 5.90% Class B qualify line.",
      url: "https://www.crexi.com/properties/2370868/Phoenix-AZ-85018"
    },
    {
      name: "Northern Palms & Augusta Cove",
      address: "2820-2844 W Augusta Ave / 2835 W Northern Ave",
      zip: "85051",
      ask: 13000000,
      units: 95,
      cls: "C",
      noi: 776458,
      capPct: 5.97,
      spreadBps: 57,
      confidence: "MEDIUM",
      notes: "Two adjacent apartment communities (45u + 50u) sold as a combined 95-unit portfolio, 97% occupied, listed by CBRE. Real dollar NOI disclosed ($776,458).",
      url: "https://www.crexi.com/properties/2318285/Phoenix-AZ-85051"
    },
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
      notes: "Built 1951, renovated 2018, 100% occupied, listed by CBRE. Real dollar NOI disclosed ($704,197). Same spread as Arcadia 52 — same broker, same submarket.",
      url: "https://www.crexi.com/properties/2370896/Phoenix-AZ-85008"
    },
    {
      name: "Willetta",
      address: "1412 N 35th St",
      zip: "85008",
      ask: 4000000,
      units: 28,
      cls: "C",
      noi: 255219,
      capPct: 6.38,
      spreadBps: 98,
      confidence: "MEDIUM",
      notes: "Built 1960, 96.4% occupied, listed by Marcus & Millichap, price already reduced 20%. Real dollar NOI disclosed ($255,219) — just 2bps short of the +100bps qualify line.",
      url: "https://www.crexi.com/properties/2321086/Phoenix-AZ-85008"
    },
    {
      name: "Signature 18 Apartments",
      address: "2014 W Berridge Ln",
      zip: "85015",
      ask: 4495000,
      units: 18,
      cls: "C",
      noi: 273652,
      capPct: 6.09,
      spreadBps: 69,
      confidence: "MEDIUM",
      notes: "Built 1961, renovated 2023, 100% occupied. Discrepancy caught: the marketing text claims a '7.04% actual cap rate in 2025,' but disclosed NOI ÷ ask actually works out to 6.09%, matching the listing's own structured Details/valuation fields. Used the verified math (6.09%), not the marketing claim.",
      url: "https://www.crexi.com/properties/2501366/Phoenix-AZ-85015"
    },
    {
      name: "East Taylor Apartments",
      address: "2238 E Taylor St",
      zip: "85006",
      ask: 1400000,
      units: 10,
      cls: "C",
      noi: 85000,
      capPct: 6.07,
      spreadBps: 67,
      confidence: "MEDIUM",
      notes: "Built 1943, only 70% occupied. Real dollar NOI disclosed ($85,000) reflecting current partial occupancy — pro-forma at stabilization is 7.86%, but this is the going-in number at actual current performance, per our own methodology.",
      url: "https://www.crexi.com/properties/2461527/Phoenix-AZ-85006"
    },
    {
      name: "Downtown Phoenix Duplex Portfolio",
      address: "917 S 5th Ave & 1024 S 4th Ave",
      zip: "85003",
      ask: 670000,
      units: 2,
      cls: "2-4 unit",
      noi: 42600,
      capPct: 6.36,
      spreadBps: 86,
      confidence: "MEDIUM",
      notes: "Two individually-priced duplexes (part of a larger 3-duplex/6-unit portfolio), built 2021, 100% occupied, $335,000/unit each, identical terms. Real dollar NOI disclosed ($42,600 each).",
      url: "https://www.crexi.com/properties/2368389/Phoenix-AZ-85003"
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
    },
    {
      address: "1800 West Van Buren Street, Phoenix AZ 85007",
      statedCapPct: 8.71,
      realCapPct: null,
      reason: "Blended retail + multifamily NNN portfolio (8 multifamily units + 10 retail suites across 4 buildings), NOI $444,377 on $5,100,000 ask. The high 8.71% blended cap is driven mainly by the NNN retail component, not the residential units — not a comparable pure-multifamily going-in cap. Excluded as non-comparable."
    },
    {
      address: "Three on Taylor, 2142 E Taylor St, Phoenix AZ 85006",
      statedCapPct: 7.12,
      realCapPct: 3.92,
      reason: "3 units, built 1956, 100% occupied. Stated NOI ($32,048) is nearly identical to the sum of the listing's own disclosed current rents ($925+$950+$795 = $2,670/mo = $32,040/yr) — meaning the 'NOI' field has essentially zero expenses subtracted, not a real net figure. Re-underwritten at 5% vacancy / 42% opex: NOI ≈ $17,654, real cap ≈3.92% — well below the 5.50% 2-4 unit benchmark."
    },
    {
      address: "4 on Culver St, 1318 E Culver St, Phoenix AZ 85006",
      statedCapPct: 5.8,
      realCapPct: null,
      reason: "4 units, built 1985. The listing's own structured 'Details' field states NOI $44,614 (5.8% cap), but the marketing description in the same listing states 'current NOI of $39,504' (5.13% cap) — two different NOI figures for the same property that don't reconcile with each other. Neither clears the 5.50% 2-4 unit benchmark by a meaningful margin. Excluded pending a real rent roll."
    },
    {
      address: "Building 12, 4037 S 12th St, Phoenix AZ 85040",
      statedCapPct: 9.56,
      realCapPct: null,
      reason: "2 units, built 2025 (brand new). Looked like a standout at 9.56%, but the listing itself admits the rental data covers only 'the past few months from when the certificate of occupancy was obtained' — a short lease-up snapshot, not stabilized trailing performance. Not a reliable going-in number. One of 12 buildings/24 units in a larger portfolio being sold piecemeal."
    },
    {
      address: "\"15 Unit Complex with 8% IRR\", 3804 E Monterey Wy, Phoenix AZ 85018",
      statedCapPct: null,
      realCapPct: null,
      reason: "Duplicate listing of Alameda Villas (already recorded, 3805 E Monterey Wy) — same 15-unit community, same $9,250,000 price, marketing text literally says 'Introducing Alameda Villas.' Not a separate comp; excluded to avoid double-counting."
    }
  ],

  history: [
    { date: "2026-07-16", scanned: 110, qualifyingCount: 2, top: "Ocotillo +185bps" },
    { date: "2026-07-23a", scanned: 12, qualifyingCount: 1, top: "2916 E Monroe St +213bps (partial spot-check, page 1 of 128 only)" },
    { date: "2026-07-23b", scanned: 19, qualifyingCount: 3, top: "Encanto Bungalows +169bps (cap-rate>=5.75% filter shortlisted 43 of 128; 16 visible without login)" },
    { date: "2026-07-23c", scanned: 36, qualifyingCount: 9, top: "5035 N 23rd Ave +178bps (logged in, unlocked 33 of 43 shortlisted listings; ~7 of the 43 and ~85 outside the filter still unreviewed)" }
  ]
};
