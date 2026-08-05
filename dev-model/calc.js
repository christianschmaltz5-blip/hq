// Dev Underwriting Model — pure calculation engine (no DOM).
// Ports the 8-sheet "Real Estate Developer Training Model.xlsx" acquisition/
// value-add multifamily workbook. Every function takes/returns plain objects.

window.DEV_MODEL_DEFAULTS = {
  address: "", units: 9, askingPrice: 1699000, propertyClass: "C", yearBuilt: "",
  currentOccupancy: 0.97, inPlaceNOI: 122000,
  unitsToRenovate: 9, renoCostPerUnit: 8000, otherCapex: 25000, rentPremium: 85, renoTimelineMonths: 8,
  currentAvgRent: 1000, stabilizedVacancy: 0.05, opexRatio: 0.42, rentGrowth: 0.03, exitCapRate: 0.0565,
  ltc: 0.70, loanRate: 0.075, loanFeePct: 0.01, holdYears: 3, closingCostPct: 0.015,
  sponsorFeePct: 0.02, workingCapitalPct: 0.02,
  surveyCost: 3000, geotechCost: 4000, utilityDeposit: 3000, bondCost: 2000,
  renoContingencyPct: 0.10, sellingCostPct: 0.07,
  preferredReturn: 0.08, sponsorPromotePct: 0.20, sponsorEquityShare: 0.10
};

function calcDevModel(inputs) {
  const i = inputs;
  const r = {};

  // ── Acquisition cost stack ──────────────────────────────────────────
  r.reno = i.unitsToRenovate * i.renoCostPerUnit;
  r.renoContingency = (r.reno + i.otherCapex) * i.renoContingencyPct;
  r.closingCosts = i.askingPrice * i.closingCostPct;
  r.subtotal = i.askingPrice + r.closingCosts + r.reno + i.otherCapex +
    i.surveyCost + i.geotechCost + i.utilityDeposit + i.bondCost + r.renoContingency;
  r.sponsorFee = r.subtotal * i.sponsorFeePct;
  r.workingCapital = (r.subtotal + r.sponsorFee) * i.workingCapitalPct;
  r.loanAmount = (r.subtotal + r.sponsorFee + r.workingCapital) * i.ltc;
  r.loanFee = r.loanAmount * i.loanFeePct;
  r.TAC = r.subtotal + r.sponsorFee + r.workingCapital + r.loanFee;
  r.costPerUnit = r.TAC / i.units;

  // ── In-place NOI sanity check ────────────────────────────────────────
  r.gpiInPlace = i.units * i.currentAvgRent * 12;
  r.vacancyLossInPlace = r.gpiInPlace * (1 - i.currentOccupancy);
  r.egiInPlace = r.gpiInPlace - r.vacancyLossInPlace;
  r.opexInPlace = r.egiInPlace * i.opexRatio;
  r.noiInPlaceCalc = r.egiInPlace - r.opexInPlace;
  r.noiVariance = (i.inPlaceNOI != null && i.inPlaceNOI !== "")
    ? (r.noiInPlaceCalc - i.inPlaceNOI) / i.inPlaceNOI : null;
  r.noiVarianceFlag = r.noiVariance != null && Math.abs(r.noiVariance) > 0.15;

  // ── Stabilized (post-renovation) ─────────────────────────────────────
  r.postRenoRent = i.currentAvgRent + i.rentPremium * (i.unitsToRenovate / i.units);
  r.gpiStab = i.units * r.postRenoRent * 12;
  r.vacancyLossStab = r.gpiStab * i.stabilizedVacancy;
  r.egiStab = r.gpiStab - r.vacancyLossStab;
  r.opexStab = r.egiStab * i.opexRatio;
  r.noiStab = r.egiStab - r.opexStab;
  r.stabilizedValue = r.noiStab / i.exitCapRate;
  r.valuePerUnit = r.stabilizedValue / i.units;

  // ── Returns ───────────────────────────────────────────────────────────
  r.valueAddProfit = r.stabilizedValue - r.TAC;
  r.profitMargin = r.valueAddProfit / r.TAC;
  r.yieldOnCost = r.noiStab / r.TAC;
  r.goingInCap = (i.inPlaceNOI != null && i.inPlaceNOI !== "") ? i.inPlaceNOI / i.askingPrice : null;
  r.spreadBps = (r.yieldOnCost - i.exitCapRate) * 10000;

  // ── Hold-period cash flow ─────────────────────────────────────────────
  r.annualDebtService = r.loanAmount * i.loanRate;
  r.annualCashFlow = r.noiStab - r.annualDebtService;
  r.totalEquity = r.TAC - r.loanAmount;
  r.sponsorEquity = r.totalEquity * i.sponsorEquityShare;
  r.investorEquity = r.totalEquity * (1 - i.sponsorEquityShare);
  r.cashOnCash = r.annualCashFlow / r.totalEquity;

  // ── Exit ────────────────────────────────────────────────────────────
  r.netSaleProceeds = r.stabilizedValue * (1 - i.sellingCostPct) - r.loanAmount;
  r.cumulativeCashFlow = r.annualCashFlow * i.holdYears;
  r.equityMultiple = (r.netSaleProceeds + r.cumulativeCashFlow) / r.totalEquity;
  r.approxAvgAnnualReturn = (r.equityMultiple - 1) / i.holdYears;

  // ── Waterfall ─────────────────────────────────────────────────────────
  r.preferredReturnAmount = r.totalEquity * i.preferredReturn;
  r.profitForPromote = Math.max(r.valueAddProfit - r.preferredReturnAmount, 0);
  r.sponsorPromote = r.profitForPromote * i.sponsorPromotePct;
  r.investorResidual = r.valueAddProfit - r.preferredReturnAmount - r.sponsorPromote;

  return r;
}

if (typeof module !== "undefined") module.exports = { calcDevModel };
