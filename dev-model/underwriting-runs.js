// Auto-underwriting results — written by agents/auto_underwrite/run.js
// (a plain scheduled script, not an LLM agent — this is deterministic math,
// same calc.js the browser page uses, run against every phx_cap_scan deal).
//
// window.UNDERWRITING_RUNS = {
//   updated: "YYYY-MM-DD",
//   runs: [{ name, address, zip, units, askingPrice, inPlaceNOI,
//            currentAvgRent, currentAvgRentSource, rentPremium, rentPremiumSource,
//            TAC, stabilizedValue, valueAddProfit, profitMargin, cashOnCash,
//            equityMultiple, noiVarianceFlag, verdict, sourceUrl }],
//   history: [{ date, dealsRun, pencilCount, topDeal }]
// };

window.UNDERWRITING_RUNS = {
  "updated": "2026-10-05",
  "runs": [
    {
      "name": "Clubhouse at Arcadia",
      "address": "2620 N 40th St",
      "zip": "85008",
      "bucket": "nearMiss",
      "units": 43,
      "askingPrice": 12247000,
      "inPlaceNOI": 704197,
      "currentAvgRent": 1000,
      "currentAvgRentSource": "default",
      "rentPremium": 85,
      "rentPremiumSource": "default",
      "TAC": 13461262,
      "stabilizedValue": 5459874,
      "valueAddProfit": -8001389,
      "profitMargin": -0.5944,
      "cashOnCash": -0.0787,
      "equityMultiple": -1.28,
      "noiVarianceFlag": true,
      "verdict": "INSUFFICIENT RENT DATA (zip not scanned yet)",
      "sourceUrl": "https://www.crexi.com/properties/2370896/arizona-clubhouse-at-arcadia"
    }
  ],
  "history": [
    {
      "date": "2026-08-05",
      "dealsRun": 25,
      "pencilCount": 0,
      "topDeal": "2916 E Monroe St ($-87,530)"
    },
    {
      "date": "2026-08-05",
      "dealsRun": 25,
      "pencilCount": 0,
      "topDeal": "2916 E Monroe St ($-87,530)"
    },
    {
      "date": "2026-08-05",
      "dealsRun": 25,
      "pencilCount": 0,
      "topDeal": "2916 E Monroe St ($-87,530)"
    },
    {
      "date": "2026-08-10",
      "dealsRun": 25,
      "pencilCount": 0,
      "topDeal": "2916 E Monroe St ($-87,530)"
    },
    {
      "date": "2026-08-17",
      "dealsRun": 25,
      "pencilCount": 0,
      "topDeal": "2916 E Monroe St ($-87,530)"
    },
    {
      "date": "2026-08-20",
      "dealsRun": 25,
      "pencilCount": 0,
      "topDeal": "2916 E Monroe St ($-87,530)"
    },
    {
      "date": "2026-08-24",
      "dealsRun": 25,
      "pencilCount": 0,
      "topDeal": "2916 E Monroe St ($-87,530)"
    },
    {
      "date": "2026-08-31",
      "dealsRun": 25,
      "pencilCount": 0,
      "topDeal": "2916 E Monroe St ($-87,530)"
    },
    {
      "date": "2026-09-07",
      "dealsRun": 25,
      "pencilCount": 0,
      "topDeal": "2916 E Monroe St ($-87,530)"
    },
    {
      "date": "2026-09-14",
      "dealsRun": 25,
      "pencilCount": 0,
      "topDeal": "2916 E Monroe St ($-87,530)"
    },
    {
      "date": "2026-09-21",
      "dealsRun": 25,
      "pencilCount": 0,
      "topDeal": "2916 E Monroe St ($-87,530)"
    },
    {
      "date": "2026-10-05",
      "dealsRun": 1,
      "pencilCount": 0,
      "topDeal": "Clubhouse at Arcadia ($-8,001,389)"
    }
  ]
};
