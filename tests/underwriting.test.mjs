import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(testDirectory, '..');
const html = fs.readFileSync(path.join(root, 'phx-land-leads.html'), 'utf8');
const fixtures = JSON.parse(fs.readFileSync(path.join(testDirectory, 'underwriting-fixtures.json'), 'utf8')).cases;

test('every inline page script parses', () => {
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter(([, attributes]) => !/\bsrc\s*=|\btype\s*=\s*["']application\//i.test(attributes));
  assert.ok(scripts.length > 0, 'Found inline scripts');
  for (const [index, [, , source]] of scripts.entries()) {
    assert.doesNotThrow(() => new vm.Script(source), `inline script ${index + 1}`);
  }
});

// Compile progressively so nested functions, comments and template strings use
// V8's parser rather than a brittle brace-counting regular expression.
function declaration(name) {
  const match = new RegExp(`^(?:async )?function ${name}\\(`, 'm').exec(html);
  assert.ok(match, `Missing page function ${name}`);
  return completeScript(match.index);
}

function completeScript(start) {
  let end = html.indexOf('\n', start);
  while (end !== -1) {
    const source = html.slice(start, end);
    try {
      new vm.Script(source);
      return source;
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
    }
    end = html.indexOf('\n', end + 1);
  }
  throw new Error(`Could not extract complete script at ${start}`);
}

function approximately(actual, expected, label) {
  // A fraction of one cent for money and 1e-10 for fractional margins.
  const tolerance = Math.max(1e-10, Math.abs(expected) * 1e-12);
  assert.ok(Number.isFinite(actual), `${label}: expected finite number, got ${actual}`);
  assert.ok(Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected}, got ${actual} (tolerance ${tolerance})`);
}

function pureContext() {
  const context = vm.createContext({});
  vm.runInContext(declaration('homeEcon') + '\n' + declaration('supportableLand'), context);
  return context;
}

for (const fixture of fixtures) {
  test(`shared economics: ${fixture.name}`, () => {
    const context = pureContext();
    const result = context.homeEcon(fixture.input);
    for (const field of ['C', 'finished', 'cost', 'profit', 'aduCost', 'margin']) {
      approximately(result[field], fixture.expected[field], `${fixture.name}.${field}`);
    }
    const max = context.supportableLand(fixture.input, fixture.target);
    approximately(max, fixture.expected.maxLand, `${fixture.name}.maxLand`);
    const atOffer = context.homeEcon({ ...fixture.input, land: max });
    approximately(atOffer.margin, fixture.target, `${fixture.name}.marginAtMaxLand`);
    const aboveOffer = context.homeEcon({ ...fixture.input, land: max + 1000 });
    assert.ok(aboveOffer.margin < fixture.target, 'Paying more than max land must miss target');
  });
}

class Element {
  constructor(value = '') {
    this.value = String(value);
    this.textContent = '';
    this.innerHTML = '';
    this.style = {};
    this.listeners = {};
  }
  addEventListener(type, callback) { (this.listeners[type] ||= []).push(callback); }
  dispatchEvent(event) {
    for (const callback of this.listeners[event.type] || []) callback(event);
  }
  scrollIntoView() {}
}

function calculatorContext(fixture, leads = []) {
  const x = fixture.input;
  const values = {
    hcLand: x.land, hcDemo: x.demo, hcLots: x.n, hcSf: x.sf,
    hcPrice: x.psf, hcHard: x.hard, hcSite: x.site,
    hcSoft: x.soft * 100, hcFin: x.fin * 100, hcSell: x.sell * 100,
    hcProfit: fixture.target * 100, hcOpen: 80, hcMode: 'sell', hcLead: '',
    moSplitCost: x.splitCost, moSplitHaircut: x.haircut * 100, moMinLot: 14375,
    hcAduN: x.adu?.n || 0, hcAduSf: x.adu?.sf || 0,
    hcAduHard: x.adu?.hard || 0, hcAduSite: x.adu?.site || 0,
    hcAduVal: x.adu?.value || 0,
  };
  const elements = new Map(Object.entries(values).map(([id, value]) => [id, new Element(value)]));
  const getElementById = id => {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id);
  };
  const stored = new Map();
  let refreshCount = 0;
  const context = vm.createContext({
    document: { getElementById },
    window: {},
    localStorage: {
      getItem: key => stored.get(key) || null,
      setItem: (key, value) => stored.set(key, String(value)),
      removeItem: key => stored.delete(key),
    },
    Event: class { constructor(type) { this.type = type; } },
    D: { leads },
    esc: value => String(value ?? ''),
    money: value => '$' + Math.round(value || 0).toLocaleString('en-US'),
    usablePct: 85,
    renderTopProfit() {}, renderBids() {},
    refreshProfitLines() { refreshCount++; },
    showTab() {},
    fetchHouseComps: async () => ({ rows: [], error: 'Test GIS unavailable' }),
    todayStr: () => '2026-10-18',
  });
  // This section contains the actual page economics and selector dependencies.
  const begin = html.indexOf('function homeEcon(');
  const end = html.indexOf('\nfunction sellerSignals(', begin);
  assert.ok(begin >= 0 && end > begin);
  vm.runInContext(html.slice(begin, end), context);
  vm.runInContext(declaration('splitInfo') + declaration('pmt') + declaration('rentalDebt'), context);
  const init = html.indexOf('(function hcInit(){');
  assert.ok(init >= 0, 'Missing calculator initialization');
  vm.runInContext(completeScript(init), context);
  return { context, elements, stored, getElementById, refreshes: () => refreshCount };
}

for (const fixture of fixtures) {
  test(`calculator uses shared economics: ${fixture.name}`, () => {
    const { context } = calculatorContext(fixture);
    const last = context.window.hcLast;
    assert.ok(last, 'Calculator produced a result');
    approximately(last.gain * fixture.input.n, fixture.expected.profit, 'calculator total profit');
    approximately(last.margin, fixture.expected.margin, 'calculator margin');
    approximately(last.maxLand, fixture.expected.maxLand, 'calculator max land');
  });
}

for (const fixture of fixtures.filter(f => f.input.land > 0)) {
  test(`profitFor agrees with calculator: ${fixture.name}`, () => {
    const { context } = calculatorContext(fixture);
    const x = fixture.input;
    const lead = {
      apn: 'TEST', address: fixture.name, currentZoning: 'R1-8',
      landSf: x.n * 8000 / .85 + 1,
      parcelStatus: x.demo ? 'improved' : 'vacant', defaultDemoCost: x.demo,
      houseComps: { psf: x.psf, n: 5, radiusMi: 1 },
      valuation: { mostLikelyValue: x.land, unreliable: false },
      assessedValue: x.land,
    };
    const result = context.profitFor(lead);
    assert.ok(result, 'profitFor returned a scenario');
    assert.equal(result.n, x.n, 'same home count');
    approximately(result.profit, fixture.expected.profit, 'profitFor profit');
    approximately(result.margin, context.window.hcLast.margin, 'profitFor/calculator margin');
  });
}

test('stored new-build fallback exposes its source, date, and GIS reason', () => {
  const { context } = calculatorContext(fixtures[0]);
  const lead = {
    houseComps: { psf: 0, error: 'HTTP 503 from county GIS' },
    newBuild: {
      psf: 500, n: 6, radiusMi: 2,
      source: 'Maricopa County Assessor stored new-build sales',
      sourceUrl: 'https://example.test/public-comps', retrievedAt: '2026-10-18',
    },
  };
  const selected = context.selectedComps(lead);
  assert.equal(selected.psf, 500);
  assert.equal(selected.fellBack, true);
  const rendered = context.compSourceHtml(lead);
  assert.match(rendered, /FALLBACK/);
  assert.match(rendered, /503/);
  assert.match(rendered, /2026-10-18/);
  assert.match(rendered, /https:\/\/example.test\/public-comps/);
  assert.equal(context.selectedComps({ houseComps: { psf: 0 } }), null,
    'empty home-comp payload cannot masquerade as usable pricing');
});

test('old saved comp metadata explicitly marks an unknown retrieval date', () => {
  const { context } = calculatorContext(fixtures[0]);
  const rendered = context.compSourceHtml({ houseComps: { psf: 500, n: 5, radiusMi: 1 } });
  assert.match(rendered, /Assessor/);
  assert.match(rendered, /retrieved unknown/i);
});

test('sourced dated override takes priority and incomplete override is rejected', () => {
  const { context } = calculatorContext(fixtures[0]);
  const lead = {
    valuation: { mostLikelyValue: 250000, unreliable: false }, assessedValue: 100000,
    landPriceOverride: {
      landCost: 535000, source: 'Public sale record',
      sourceUrl: 'https://example.test/public-record', priceDate: '2026-04-30',
      observedAt: '2026-10-18', priceType: 'recorded historical purchase',
    },
  };
  assert.equal(context.landBasis(lead).land, 535000);
  assert.equal(context.landBasis(lead).ok, true);
  const invalid = { ...lead, landPriceOverride: { ...lead.landPriceOverride, sourceUrl: '' } };
  assert.equal(context.landBasis(invalid).land, 250000,
    'unsourced override never silently wins over a valid proxy');
  for (const patch of [
    { priceDate: '2026-02-30' }, { observedAt: '2026-13-05' },
    { source: '  ' }, { priceType: '  ' }, { landCost: -1 },
    { sourceUrl: 'javascript:alert(1)' },
  ]) {
    const incomplete = { ...lead, landPriceOverride: { ...lead.landPriceOverride, ...patch } };
    assert.equal(context.landBasis(incomplete).land, 250000,
      `invalid override falls back: ${JSON.stringify(patch)}`);
  }
});

test('split settings recalculate the open calculator', () => {
  const fixture = fixtures.find(f => f.name === 'four_home_split_325');
  const { context, getElementById } = calculatorContext(fixture);
  const before = context.window.hcLast.gain;
  getElementById('moSplitCost').value = '50000';
  getElementById('moSplitCost').dispatchEvent({ type: 'input' });
  approximately(context.window.hcLast.gain,
    before - 3 * 25000 * 1.07 / 4, 'extra split cost includes financing');
  getElementById('moSplitHaircut').value = '75';
  getElementById('moSplitHaircut').dispatchEvent({ type: 'input' });
  const x = { ...fixture.input, splitCost: 50000, haircut: .75 };
  approximately(context.window.hcLast.gain * x.n, context.homeEcon(x).profit,
    'split sale discount changes profit immediately');
});

test('global underwriting inputs refresh visible lead badges and offers', () => {
  const { getElementById, refreshes } = calculatorContext(fixtures[0]);
  let before = refreshes();
  getElementById('hcProfit').value = '20';
  getElementById('hcProfit').dispatchEvent({ type: 'input' });
  assert.equal(refreshes(), before + 1, 'target refreshes visible lead offers');
  before = refreshes();
  getElementById('hcSf').value = '4000';
  getElementById('hcSf').dispatchEvent({ type: 'input' });
  assert.equal(refreshes(), before + 1, 'home size refreshes visible lead offers');
  before = refreshes();
  getElementById('moSplitCost').value = '50000';
  getElementById('moSplitCost').dispatchEvent({ type: 'input' });
  assert.equal(refreshes(), before + 1, 'split assumptions refresh visible lead offers');
});

test('lead offer wrapper survives a temporarily empty input and recovers', () => {
  const lead = {
    apn: 'REFRESH_RECOVERY', address: '24 Recovery Way', currentZoning: 'R1-8',
    landSf: 9000, landUseClass: 'residential', parcelStatus: 'vacant',
    houseComps: { psf: 450, n: 5, radiusMi: 1 },
    valuation: { mostLikelyValue: 250000, unreliable: false },
  };
  const { context, getElementById } = calculatorContext(fixtures[0], [lead]);
  const wrapper = { dataset: { profitApn: lead.apn }, connected: true, textContent: '', rendered: '' };
  Object.defineProperty(wrapper, 'outerHTML', {
    set(value) { this.rendered = value; this.connected = !!value; },
  });
  context.document.querySelectorAll = () => wrapper.connected ? [wrapper] : [];
  context.loadRuns = () => [];
  vm.runInContext(declaration('profitLine') + '\n' + declaration('refreshProfitLines'), context);
  getElementById('hcSf').value = '';
  getElementById('hcSf').dispatchEvent({ type: 'input' });
  assert.equal(wrapper.connected, true, 'temporary missing input retains the update target');
  assert.match(wrapper.textContent, /input|unavailable/i);
  getElementById('hcSf').value = '3800';
  getElementById('hcSf').dispatchEvent({ type: 'input' });
  assert.equal(wrapper.connected, true);
  assert.match(wrapper.rendered, /data-profit-apn="REFRESH_RECOVERY"/);
  assert.match(wrapper.rendered, /profit <b/);
});

test('lead autofill uses underwriting count, current comps, and resets demolition', async () => {
  const fixture = fixtures.find(f => f.name === 'four_home_split_325');
  const improved = {
    apn: 'TEST_SPLIT', address: '12 Test Way  Phoenix AZ 85085', score: 90,
    landAcres: 1, landSf: 4 * 8000 / .85 + 1, currentZoning: 'R1-8',
    byRightUnits: 99, parcelStatus: 'improved', defaultDemoCost: 45000,
    houseComps: { psf: 600, n: 5, radiusMi: 1 },
    valuation: { mostLikelyValue: 535000, rangeLow: 500000, rangeHigh: 550000 },
  };
  const vacant = {
    apn: 'TEST_VACANT', address: '14 Test Way  Phoenix AZ 85085', score: 80,
    landAcres: .2, landSf: 9000, currentZoning: 'R1-8',
    byRightUnits: 8, parcelStatus: 'vacant', defaultDemoCost: 90000,
    houseComps: { psf: 450, n: 5, radiusMi: 1 },
    valuation: { mostLikelyValue: 250000, rangeLow: 200000, rangeHigh: 300000 },
  };
  const { context, getElementById } = calculatorContext(fixture, [improved, vacant]);
  getElementById('hcLead').value = '12 Test Way';
  getElementById('hcLead').dispatchEvent({ type: 'input' });
  assert.equal(+getElementById('hcLots').value, 4, 'autofill caps at the same four-home split');
  assert.equal(+getElementById('hcLand').value, 535000);
  assert.equal(+getElementById('hcDemo').value, 45000);
  assert.equal(+getElementById('hcPrice').value, 600, 'saved effective comp price fills immediately');
  approximately(context.window.hcLast.gain * 4, fixture.expected.profit, 'autofilled split profit');
  await Promise.resolve();
  assert.match(getElementById('hcHouse').innerHTML, /GIS unavailable/i);

  getElementById('hcLead').value = '14 Test Way';
  getElementById('hcLead').dispatchEvent({ type: 'input' });
  assert.equal(+getElementById('hcLots').value, 1, 'new lead resets count');
  assert.equal(+getElementById('hcLand').value, 250000);
  assert.equal(+getElementById('hcDemo').value, 0, 'vacant lead never retains prior demo budget');
  assert.equal(+getElementById('hcPrice').value, 450, 'new lead replaces the prior comp price');
});

for (const unreliable of [false, true]) {
  test(`autofill clears stale land and comps when valuation is ${unreliable ? 'unreliable' : 'missing'}`, () => {
    const lead = {
      apn: 'TEST_UNSUPPORTED', address: '99 Unknown Way  Phoenix AZ 85085', score: 50,
      landAcres: .2, landSf: 9000, currentZoning: 'R1-8', parcelStatus: 'vacant',
      assessedValue: 999999,
      ...(unreliable ? { valuation: { mostLikelyValue: 500000, unreliable: true } } : {}),
      houseComps: { psf: 0 },
    };
    const { context, getElementById } = calculatorContext(fixtures[0], [lead]);
    assert.ok(context.window.hcLast, 'previous calculator values had a result');
    getElementById('hcLead').value = '99 Unknown Way';
    getElementById('hcLead').dispatchEvent({ type: 'input' });
    assert.equal(getElementById('hcLand').value, '', 'assessed value is not silently autofilled');
    assert.equal(getElementById('hcPrice').value, '', 'missing comps do not retain previous sale price');
    assert.equal(context.window.hcLast, null, 'stale profitable result cannot be saved');
    assert.match(getElementById('hcOut').textContent, /supported land price/);
  });
}

test('zero split resale factor is honored instead of defaulting to 100 percent', () => {
  const fixture = fixtures.find(f => f.name === 'four_home_split_325');
  const { context, getElementById } = calculatorContext(fixture);
  getElementById('moSplitHaircut').value = '0';
  getElementById('moSplitHaircut').dispatchEvent({ type: 'input' });
  const expected = context.homeEcon({ ...fixture.input, haircut: 0 });
  approximately(context.window.hcLast.totalProfit, expected.profit, 'zero split value total profit');
  approximately(context.window.hcLast.finished, 0, 'zero split value revenue');
});

for (const savedDemo of [undefined, 0]) {
  test(`loading saved teardown run ${savedDemo === undefined ? 'adds default demo for an old run' : 'preserves explicit zero demo'}`, () => {
    const fixture = fixtures.find(f => f.name === 'four_home_split_325');
    const lead = {
      apn: 'SAVED_TEARDOWN', address: '12 Saved Way  Phoenix AZ 85085', score: 90,
      landAcres: 1, landSf: 4 * 8000 / .85 + 1, currentZoning: 'R1-8',
      parcelStatus: 'improved', defaultDemoCost: fixture.input.demo,
      houseComps: { psf: 600, n: 5, radiusMi: 1 },
      valuation: { mostLikelyValue: 535000, rangeLow: 500000, rangeHigh: 550000 },
    };
    const { context, getElementById, stored } = calculatorContext(fixture, [lead]);
    const begin = html.indexOf('const RUN_IDS =');
    const end = html.indexOf('\nfunction delRun(', begin);
    vm.runInContext(html.slice(begin, end), context);
    const vals = Object.fromEntries(['hcLand', 'hcLots', 'hcSf', 'hcPrice', 'hcHard', 'hcSite', 'hcSoft', 'hcFin', 'hcSell', 'hcProfit', 'hcMode']
      .map(id => [id, getElementById(id).value]));
    if (savedDemo !== undefined) vals.hcDemo = savedDemo;
    stored.set('savedRuns', JSON.stringify([{ name: '12 Saved Way', vals }]));
    getElementById('hcDemo').value = '100000';
    context.loadRun(0);
    const demo = savedDemo ?? fixture.input.demo;
    assert.equal(+getElementById('hcDemo').value, demo);
    const expected = context.homeEcon({ ...fixture.input, demo });
    approximately(context.window.hcLast.totalProfit, expected.profit, 'loaded-run demo profit');
  });
}

test('loading unnamed old run resets the previous parcel demolition context', () => {
  const fixture = fixtures.find(f => f.name === 'four_home_split_325');
  const { context, getElementById, stored } = calculatorContext(fixture);
  const begin = html.indexOf('const RUN_IDS =');
  const end = html.indexOf('\nfunction delRun(', begin);
  vm.runInContext(html.slice(begin, end), context);
  stored.set('savedRuns', JSON.stringify([{ name: 'Unnamed (land $535,000)', vals: {} }]));
  getElementById('hcDemo').value = '100000';
  context.loadRun(0);
  assert.equal(+getElementById('hcDemo').value, 0);
  assert.equal(getElementById('hcLead').value, '');
  approximately(context.window.hcLast.totalProfit,
    context.homeEcon({ ...fixture.input, demo: 0 }).profit, 'unnamed-run demo context');
});

test('Maybe cannot pass a loss at $325 even when $275 clears the target', () => {
  const fixture = fixtures[0];
  const { context } = calculatorContext(fixture);
  vm.runInContext(declaration('profitLine'), context);
  context.loadRuns = () => [{ name: '20 Boundary Way', margin: .25, gain: 500000,
    vals: { hcProfit: 10, hcLots: 1, hcLand: 35079 } }];
  const lead = {
    apn: 'MAYBE_BOUNDARY', address: '20 Boundary Way', currentZoning: 'R1-8',
    landSf: 9000, landUseClass: 'residential', parcelStatus: 'vacant',
    houseComps: { psf: 400, n: 5, radiusMi: 1 },
    valuation: { mostLikelyValue: 35079, unreliable: false },
  };
  assert.ok(context.profitFor(lead, 0, 0, { hard: 325 }).profit < 0);
  assert.ok(context.profitFor(lead, 0, 0, { hard: 275 }).margin >= .1);
  const rendered = context.profitLine(lead);
  assert.match(rendered, /PASS · \$325\/sf/);
  assert.doesNotMatch(rendered, />MAYBE|>GOOD/);
});

test('saved run target cannot override the current badge target', () => {
  const { context, getElementById } = calculatorContext(fixtures[0]);
  vm.runInContext(declaration('profitLine'), context);
  context.loadRuns = () => [{ name: '22 Boundary Way', margin: .25, gain: 500000,
    vals: { hcProfit: 10, hcLots: 1, hcLand: 150000 } }];
  const lead = {
    apn: 'SAVED_TARGET', address: '22 Boundary Way', currentZoning: 'R1-8',
    landSf: 9000, landUseClass: 'residential', parcelStatus: 'vacant',
    houseComps: { psf: 550, n: 5, radiusMi: 1 },
    valuation: { mostLikelyValue: 150000, unreliable: false },
  };
  const margin = context.profitFor(lead, 0, 0, { hard: 325 }).margin;
  assert.ok(margin > .1 && margin < .3, 'scenario differentiates saved and current targets');
  getElementById('hcProfit').value = '30';
  const rendered = context.profitLine(lead);
  assert.match(rendered, /MAYBE · \$325\/sf/);
  assert.doesNotMatch(rendered, /GOOD ·/);
});

function gisContext(response) {
  let calls = 0;
  const context = vm.createContext({
    URLSearchParams, AbortSignal,
    fetch: async () => { calls++; return response; },
    esc: value => String(value ?? ''),
    money: value => '$' + Math.round(value || 0).toLocaleString('en-US'),
    num1: value => (+value).toFixed(1),
  });
  const begin = html.indexOf('const houseCache =');
  const end = html.indexOf('\nfunction houseCompsHtml(', begin);
  assert.ok(begin >= 0 && end > begin, 'Missing house-comp cache and fetch section');
  const economicsBegin = html.indexOf('function homeEcon(');
  const economicsEnd = html.indexOf('\nfunction sellerSignals(', economicsBegin);
  vm.runInContext(html.slice(economicsBegin, economicsEnd), context);
  vm.runInContext(html.slice(begin, end), context);
  vm.runInContext(declaration('houseCompsHtml'), context);
  return { context, calls: () => calls };
}

test('county HTTP failures remain visible with saved-comp fallback', async () => {
  const { context, calls } = gisContext({ ok: false, status: 503, json: async () => ({ features: [] }) });
  const lead = {
    apn: 'GIS_HTTP', lat: 33.7, lng: -112.1,
    houseComps: { psf: 500, price: 1900000, n: 5, radiusMi: 1 },
  };
  const result = await context.fetchHouseComps(lead);
  assert.match(result.error, /503/, 'HTTP status is explained');
  assert.equal(calls(), 1, 'failure stops repeated radius queries');
  context.failedResult = result;
  vm.runInContext('houseCache.GIS_HTTP = failedResult', context);
  const rendered = context.houseCompsHtml(lead);
  assert.match(rendered, /503/);
  assert.match(rendered, /500/);
  assert.match(rendered, /scan|saved|fallback/i);
  assert.match(rendered, /Try again/);
});

test('ArcGIS JSON error is treated as a GIS failure even with HTTP 200', async () => {
  const { context, calls } = gisContext({
    ok: true, status: 200,
    json: async () => ({ error: { code: 500, message: 'County query failed' } }),
  });
  const result = await context.fetchHouseComps({ apn: 'GIS_ESRI', lat: 33.7, lng: -112.1 });
  assert.match(result.error, /County query failed/);
  assert.equal(calls(), 1);
});

test('missing coordinates explains why no GIS query can run', async () => {
  const { context, calls } = gisContext({ ok: true, status: 200, json: async () => ({ features: [] }) });
  const result = await context.fetchHouseComps({ apn: 'GIS_NO_COORDS' });
  assert.match(result.error, /coordinates/i);
  assert.equal(calls(), 0);
});

test('successful live GIS lookup keeps source, retrieval time, and matching rows', async () => {
  const features = Array.from({ length: 10 }, (_, index) => ({ attributes: {
    APN: `COMP${index}`, PHYSICAL_ADDRESS: `${index + 1} Sold Way`,
    SALE_DATE: '05/01/2026', SALE_PRICE: '1900000', LAND_SIZE: '43560',
    LIVING_SPACE: '3800', CONST_YEAR: '2025', LATITUDE: '33.7', LONGITUDE: '-112.1',
  } }));
  const { context, calls } = gisContext({ ok: true, status: 200, json: async () => ({ features }) });
  const lead = { apn: 'GIS_OK', lat: 33.7, lng: -112.1, landSf: 43560 };
  const result = await context.fetchHouseComps(lead);
  assert.equal(calls(), 1, 'ten valid matches stop radius expansion');
  assert.equal(result.rows.length, 5);
  assert.equal(result.error, null);
  assert.equal(result.fellBack, false);
  assert.equal(result.medianPsf, 500);
  assert.match(result.source, /Maricopa County Assessor live/i);
  assert.match(result.sourceUrl, /^https:\/\/gis\.mcassessor\.maricopa\.gov\//);
  assert.match(result.retrievedAt, /^\d{4}-\d{2}-\d{2}T/);
  const rendered = context.houseCompsHtml(lead);
  assert.match(rendered, /Median of these 5/);
  assert.match(rendered, /retrieved/);
  assert.match(rendered, /Sold Way/);
});

test('malformed county response is explained instead of becoming empty comps', async () => {
  const { context } = gisContext({ ok: true, status: 200, json: async () => ({ unexpected: [] }) });
  const result = await context.fetchHouseComps({ apn: 'GIS_BAD', lat: 33.7, lng: -112.1 });
  assert.match(result.error, /missing parcel features/i);
});


const riskCases = JSON.parse(fs.readFileSync(path.join(testDirectory, 'underwriting-fixtures.json'), 'utf8')).riskCases;
for(const item of riskCases){
  test(`shared risk: ${item.name}`, () => {
    const {context} = calculatorContext(fixtures[0]);
    const parcel = {apn:'RISK', landSf:10000, currentZoning:'R1-100', floodKnown:item.floodKnown,
      valuation:{mostLikelyValue:100000}, houseComps:{psf:item.psf,n:item.n,radiusMi:1}};
    assert.equal(context.profitFor(parcel).risk, item.risk);
  });
}

test('DSCR limits debt and increases equity; LTV and zero-interest boundaries work', () => {
  const {context} = calculatorContext(fixtures[0]);
  const noi = 3*2600*12*.94*.6, value = noi/.055;
  const debt = context.rentalDebt(noi,value,.70,.0675,360,1.25);
  approximately(debt.ltvLimit, 671877.8181818181, 'LTV amount');
  assert.ok(debt.loan < debt.ltvLimit);
  approximately(debt.dscr,1.25,'DSCR binding limit');
  approximately(context.rentalDebt(100000,1000000,.5,0,360,1.25).loan,500000,'zero interest LTV cap');
  assert.equal(context.rentalDebt(-100,1000000,.7,.06,360,1.25).loan,0);
  assert.equal(context.rentalDebt(noi,value,.7,.06,360,0),null);
});

test('rental calculator blocks blank land and includes demolition in cost and offer', () => {
  const {context,getElementById:g} = calculatorContext(fixtures[0]);
  for(const [id,value] of Object.entries({hcUnits:3,hcUnitSf:1200,hcRent:2600,hcVac:6,hcOpex:40,hcCap:5.5,hcLtv:70,hcRate:6.75,hcDscr:1.25})) g(id).value=String(value);
  g('hcMode').value='rent';g('hcMode').dispatchEvent({type:'input'});
  const original = {...context.window.hcLast};
  assert.ok(original.loan > 0);
  g('hcDemo').value=45000;g('hcDemo').dispatchEvent({type:'input'});
  approximately(context.window.hcLast.totalCost-original.totalCost,45000*1.07,'financed demolition');
  approximately(original.maxLand-context.window.hcLast.maxLand,45000,'offer deducts demolition');
  g('hcLand').value='';g('hcLand').dispatchEvent({type:'input'});
  assert.equal(context.window.hcLast,null);
  assert.match(g('hcOut').textContent,/supported land price/);
});

test('build-and-hold blocks missing price and caps permanent debt', () => {
  const {context} = calculatorContext(fixtures[0]);
  vm.runInContext(declaration('holdDefaults')+declaration('loanBal')+declaration('irrOf')+declaration('calcHold'),context);
  const state=context.holdDefaults({landAcres:1,landSf:43560},3);
  assert.match(context.calcHold(state).error,/purchase price/);
  state.askingPrice=250000;state.ltvPct=.95;state.minDscr=2;
  const r=context.calcHold(state);
  assert.ok(!r.error);
  assert.ok(r.permLoan < r.debt.ltvLimit);
  approximately(r.dscr,2,'hold DSCR');
});

test('median sensitivity flags changed verdict and shared comps', () => {
  const {context} = calculatorContext(fixtures[0]);
  const parcel={apn:'A',landSf:9000,currentZoning:'R1-8',floodKnown:true,
    valuation:{mostLikelyValue:150000}, houseComps:{psf:600,medPsf:300,n:5,radiusMi:1,
    comps:[1,2,3,4,5].map(i=>({apn:'C'+i}))}};
  context.D.leads=[parcel,{...parcel,apn:'B'}];
  const rendered=context.compSensitivityHtml(parcel);
  assert.match(rendered,/FRAGILE/);assert.match(rendered,/Shared comps/);
});

test('saved runs round-trip ADU, split and usable-area assumptions', () => {
  const {context,getElementById:g,stored} = calculatorContext(fixtures[0]);
  const begin=html.indexOf('const RUN_IDS ='), end=html.indexOf('\nfunction delRun(',begin);
  vm.runInContext(html.slice(begin,end),context);
  context.renderRuns=()=>{};context.drawMaps=()=>{};
  context.setParcelAssumption=(key,value)=>{context.usablePct=value;};
  for(const [id,value] of Object.entries({hcAduN:2,hcAduSf:850,hcAduHard:375,hcAduSite:16000,hcAduVal:400000,moSplitCost:40000,moSplitHaircut:70,moMinLot:15000,hcDscr:1.4})) g(id).value=String(value);
  context.usablePct=72; context.saveRun();
  const saved=JSON.parse(stored.get('savedRuns'))[0];
  assert.equal(saved.usablePct,72);
  g('hcAduN').value='0';g('moSplitHaircut').value='90';context.usablePct=85;
  context.loadRun(0);
  assert.equal(+g('hcAduN').value,2);assert.equal(+g('moSplitHaircut').value,70);
  assert.equal(context.usablePct,72);assert.equal(+g('hcDscr').value,1.4);
});
