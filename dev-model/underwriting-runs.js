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
  "updated": "2026-11-09",
  "runs": [
    {
      "name": "2242 E Taylor St",
      "address": "2242 E Taylor St, Phoenix AZ 85006",
      "zip": "85006",
      "bucket": "qualifying",
      "units": 5,
      "askingPrice": 639000,
      "inPlaceNOI": 56100,
      "currentAvgRent": 1000,
      "currentAvgRentSource": "default",
      "rentPremium": 85,
      "rentPremiumSource": "default",
      "TAC": 766993,
      "stabilizedValue": 634869,
      "valueAddProfit": -132124,
      "profitMargin": -0.1723,
      "cashOnCash": -0.0005,
      "equityMultiple": 0.24,
      "noiVarianceFlag": true,
      "verdict": "INSUFFICIENT RENT DATA (zip not scanned yet)",
      "sourceUrl": "https://www.crexi.com/properties/search?term=2242%20E%20Taylor%20St%20Phoenix%20AZ%2085006"
    },
    {
      "name": "Midtown Phoenix 8-unit (Fairmount)",
      "address": "1017-1031 E Fairmount Ave, Phoenix AZ 85014",
      "zip": "85014",
      "bucket": "qualifying",
      "units": 8,
      "askingPrice": 1895000,
      "inPlaceNOI": 123200,
      "currentAvgRent": 1000,
      "currentAvgRentSource": "default",
      "rentPremium": 85,
      "rentPremiumSource": "default",
      "TAC": 2130280,
      "stabilizedValue": 1015790,
      "valueAddProfit": -1114489,
      "profitMargin": -0.5232,
      "cashOnCash": -0.0655,
      "equityMultiple": -1.02,
      "noiVarianceFlag": true,
      "verdict": "INSUFFICIENT RENT DATA (zip not scanned yet)",
      "sourceUrl": "https://www.crexi.com/properties/search?term=1017%20E%20Fairmount%20Ave%20Phoenix%20AZ%2085014"
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
    },
    {
      "date": "2026-11-09",
      "dealsRun": 2,
      "pencilCount": 0,
      "topDeal": "2242 E Taylor St ($-132,124)"
    }
  ]
};
