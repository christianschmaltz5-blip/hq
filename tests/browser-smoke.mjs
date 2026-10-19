// Run against a local HTTP server. Browser is isolated from the user's profile.
// NODE_PATH can point at a Playwright install; PLAYWRIGHT_PATH can name it directly.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';

const require = createRequire(import.meta.url);
const playwrightPath = process.env.PLAYWRIGHT_PATH || require.resolve('playwright', {
  paths: [process.cwd(), process.env.NODE_PATH || '',
    '/Users/christianschmaltz/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'],
});
const { chromium } = require(playwrightPath);
const url = process.env.TEST_URL || 'http://127.0.0.1:8765/phx-land-leads.html';
const outputDir = process.env.BROWSER_OUTPUT || '/tmp/hq-browser-smoke';
await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const report = { url, steps: [], pageErrors: [], consoleErrors: [], failedRequests: [] };
page.on('pageerror', error => report.pageErrors.push(error.message));
page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push(message.text()); });
page.on('requestfailed', request => report.failedRequests.push({ url: request.url(), error: request.failure()?.errorText }));

async function mapsSnapshot(label) {
  await page.waitForFunction(() => ['vacantMap', 'teardownMap'].every(id => {
    const el = document.getElementById(id);
    return el && el.offsetWidth > 0 && el.offsetHeight > 0;
  }));
  const maps = await page.evaluate(() => [
    ['vacantMap', vacantMapInst, mapData.vacant],
    ['teardownMap', teardownMapInst, mapData.teardown],
  ].map(([id, instance, leads]) => {
    const el = document.getElementById(id);
    const tiles = [...el.querySelectorAll('img.leaflet-tile')];
    const satellite = tiles.filter(tile => tile.src.includes('World_Imagery'));
    const size = instance.map.getSize();
    return { id, width: el.offsetWidth, height: el.offsetHeight,
      leafletSize: { x: size.x, y: size.y },
      expectedMarkers: leads.filter(l => l.lat != null && l.lng != null).length,
      markers: instance.markers.length,
      svgMarkers: el.querySelectorAll('.leaflet-overlay-pane path').length,
      allTiles: tiles.length,
      satelliteLoaded: satellite.filter(tile => tile.complete && tile.naturalWidth > 0).length,
      center: instance.map.getCenter(), zoom: instance.map.getZoom(),
      invalidMarkerPoints: instance.markers.filter(marker => {
        const pt = instance.map.latLngToContainerPoint(marker.getLatLng());
        return !Number.isFinite(pt.x) || !Number.isFinite(pt.y);
      }).length };
  }));
  for (const map of maps) {
    assert.equal(map.markers, map.expectedMarkers, `${label}: ${map.id} marker count`);
    assert.equal(map.leafletSize.x, map.width, `${label}: ${map.id} width`);
    assert.equal(map.leafletSize.y, map.height, `${label}: ${map.id} height`);
    assert.equal(map.invalidMarkerPoints, 0, `${label}: ${map.id} valid marker points`);
  }
  report.steps.push({ label, maps });
  return maps;
}

try {
  await page.goto(url, { waitUntil: 'load', timeout: 45000 });
  await page.waitForFunction(() => typeof window.showTab === 'function', { timeout: 15000 });
  assert.equal(await page.locator('[data-t="leads"]').getAttribute('class'), 'on', 'fresh profile starts on Leads');
  assert.ok(await page.locator('#leads-list').textContent(), 'Leads renders');
  await page.locator('[data-t="maps"]').click();
  await page.waitForFunction(() => ['vacantMap', 'teardownMap'].every(id =>
    [...document.querySelectorAll(`#${id} img.leaflet-tile`)].some(tile =>
      tile.src.includes('World_Imagery') && tile.complete && tile.naturalWidth > 0)),
    { timeout: 30000 });
  const initial = await mapsSnapshot('initial Maps opening from Leads');
  for (const map of initial) {
    assert.ok(map.markers > 0, `${map.id} has markers`);
    assert.ok(map.satelliteLoaded > 0, `${map.id} has actual loaded satellite tiles`);
  }
  for (const [id, index] of [['vacantMap', 0], ['teardownMap', 1]]) {
    await page.locator(`#${id}`).scrollIntoViewIfNeeded();
    const before = (await mapsSnapshot(`${id} before pan/zoom`))[index];
    const box = await page.locator(`#${id}`).boundingBox();
    await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.55);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.55 + 80, box.y + box.height * 0.55 + 40, { steps: 12 });
    await page.mouse.up();
    await page.locator(`#${id} .leaflet-control-zoom-in`).click();
    await page.waitForFunction(({ id, zoom }) => {
      const inst = id === 'vacantMap' ? vacantMapInst : teardownMapInst;
      return inst.map.getZoom() > zoom;
    }, { id, zoom: before.zoom });
    const after = (await mapsSnapshot(`${id} after pan/zoom`))[index];
    assert.notDeepEqual(after.center, before.center, `${id} pans`);
    assert.ok(after.zoom > before.zoom, `${id} zooms`);
  }
  for (const tab of ['leads', 'calc', 'money', 'tracking', 'leads']) {
    await page.locator(`[data-t="${tab}"]`).click();
    await page.locator('[data-t="maps"]').click();
    await mapsSnapshot(`Maps reopened after ${tab}`);
  }
  await page.locator('[data-t="leads"]').click();
  await page.locator('#addrSearch').fill('Cloud');
  await page.locator('[data-t="maps"]').click();
  const filtered = await mapsSnapshot('Cloud address filter');
  assert.ok(filtered.reduce((sum, map) => sum + map.markers, 0) > 0, 'Cloud filter retains a lead');
  assert.ok(filtered.reduce((sum, map) => sum + map.markers, 0) < initial.reduce((sum, map) => sum + map.markers, 0), 'Cloud filter narrows markers');
  await page.locator('[data-t="leads"]').click();
  await page.locator('#addrSearch').fill('');
  await page.locator('[data-t="maps"]').click();
  const restored = await mapsSnapshot('filter cleared');
  assert.deepEqual(restored.map(map => map.markers), initial.map(map => map.markers), 'clear filter restores markers');
  await page.screenshot({ path: path.join(outputDir, 'maps.png'), fullPage: true });
  assert.deepEqual(report.pageErrors, [], 'no uncaught browser errors');
  report.passed = true;
} catch (error) {
  report.passed = false;
  report.error = String(error.stack || error);
  await page.screenshot({ path: path.join(outputDir, 'failure.png'), fullPage: true }).catch(() => {});
} finally {
  await fs.writeFile(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
}
if (!report.passed) process.exitCode = 1;
