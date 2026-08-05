// Dev Underwriting Model — DOM wiring. Reads calc.js, renders inputs/outputs,
// wires the PHX_SCAN deal picker and RENT_COMPS renovation-premium evidence.
(function () {
  const D = window.PHX_SCAN || { qualifying: [], nearMisses: [] };
  const RC = (window.RENT_COMPS && window.RENT_COMPS.comps) || [];
  const state = Object.assign({}, window.DEV_MODEL_DEFAULTS);

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
  function money(n) { return n == null || isNaN(n) ? "—" : "$" + Math.round(n).toLocaleString(); }
  function pct1(n) { return n == null || isNaN(n) ? "—" : (n * 100).toFixed(1) + "%"; }
  function num1(n) { return n == null || isNaN(n) ? "—" : Number(n).toLocaleString(undefined, { maximumFractionDigits: 1 }); }

  // ── Field config: [key, label, kind] — kind: 'text' | 'num' | 'pct' | 'noi' ──
  const SECTIONS = [
    ["Deal Basics", [
      ["address", "Address", "text"],
      ["propertyClass", "Property Class", "text"],
      ["yearBuilt", "Year Built", "text"],
      ["units", "Units", "num"],
      ["askingPrice", "Asking Price ($)", "num"],
      ["currentOccupancy", "Current Occupancy", "pct"],
      ["inPlaceNOI", "In-Place Trailing NOI ($, blank if undisclosed)", "noi"],
      ["currentAvgRent", "Current Avg Rent ($/mo)", "num"],
    ]],
    ["Renovation & Capex", [
      ["unitsToRenovate", "Units to Renovate", "num"],
      ["renoCostPerUnit", "Reno Cost per Unit ($)", "num"],
      ["otherCapex", "Other Capex ($)", "num"],
      ["rentPremium", "Rent Premium per Renovated Unit ($/mo)", "num"],
      ["renoTimelineMonths", "Renovation Timeline (months)", "num"],
      ["renoContingencyPct", "Renovation Contingency", "pct"],
    ]],
    ["Stabilized Operations & Exit", [
      ["stabilizedVacancy", "Stabilized Vacancy", "pct"],
      ["opexRatio", "OpEx Ratio", "pct"],
      ["rentGrowth", "Rent Growth (annual)", "pct"],
      ["exitCapRate", "Exit Cap Rate", "pct"],
      ["sellingCostPct", "Selling Cost", "pct"],
    ]],
    ["Financing", [
      ["ltc", "Loan-to-Cost (LTC)", "pct"],
      ["loanRate", "Loan Rate (interest-only)", "pct"],
      ["loanFeePct", "Loan Fee", "pct"],
      ["holdYears", "Hold Period (years)", "num"],
      ["closingCostPct", "Closing Cost", "pct"],
      ["sponsorFeePct", "Sponsor Fee", "pct"],
      ["workingCapitalPct", "Working Capital Reserve", "pct"],
    ]],
    ["Diligence Line Items", [
      ["surveyCost", "Survey Cost ($)", "num"],
      ["geotechCost", "Geotech Cost ($)", "num"],
      ["utilityDeposit", "Utility Deposit ($)", "num"],
      ["bondCost", "Bond Cost ($)", "num"],
    ]],
    ["Waterfall", [
      ["preferredReturn", "Preferred Return", "pct"],
      ["sponsorPromotePct", "Sponsor Promote", "pct"],
      ["sponsorEquityShare", "Sponsor Equity Share", "pct"],
    ]],
  ];

  // ── Render input form ──────────────────────────────────────────────
  function fieldHtml(key, label, kind) {
    const raw = state[key];
    let val;
    if (kind === "pct") val = raw == null ? "" : (raw * 100);
    else val = raw == null ? "" : raw;
    const type = kind === "text" ? "text" : "number";
    const step = kind === "pct" ? "0.1" : "any";
    const note = key === "inPlaceNOI" && (raw == null || raw === "")
      ? `<div class="dm-note">NOI not disclosed — verify before underwriting.</div>` : "";
    return `<label class="dm-field">
      <span>${esc(label)}</span>
      <input type="${type}" step="${step}" data-key="${key}" data-kind="${kind}" value="${esc(val)}">
      ${note}
    </label>`;
  }

  function renderInputs() {
    document.getElementById("dm-inputs").innerHTML = SECTIONS.map(([title, fields]) => `
      <div class="card">
        <div class="card-head"><h2>${esc(title)}</h2></div>
        <div class="dm-grid">${fields.map(([k, l, kind]) => fieldHtml(k, l, kind)).join("")}</div>
      </div>`).join("");

    document.querySelectorAll("#dm-inputs input").forEach(inp => {
      inp.addEventListener("input", () => {
        const key = inp.dataset.key, kind = inp.dataset.kind;
        let v = inp.value;
        if (kind === "text") state[key] = v;
        else if (v === "") state[key] = (key === "inPlaceNOI" ? null : 0);
        else state[key] = kind === "pct" ? parseFloat(v) / 100 : parseFloat(v);
        if (key === "inPlaceNOI") refreshNoiNote();
        recompute();
      });
    });
  }

  function refreshNoiNote() {
    const input = document.querySelector('#dm-inputs input[data-key="inPlaceNOI"]');
    const note = input.parentElement.querySelector(".dm-note");
    const missing = state.inPlaceNOI == null || state.inPlaceNOI === "";
    if (missing && !note) {
      input.insertAdjacentHTML("afterend", `<div class="dm-note">NOI not disclosed — verify before underwriting.</div>`);
    } else if (!missing && note) {
      note.remove();
    }
  }

  // ── KPI tiles + full outputs ─────────────────────────────────────────
  function recompute() {
    const r = calcDevModel(state);

    const posClass = v => v > 0 ? "green" : "amber";
    document.getElementById("dm-kpis").innerHTML = `
      <div class="kpi-card">
        <div class="kpi-icon blue"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="16" y1="2" x2="16" y2="6"/></svg></div>
        <div class="kpi-body"><div class="kpi-val">${money(r.TAC)}</div><div class="kpi-label">Total Acquisition Cost</div></div>
      </div>
      <div class="kpi-card">
        <div class="kpi-icon blue"><svg viewBox="0 0 24 24"><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg></div>
        <div class="kpi-body"><div class="kpi-val">${money(r.stabilizedValue)}</div><div class="kpi-label">Stabilized Value</div></div>
      </div>
      <div class="kpi-card">
        <div class="kpi-icon ${posClass(r.valueAddProfit)}"><svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></div>
        <div class="kpi-body"><div class="kpi-val" style="color:var(--${r.valueAddProfit > 0 ? "success" : "danger"})">${money(r.valueAddProfit)}</div><div class="kpi-label">Value-Add Profit</div></div>
      </div>
      <div class="kpi-card">
        <div class="kpi-icon ${posClass(r.profitMargin)}"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg></div>
        <div class="kpi-body"><div class="kpi-val" style="color:var(--${r.profitMargin > 0 ? "success" : "danger"})">${pct1(r.profitMargin)}</div><div class="kpi-label">Profit Margin</div></div>
      </div>
      <div class="kpi-card">
        <div class="kpi-icon ${posClass(r.cashOnCash)}"><svg viewBox="0 0 24 24"><path d="M12 1v22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></div>
        <div class="kpi-body"><div class="kpi-val" style="color:var(--${r.cashOnCash > 0 ? "success" : "danger"})">${pct1(r.cashOnCash)}</div><div class="kpi-label">Cash-on-Cash</div></div>
      </div>
      <div class="kpi-card">
        <div class="kpi-icon ${r.equityMultiple >= 1 ? "green" : "amber"}"><svg viewBox="0 0 24 24"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg></div>
        <div class="kpi-body"><div class="kpi-val">${r.equityMultiple == null || isNaN(r.equityMultiple) ? "—" : r.equityMultiple.toFixed(2) + "x"}</div><div class="kpi-label">Equity Multiple</div></div>
      </div>`;

    document.getElementById("dm-noi-banner").innerHTML = r.noiVarianceFlag
      ? `<div class="verdict"><b>NOI mismatch:</b> disclosed NOI and comp-based rent don't agree (variance ${pct1(r.noiVariance)}) — get the rent roll before trusting either number.</div>`
      : "";

    document.getElementById("dm-outputs").innerHTML = `
      <div class="card">
        <div class="card-head"><h2>Acquisition Cost Stack</h2></div>
        <div class="dm-out-grid">
          ${outRow("Renovation Cost", money(r.reno))}
          ${outRow("Renovation Contingency", money(r.renoContingency))}
          ${outRow("Closing Costs", money(r.closingCosts))}
          ${outRow("Subtotal", money(r.subtotal))}
          ${outRow("Sponsor Fee", money(r.sponsorFee))}
          ${outRow("Working Capital", money(r.workingCapital))}
          ${outRow("Loan Amount", money(r.loanAmount))}
          ${outRow("Loan Fee", money(r.loanFee))}
          ${outRow("Total Acquisition Cost (TAC)", money(r.TAC), true)}
          ${outRow("Cost per Unit", money(r.costPerUnit))}
        </div>
      </div>
      <div class="card">
        <div class="card-head"><h2>In-Place NOI Sanity Check</h2><span class="card-sub">Bottom-up from current rent/occupancy — compared to disclosed NOI</span></div>
        <div class="dm-out-grid">
          ${outRow("GPI (in-place)", money(r.gpiInPlace))}
          ${outRow("Vacancy Loss", money(r.vacancyLossInPlace))}
          ${outRow("EGI", money(r.egiInPlace))}
          ${outRow("OpEx", money(r.opexInPlace))}
          ${outRow("Calculated NOI", money(r.noiInPlaceCalc))}
          ${outRow("Disclosed NOI", state.inPlaceNOI == null || state.inPlaceNOI === "" ? "not disclosed" : money(state.inPlaceNOI))}
          ${outRow("Variance", r.noiVariance == null ? "—" : pct1(r.noiVariance))}
          ${outRow("Going-In Cap (on ask)", r.goingInCap == null ? "—" : pct1(r.goingInCap))}
        </div>
      </div>
      <div class="card">
        <div class="card-head"><h2>Stabilized Operations</h2></div>
        <div class="dm-out-grid">
          ${outRow("Post-Reno Avg Rent", money(r.postRenoRent))}
          ${outRow("GPI (stabilized)", money(r.gpiStab))}
          ${outRow("Vacancy Loss", money(r.vacancyLossStab))}
          ${outRow("EGI", money(r.egiStab))}
          ${outRow("OpEx", money(r.opexStab))}
          ${outRow("Stabilized NOI", money(r.noiStab), true)}
          ${outRow("Stabilized Value", money(r.stabilizedValue), true)}
          ${outRow("Value per Unit", money(r.valuePerUnit))}
        </div>
      </div>
      <div class="card">
        <div class="card-head"><h2>Returns</h2></div>
        <div class="dm-out-grid">
          ${outRow("Yield on Cost", pct1(r.yieldOnCost))}
          ${outRow("Spread vs. Exit Cap", num1(r.spreadBps) + " bps")}
          ${outRow("Annual Debt Service", money(r.annualDebtService))}
          ${outRow("Annual Cash Flow", money(r.annualCashFlow))}
          ${outRow("Total Equity", money(r.totalEquity))}
          ${outRow("Sponsor Equity", money(r.sponsorEquity))}
          ${outRow("Investor Equity", money(r.investorEquity))}
          ${outRow("Cash-on-Cash", pct1(r.cashOnCash))}
        </div>
      </div>
      <div class="card">
        <div class="card-head"><h2>Exit & Waterfall</h2></div>
        <div class="dm-out-grid">
          ${outRow("Net Sale Proceeds", money(r.netSaleProceeds))}
          ${outRow("Cumulative Cash Flow", money(r.cumulativeCashFlow))}
          ${outRow("Equity Multiple", r.equityMultiple == null || isNaN(r.equityMultiple) ? "—" : r.equityMultiple.toFixed(2) + "x")}
          ${outRow("Approx. Avg Annual Return", pct1(r.approxAvgAnnualReturn))}
          ${outRow("Preferred Return Amount", money(r.preferredReturnAmount))}
          ${outRow("Profit for Promote", money(r.profitForPromote))}
          ${outRow("Sponsor Promote", money(r.sponsorPromote))}
          ${outRow("Investor Residual", money(r.investorResidual))}
        </div>
      </div>`;
  }

  function outRow(label, val, strong) {
    return `<div class="dm-out-row${strong ? " strong" : ""}"><span>${esc(label)}</span><b>${val}</b></div>`;
  }

  // ── Deal picker (PHX_SCAN) ────────────────────────────────────────────
  function badgeClass(conf) {
    const c = (conf || "").toLowerCase();
    if (c.includes("medium") && !c.includes("low")) return "medium";
    if (c.includes("low-med") || c.includes("lowmed")) return "lowmed";
    return "low";
  }

  function bucketLabel(list) { return list === "qualifying" ? "QUALIFYING" : "NEAR MISS"; }
  function bucketClass(list) { return list === "qualifying" ? "medium" : "lowmed"; }

  function dealCard(d, idx, list) {
    return `<div class="dm-deal" data-list="${list}" data-idx="${idx}">
      <div class="d-name">${esc(d.name)}</div>
      <div class="d-addr">${esc(d.address)}, ${esc(d.zip)}</div>
      <div class="dm-deal-stats">
        <span><b>${money(d.ask)}</b> ask</span>
        <span><b>${esc(d.units)}</b> units</span>
        <span>NOI <b>${d.noi == null ? "n/a" : money(d.noi)}</b></span>
        <span>Cap <b>${d.capPct == null ? "—" : d.capPct.toFixed(2) + "%"}</b></span>
        <span class="badge ${bucketClass(list)}">${bucketLabel(list)}</span>
        <span class="badge ${badgeClass(d.confidence)}">${esc(d.confidence)}</span>
      </div>
    </div>`;
  }

  function renderDealPicker() {
    const q = D.qualifying || [], n = D.nearMisses || [];
    const wrap = document.getElementById("dm-deal-picker");
    if (!q.length && !n.length) {
      wrap.innerHTML = `<div class="empty-state">No scanned deals yet — Phoenix Cap-Rate Watch hasn't found anything. Fill inputs manually below.</div>`;
      return;
    }
    wrap.innerHTML = `<div class="dm-deal-grid">
      ${q.map((d, i) => dealCard(d, i, "qualifying")).join("")}
      ${n.map((d, i) => dealCard(d, i, "nearMisses")).join("")}
    </div>`;
    wrap.querySelectorAll(".dm-deal").forEach(el => {
      el.addEventListener("click", () => {
        wrap.querySelectorAll(".dm-deal").forEach(x => x.classList.remove("selected"));
        el.classList.add("selected");
        const list = el.dataset.list, idx = +el.dataset.idx;
        const d = (list === "qualifying" ? D.qualifying : D.nearMisses)[idx];
        applyDeal(d);
      });
    });
  }

  function applyDeal(d) {
    state.address = `${d.address}, ${d.zip}`;
    state.units = d.units;
    state.askingPrice = d.ask;
    state.propertyClass = d.cls;
    state.inPlaceNOI = d.noi != null ? d.noi : null;
    renderInputs();
    recompute();
    renderRentComps();
  }

  // ── Rent comps / renovation premium evidence ──────────────────────────
  function renderRentComps() {
    const el = document.getElementById("dm-rent-comps");
    if (!RC.length) {
      el.innerHTML = `<div class="empty-state">No rent comps scanned yet for this zip.</div>`;
      return;
    }
    const zip = (state.address.match(/\b\d{5}\b/) || [])[0];
    const inZip = zip ? RC.filter(c => c.zip === zip) : RC;
    if (!inZip.length) {
      el.innerHTML = `<div class="empty-state">No rent comps scanned yet for this zip.</div>`;
      return;
    }
    const groups = {};
    inZip.forEach(c => {
      const key = c.property + "|" + c.unitType;
      (groups[key] = groups[key] || []).push(c);
    });
    const pairs = [];
    Object.values(groups).forEach(list => {
      const classic = list.find(c => c.tier === "Classic");
      const renovated = list.find(c => c.tier === "Renovated");
      if (classic && renovated) {
        const dollar = renovated.rent - classic.rent;
        const pctPrem = dollar / classic.rent;
        pairs.push({ property: classic.property, unitType: classic.unitType, classic, renovated, dollar, pctPrem });
      }
    });
    if (!pairs.length) {
      el.innerHTML = `<div class="empty-state">Rent comps found for this zip, but no matched Classic/Renovated pair yet.</div>`;
      return;
    }
    const avgDollar = pairs.reduce((s, p) => s + p.dollar, 0) / pairs.length;
    el.innerHTML = `
      <div class="dm-out-grid">
        ${pairs.map(p => outRow(`${esc(p.property)} — ${esc(p.unitType)}`, `+${money(p.dollar)} (${(p.pctPrem * 100).toFixed(1)}%)`)).join("")}
      </div>
      <button class="dm-btn" id="dm-use-premium">Use blended premium (+${money(avgDollar)}/mo)</button>`;
    document.getElementById("dm-use-premium").addEventListener("click", () => {
      state.rentPremium = Math.round(avgDollar);
      renderInputs();
      recompute();
    });
  }

  // ── Auto-underwriting results (agents/auto_underwrite/run.js) ──────────
  function verdictClass(v) {
    if (v === "PENCILS") return "sev-low";
    if (v.indexOf("VERIFY") !== -1) return "sev-med";
    if (v === "DOES NOT PENCIL") return "sev-high";
    return "low"; // insufficient data
  }

  function renderAutoUnderwrite() {
    const el = document.getElementById("dm-auto-underwrite");
    const UR = window.UNDERWRITING_RUNS;
    if (!UR || !UR.runs || !UR.runs.length) {
      el.innerHTML = `<div class="empty-state">No automated runs yet — agents/auto_underwrite/run.js hasn't run.</div>`;
      return;
    }
    const pencilCount = UR.runs.filter(r => r.verdict === "PENCILS").length;
    el.innerHTML = `
      <p class="card-sub" style="margin-bottom:12px;">Updated ${esc(UR.updated)} — ${pencilCount} of ${UR.runs.length} deals pencil with real rent-comp data. Deals in zips not yet scanned are marked insufficient rather than guessed.</p>
      <div class="table-wrap"><table class="dtbl">
        <thead><tr><th>Deal</th><th>Bucket</th><th>Ask</th><th>TAC</th><th>Value-Add Profit</th><th>Cash-on-Cash</th><th>Rent Data</th><th>Verdict</th></tr></thead>
        <tbody>${UR.runs.map(r => `
          <tr><td><b>${esc(r.name)}</b><br><span class="card-sub">${esc(r.address)}, ${esc(r.zip)}</span></td>
          <td><span class="badge ${bucketClass(r.bucket === "qualifying" ? "qualifying" : "nearMiss")}">${bucketLabel(r.bucket === "qualifying" ? "qualifying" : "nearMiss")}</span></td>
          <td>${money(r.askingPrice)}</td><td>${money(r.TAC)}</td>
          <td>${money(r.valueAddProfit)}</td><td>${pct1(r.cashOnCash)}</td>
          <td>${esc(r.currentAvgRentSource)} / ${esc(r.rentPremiumSource)}</td>
          <td><span class="badge sev-pill ${verdictClass(r.verdict)}">${esc(r.verdict)}</span></td></tr>`).join("")}</tbody>
      </table></div>`;
  }

  // ── Static reference tables ────────────────────────────────────────────
  const DD_ITEMS = [
    ["Title & Survey", "Title company / surveyor", "Title commitment, ALTA survey", "Undisclosed liens, easements, encroachments", true],
    ["Rent Roll Audit", "Seller / property manager", "Current rent roll, lease abstracts", "Rents don't match pro forma, undisclosed concessions", true],
    ["Trailing-12 Financials Audit", "Seller / bookkeeper", "T-12 P&L, bank statements", "Disclosed NOI inflated or unverifiable", true],
    ["Property Condition Assessment (PCA)", "Licensed inspector / engineer", "PCA report", "Deferred maintenance beyond renovation budget", true],
    ["Environmental Phase I ESA", "Environmental consultant", "Phase I ESA report", "Contamination, cleanup liability", true],
    ["Zoning / Non-Conforming Use Check", "City planning department", "Zoning verification letter", "Unit count or use not legally permitted", true],
    ["Existing Leases & Estoppels", "Seller / tenants", "Signed estoppel certificates", "Below-market long-term leases block renovation plan", false],
    ["Service Contracts", "Seller / vendors", "Copies of all service contracts", "Unfavorable contracts convey with the property", false],
    ["Utility Bill Audit", "Utility companies", "12 months of utility bills", "OpEx assumption understated", false],
    ["Insurance Loss History", "Insurance broker", "CLUE report / loss runs", "Uninsurable or premium spike at closing", false],
    ["Property Tax Reassessment Risk", "County assessor", "Assessor estimate at sale price", "OpEx assumption understated post-close", true],
    ["Capital Needs Assessment", "Contractor / engineer", "Written capital needs estimate", "Renovation budget insufficient", true],
    ["Market Rent & Sale Comp Set", "Broker / appraiser", "Comparable rent and sale data", "Stabilized value assumption unsupported", true],
    ["Litigation / Code Violations Search", "County records / city code enforcement", "Court records, violation history", "Unbudgeted legal exposure or fines", false],
  ];

  function renderDD() {
    document.getElementById("dm-dd-table").innerHTML = `
      <thead><tr><th>Item</th><th>Who to Contact</th><th>Documents Needed</th><th>Major Risks</th><th>Deal-Killer</th></tr></thead>
      <tbody>${DD_ITEMS.map(([item, who, docs, risk, killer]) => `
        <tr><td><b>${esc(item)}</b></td><td>${esc(who)}</td><td>${esc(docs)}</td><td>${esc(risk)}</td>
        <td>${killer ? '<span class="badge low" style="background:var(--danger-soft);color:#b91c1c;border-color:rgba(255,82,82,.3);">Yes</span>' : '<span class="badge low">No</span>'}</td></tr>`).join("")}</tbody>`;
  }

  const RISK_REGISTER = [
    ["R-1", "Market/Data", "Disclosed NOI conflicts with achievable market rent", "Bottom-up rent-comp NOI comes in far below/above seller's disclosed trailing NOI", "Either underpaying for real income or badly overpaying for income that doesn't exist at market rent", "Get the actual rent roll + T-12 before committing capital", "High"],
    ["R-2", "Market", "Renovation rent premium doesn't materialize", "Comps show smaller premium than modeled after renovation completes", "Yield on cost and profit come in below plan even if renovation is on budget", "Use the most directly-comparable premium found (same building/floor plan beats market-wide averages)", "High"],
    ["R-3", "Market", "New competing supply delivers nearby", "Building permits filed / cranes visible in submarket during hold", "Absorption slows, concessions increase, rent growth assumption becomes unrealistic", "Track permit pipeline for the submarket before and during hold", "Medium"],
    ["R-4", "Market", "Local employer layoffs or population decline", "Major employer announces layoffs/relocation in the metro", "Vacancy rises above underwritten level, rent growth stalls or reverses", "Diversify away from single-employer-dependent submarkets", "Medium"],
    ["R-5", "Diligence", "Undisclosed deferred maintenance", "PCA finds capital needs beyond what's budgeted", "Renovation/capex budget blows through contingency before rent upside is realized", "Get a real PCA from a licensed inspector before closing", "High"],
    ["R-6", "Diligence", "Title defects or undisclosed liens", "Title commitment reveals easements/judgments/ownership gaps", "Closing delayed or killed; post-closing legal exposure", "Full title search + owner's title insurance", "High"],
    ["R-7", "Diligence", "Existing leases below market with long terms", "Estoppels show multi-year leases signed well below current market rent", "Can't execute renovate-and-raise plan on schedule", "Model actual lease rollover schedule not a blanket stabilized rent", "Medium"],
    ["R-8", "Diligence", "Environmental contamination discovered", "Phase I ESA flags prior gas station/dry cleaner/dumping", "Cleanup costs, delayed financing, potential deal-killer", "Phase I ESA before closing; Phase II if flagged", "High"],
    ["R-9", "Diligence", "Zoning/occupancy non-conformance", "Actual unit count or use doesn't match legally permitted", "Can't legally rent all units or must cure at own cost", "Zoning verification letter before closing", "High"],
    ["R-10", "Construction", "Renovation cost overruns beyond contingency", "Contractor change orders exceed the 10% contingency", "TAC rises, profit margin compresses or turns negative", "Get a firm contractor bid before finalizing budget", "High"],
    ["R-11", "Construction", "Contractor default delay or poor workmanship", "Missed milestones, licensing lapses, subpar punch-list", "Renovation timeline slips, lease-up delayed", "Vet contractor references/bonding; retain payment until punch-list clears", "Medium"],
    ["R-12", "Construction", "Permit delays", "Municipality backlog or plan-review rejection", "Renovation timeline extends beyond modeled months", "Confirm permit turnaround times before locking timeline", "Medium"],
    ["R-13", "Construction", "Material/labor cost inflation mid-project", "Tariffs supply shocks or labor shortage during renovation", "Hard cost per unit rises after budget is locked", "Lock material pricing where possible", "Medium"],
    ["R-14", "Financing", "Interest rate rises before/during hold", "Rate quotes move between LOI and closing or loan is floating", "Debt service rises cash-on-cash and DSCR compress", "Lock rate early; stress-test rate; keep interest reserve", "High"],
    ["R-15", "Financing", "Can't refinance or sell at hold-period end", "Lending tightens cap rates rise or asset underperforms by exit date", "Forced to extend bridge loan at worse rate or sell into soft market", "Don't assume fixed exit is guaranteed; model extension", "High"],
    ["R-16", "Financing", "Loan covenant breach (DSCR below minimum)", "NOI comes in below lender's minimum DSCR", "Lender can call loan or restrict distributions", "Underwrite to lender's actual DSCR covenant", "Medium"],
    ["R-17", "Financing", "Appraisal comes in below expected value at refi", "Independent appraisal disagrees with stabilized-value assumption", "Can't pull planned equity out at refi", "Use conservative well-documented comps", "Medium"],
    ["R-18", "Legal/Regulatory", "Rent control or rent-stabilization legislation", "State/local government proposes or passes rent caps", "Can't execute planned rent increases post-renovation", "Track local political climate", "Medium"],
    ["R-19", "Legal/Regulatory", "Property tax reassessment shock", "County reassesses value upon sale at new higher price", "OpEx rises above modeled assumption compressing NOI", "Get county assessor estimate before finalizing OpEx", "Medium"],
    ["R-20", "Legal/Regulatory", "Code enforcement violations or ADA liability", "Inspection reveals undisclosed violations", "Unbudgeted cure costs potential fines/litigation", "Pull code enforcement history from city before closing", "Medium"],
    ["R-21", "Partnership", "Sponsor key-person risk", "Sponsor unavailable mid-project (health departure other deals)", "Project management gap during renovation/lease-up", "Documented backup plan/co-sponsor", "Low"],
    ["R-22", "Partnership", "Capital call if reserves run out", "Costs exceed budget and working capital is depleted", "Investors asked for more capital straining relationship", "Size working capital reserve realistically", "Medium"],
    ["R-23", "Partnership", "Disputes over promote/waterfall interpretation", "Ambiguous operating agreement language", "Legal dispute at exit damaged investor relationships", "Have waterfall reviewed by attorney and modeled explicitly", "Low"],
    ["R-24", "Macro", "Recession reduces renter affordability", "Regional/national downturn during hold", "Higher vacancy more concessions slower rent growth", "Stress-test recession scenario", "Medium"],
    ["R-25", "Macro", "Uninsured casualty loss", "Property damage exceeds insurance coverage or exclusions apply", "Unbudgeted repair cost potential vacancy during repairs", "Confirm coverage limits/exclusions with broker", "Low"],
    ["R-26", "Macro", "Insurance market hardening", "Premiums spike or carriers exit region/asset class", "OpEx assumption for insurance becomes understated", "Get actual insurance quote before finalizing OpEx", "Medium"],
    ["R-27", "Exit", "Buyer pool shrinks at exit", "Fewer active buyers for asset class/size at sale time", "Longer marketing time price concessions to close", "Build in marketing-period cost/timeline buffer", "Medium"],
    ["R-28", "Exit", "Cap rate expansion beyond modeled exit cap", "Rates or sentiment push cap rates up further than cushion assumed", "Stabilized value at exit lower even if NOI hits target", "Stress-tested in sensitivity; revisit if rate environment shifts", "High"],
    ["R-29", "Exit", "Hold period extension", "Renovation lease-up or market conditions delay exit", "Additional interest carry delayed return of capital", "Model downside case with longer hold", "Medium"],
  ];

  function sevClass(s) {
    if (s === "High") return "sev-high";
    if (s === "Medium") return "sev-med";
    return "sev-low";
  }

  function renderRisk() {
    document.getElementById("dm-risk-table").innerHTML = `
      <thead><tr><th>ID</th><th>Category</th><th>Risk</th><th>Warning Sign</th><th>Impact</th><th>Mitigation</th><th>Severity</th></tr></thead>
      <tbody>${RISK_REGISTER.map(([id, cat, risk, trigger, impact, mit, sev]) => `
        <tr><td>${id}</td><td>${esc(cat)}</td><td><b>${esc(risk)}</b></td><td>${esc(trigger)}</td><td>${esc(impact)}</td><td>${esc(mit)}</td>
        <td><span class="badge sev-pill ${sevClass(sev)}">${sev}</span></td></tr>`).join("")}</tbody>`;
  }

  // ── Init ────────────────────────────────────────────────────────────
  renderDealPicker();
  renderAutoUnderwrite();
  renderRentComps();
  renderInputs();
  renderDD();
  renderRisk();
  recompute();
  document.getElementById("topbarDate").textContent = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
})();
