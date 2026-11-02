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
  "updated": "2026-11-02",
  "runs": [
    {
      "name": "3rd Street Apartments",
      "address": "8910-8912 N 3rd St, Phoenix AZ 85020",
      "zip": "85020",
      "bucket": "qualifying",
      "units": 10,
      "askingPrice": 1299000,
      "inPlaceNOI": 88600,
      "currentAvgRent": 1000,
      "currentAvgRentSource": "default",
      "rentPremium": 85,
      "rentPremiumSource": "default",
      "TAC": 1514934,
      "stabilizedValue": 1269738,
      "valueAddProfit": -245196,
      "profitMargin": -0.1619,
      "cashOnCash": 0.0014,
      "equityMultiple": 0.28,
      "noiVarianceFlag": true,
      "verdict": "INSUFFICIENT RENT DATA (zip not scanned yet)",
      "sourceUrl": "https://www.crexi.com/properties/2289585/arizona-8910-8912-n-3rd-st"
    },
    {
      "name": "Uptown Phoenix 9",
      "address": "5035 N 23rd Ave, Phoenix AZ 85015",
      "zip": "85015",
      "bucket": "qualifying",
      "units": 9,
      "askingPrice": 1699000,
      "inPlaceNOI": 122000,
      "currentAvgRent": 972,
      "currentAvgRentSource": "comp-derived (classic)",
      "rentPremium": 75,
      "rentPremiumSource": "comp-derived",
      "TAC": 1931073,
      "stabilizedValue": 1102741,
      "valueAddProfit": -828332,
      "profitMargin": -0.4289,
      "cashOnCash": -0.0481,
      "equityMultiple": -0.68,
      "noiVarianceFlag": true,
      "verdict": "DOES NOT PENCIL",
      "sourceUrl": "https://www.crexi.com/properties/2372857/arizona-5035-n-23rd-ave-phoenix-az-85015"
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
    },
    {
      "date": "2026-10-12",
      "dealsRun": 0,
      "pencilCount": 0,
      "topDeal": null
    },
    {
      "date": "2026-10-19",
      "dealsRun": 0,
      "pencilCount": 0,
      "topDeal": null
    },
    {
      "date": "2026-11-02",
      "dealsRun": 2,
      "pencilCount": 0,
      "topDeal": "3rd Street Apartments ($-245,196)"
    }
  ]
};
