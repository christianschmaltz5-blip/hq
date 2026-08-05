#!/usr/bin/env node
// Auto-underwriting agent — runs the Dev Underwriting Model's calc engine
// against every deal in phoenix-scan/data.js, using real rent-comps.js
// evidence where available, and writes a fresh results file.
//
// Unlike phx_cap_scan / rent_comps, this is NOT a Claude agent — it's pure
// deterministic math (same calc.js the browser uses), so there's nothing
// for an LLM to judge and no browser dependency. A plain scheduled script
// is the right tool here, not an LLM call.
//
// ponytail: no CLI framework, no config file — one script, flat logic.

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { execSync } = require("child_process");

const ROOT = "/Users/christianschmaltz/hq";

function loadWindowData(relPath, varName) {
  const code = fs.readFileSync(path.join(ROOT, relPath), "utf8");
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return sandbox.window[varName];
}

global.window = global.window || {};
const { calcDevModel } = require(path.join(ROOT, "dev-model/calc.js"));
const DEFAULTS = global.window.DEV_MODEL_DEFAULTS;

const phxScan = loadWindowData("phoenix-scan/data.js", "PHX_SCAN") || { qualifying: [], nearMisses: [] };
const rentComps = loadWindowData("dev-model/rent-comps.js", "RENT_COMPS") || { comps: [] };

function compsForZip(zip) {
  return (rentComps.comps || []).filter((c) => c.zip === zip);
}

// Blended renovation premium: average $ delta across every same-property,
// same-unitType Classic/Renovated pair found in this zip.
function derivePremium(zip) {
  const comps = compsForZip(zip);
  const byKey = {};
  for (const c of comps) {
    const key = c.property + "|" + c.unitType;
    (byKey[key] = byKey[key] || []).push(c);
  }
  const deltas = [];
  for (const key in byKey) {
    const group = byKey[key];
    const classic = group.find((c) => c.tier === "Classic");
    const renovated = group.find((c) => c.tier === "Renovated");
    if (classic && renovated) deltas.push(renovated.rent - classic.rent);
  }
  if (!deltas.length) return { value: DEFAULTS.rentPremium, source: "default", n: 0 };
  const avg = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  return { value: Math.round(avg), source: "comp-derived", n: deltas.length };
}

// Current (un-renovated) rent: average of Classic-tier comps in this zip;
// falls back to all comps in zip if none are explicitly tiered.
function deriveCurrentRent(zip) {
  const comps = compsForZip(zip);
  if (!comps.length) return { value: DEFAULTS.currentAvgRent, source: "default", n: 0 };
  const classicOnly = comps.filter((c) => c.tier === "Classic");
  const pool = classicOnly.length ? classicOnly : comps;
  const avg = pool.reduce((a, c) => a + c.rent, 0) / pool.length;
  return { value: Math.round(avg), source: classicOnly.length ? "comp-derived (classic)" : "comp-derived (all tiers)", n: pool.length };
}

function underwrite(deal) {
  const premium = derivePremium(deal.zip);
  const currentRent = deriveCurrentRent(deal.zip);

  const inputs = Object.assign({}, DEFAULTS, {
    address: deal.address,
    units: deal.units,
    askingPrice: deal.ask,
    propertyClass: deal.cls,
    inPlaceNOI: deal.noi != null ? deal.noi : null,
    currentAvgRent: currentRent.value,
    rentPremium: premium.value,
    unitsToRenovate: deal.units,
  });

  const r = calcDevModel(inputs);

  // If neither rent input has real comp evidence for this zip, the profit
  // number is computed off a flat fallback default — not a real signal.
  // Report it as data-insufficient rather than a fake verdict, otherwise
  // every un-scanned zip silently reads as "bad deal" when it's really
  // just "no rent comps yet."
  const hasRealRentData = currentRent.source !== "default" || premium.source !== "default";

  let verdict;
  if (!hasRealRentData) verdict = "INSUFFICIENT RENT DATA (zip not scanned yet)";
  else if (r.valueAddProfit <= 0) verdict = "DOES NOT PENCIL";
  else if (r.noiVarianceFlag) verdict = "PENCILS — BUT VERIFY (NOI mismatch)";
  else verdict = "PENCILS";

  return {
    name: deal.name,
    address: deal.address,
    zip: deal.zip,
    units: deal.units,
    askingPrice: deal.ask,
    inPlaceNOI: deal.noi,
    currentAvgRent: currentRent.value,
    currentAvgRentSource: currentRent.source,
    rentPremium: premium.value,
    rentPremiumSource: premium.source,
    TAC: Math.round(r.TAC),
    stabilizedValue: Math.round(r.stabilizedValue),
    valueAddProfit: Math.round(r.valueAddProfit),
    profitMargin: Number(r.profitMargin.toFixed(4)),
    cashOnCash: Number(r.cashOnCash.toFixed(4)),
    equityMultiple: Number(r.equityMultiple.toFixed(2)),
    noiVarianceFlag: r.noiVarianceFlag,
    verdict,
    sourceUrl: deal.url,
  };
}

const allDeals = [...(phxScan.qualifying || []), ...(phxScan.nearMisses || [])];
const runs = allDeals.map(underwrite).sort((a, b) => b.valueAddProfit - a.valueAddProfit);

const today = new Date().toISOString().slice(0, 10);
const pencilCount = runs.filter((r) => r.verdict === "PENCILS").length;
const topDeal = runs[0] ? `${runs[0].name} ($${runs[0].valueAddProfit.toLocaleString()})` : null;

const outPath = path.join(ROOT, "dev-model/underwriting-runs.js");
let history = [];
if (fs.existsSync(outPath)) {
  try {
    history = loadWindowData("dev-model/underwriting-runs.js", "UNDERWRITING_RUNS").history || [];
  } catch (e) {
    history = [];
  }
}
history.push({ date: today, dealsRun: runs.length, pencilCount, topDeal });

const fileContents = `// Auto-underwriting results — written by agents/auto_underwrite/run.js
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

window.UNDERWRITING_RUNS = ${JSON.stringify({ updated: today, runs, history }, null, 2)};
`;

fs.writeFileSync(outPath, fileContents);

console.log(`Underwrote ${runs.length} deals — ${pencilCount} pencil. Top: ${topDeal || "n/a"}`);

// publish
try {
  execSync("git add dev-model/underwriting-runs.js", { cwd: ROOT });
  execSync(
    `git commit -m "Auto-underwrite: weekly run ${today}\n\nCo-Authored-By: Claude Fable 5 <noreply@anthropic.com>"`,
    { cwd: ROOT }
  );
  execSync("git push", { cwd: ROOT });
  console.log("Committed and pushed.");
} catch (e) {
  console.log("Nothing to commit or push failed:", e.message);
}
