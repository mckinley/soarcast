// UX walkthrough: opens SoarCast's screens on a phone and a desktop viewport,
// screenshots each screen top to bottom, runs a few interactions, and records
// load times, console errors, failed requests and the visible text.
//
//   node scripts/ux/walkthrough.mjs prod  https://soarcast.mckinleyaviation.com <out-dir>
//   node scripts/ux/walkthrough.mjs local http://localhost:8790 <out-dir> <seed.json>
//
// local mode signs in as the seeded test pilots (scripts/ux/seed.mjs). It also
// forces the morning alerts run (CRON_SECRET) and renders the digest email that
// wrangler dev wrote to disk (WRANGLER_LOG names the log to find it in).

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const [mode, base, outDir, seedFile] = process.argv.slice(2);
if (!['prod', 'local'].includes(mode) || !base || !outDir) {
  console.error(
    'usage: node scripts/ux/walkthrough.mjs prod|local <base-url> <out-dir> [seed.json]',
  );
  process.exit(1);
}
const seed = seedFile ? JSON.parse(fs.readFileSync(seedFile, 'utf8')) : null;
fs.mkdirSync(outDir, { recursive: true });

const VIEWPORTS = {
  phone: {
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  },
  desktop: { viewport: { width: 1366, height: 900 }, deviceScaleFactor: 1 },
};
const MAX_CHUNKS = 10;

async function clickTabs(page, shoot) {
  // Read the labels first: switching tabs re-renders the tab list
  const labels = await page
    .getByRole('tab')
    .evaluateAll((els) =>
      els
        .filter((el) => el.getAttribute('aria-selected') !== 'true')
        .map((el) => el.textContent.trim()),
    );
  for (const label of labels) {
    const tab = page.getByRole('tab', { name: label, exact: true }).first();
    if (!(await tab.count())) continue;
    await tab.scrollIntoViewIfNeeded();
    await tab.click();
    await page.waitForTimeout(1500);
    await shoot(`tab-${label}`, { fromElement: tab });
  }
}

async function sitePage(page, shoot) {
  // A day later in the week, from the windgram's day tabs
  const later = page.getByRole('tab', { name: /^(Sat|Sun)/ }).first();
  if (await later.count()) {
    await later.scrollIntoViewIfNeeded();
    await later.click();
    await page.waitForTimeout(1500);
    await shoot('later-day', { fromElement: later });
  }
}

// Changing what a site is worth going for re-rates the week: the goal must
// stick after a reload, and the today badge says whether it is a go
async function changeGoal(page, shoot) {
  const trigger = page.getByRole('combobox').first();
  if (!(await trigger.count())) {
    console.log('goal picker: NOT FOUND');
    return;
  }
  const badge = () =>
    page
      .locator('span', { hasText: /^Today: / })
      .first()
      .textContent()
      .catch(() => null);
  const before = await badge();
  await trigger.scrollIntoViewIfNeeded();
  await trigger.click();
  await page.getByRole('option', { name: 'Safe launch is enough' }).click();
  await page.waitForTimeout(2500);
  await page.reload({ waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(1500);
  const after = await badge();
  const goal = await page.getByRole('combobox').first().textContent();
  console.log(`goal change: badge ${before} -> ${after}; picker now "${goal}"`);
  await shoot('goal-safe-launch');
}

// The dashboard must never cover itself with a popup, for new pilots or pilots with sites
async function noPopup(page) {
  const overlays = await page.locator('div.fixed.inset-0').count();
  const welcome = await page.getByText('Welcome to SoarCast').count();
  console.log(`dashboard popup: ${overlays ? 'SHOWN' : 'none'}; welcome text ${welcome}`);
}

async function dashboardTabs(page, shoot) {
  await noPopup(page);
  await clickTabs(page, shoot);
}

function prodPages() {
  return [
    { name: 'home', path: '/' },
    { name: 'signin', path: '/auth/signin' },
    { name: 'dashboard-signed-out', path: '/dashboard' },
    { name: 'browse', path: '/sites/browse', settle: 4000 },
    { name: 'browse-search', path: '/sites/browse?search=chelan', settle: 4000 },
    { name: 'site-tiger', path: '/sites/tiger-mountain', actions: sitePage },
    { name: 'site-chelan', path: '/sites/chelan-butte' },
    { name: 'site-valle', path: '/sites/valle-de-bravo' },
    { name: 'site-missing', path: '/sites/not-a-real-site-xyz' },
    { name: 'add-site-signed-out', path: '/sites/custom/new' },
  ];
}

function localPages() {
  const [first, second] = seed.sites;
  return [
    {
      name: 'dashboard',
      path: '/dashboard',
      user: 'ux-pilot',
      actions: dashboardTabs,
      settle: 3000,
    },
    {
      name: 'site-followed',
      path: `/sites/${first.slug}`,
      user: 'ux-pilot',
      actions: sitePage,
    },
    {
      name: 'site-followed-2',
      path: `/sites/${second.slug}`,
      user: 'ux-pilot',
      actions: changeGoal,
    },
    { name: 'custom-site', path: `/sites/custom/${seed.customSiteId}`, user: 'ux-pilot' },
    {
      name: 'custom-new',
      path: '/sites/custom/new',
      user: 'ux-pilot',
      settle: 3000,
      actions: async (page, shoot) => {
        // Drop a pin by tapping the middle of the map, then let terrain load
        const map = page.locator('.leaflet-container').first();
        if (await map.count()) {
          await map.scrollIntoViewIfNeeded();
          const box = await map.boundingBox();
          if (box) {
            await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
            await page.waitForTimeout(5000);
            await shoot('pin-dropped');
          }
        }
        await page
          .getByRole('button', { name: /add site/i })
          .first()
          .click()
          .catch(() => {});
        await page.waitForTimeout(1000);
        await shoot('submitted-empty');
      },
    },
    {
      name: 'custom-edit',
      path: `/sites/custom/${seed.customSiteId}/edit`,
      user: 'ux-pilot',
      settle: 3000,
    },
    { name: 'settings', path: '/settings', user: 'ux-pilot' },
    { name: 'browse-signed-in', path: '/sites/browse', user: 'ux-pilot', settle: 4000 },
    { name: 'missing-page', path: '/sites/not-a-real-site-xyz', user: 'ux-pilot' },
    {
      name: 'new-user-dashboard',
      path: '/dashboard',
      user: 'ux-newbie',
      actions: noPopup,
    },
  ];
}

const report = [];

// Screenshots the page in viewport-sized slices from the full-page render, so
// long pages read top to bottom. Anything wider than the viewport is cut off,
// as it is for the user (horizontalOverflowPx records how much).
async function capture(page, name, extra = {}) {
  const shots = [];
  const { width, height: vh } = page.viewportSize();
  const size = await page.evaluate(() => ({
    total: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
    overflow: document.documentElement.scrollWidth - window.innerWidth,
  }));
  const start = extra.fromElement
    ? Math.max(
        0,
        Math.floor(
          await extra.fromElement.evaluate((el) => el.getBoundingClientRect().top + window.scrollY),
        ) - 80,
      )
    : 0;
  const max = extra.fromElement ? 4 : MAX_CHUNKS;
  for (let i = 0, y = start; i < max && y < size.total; i++, y += vh) {
    const file = `${name}-${String(i + 1).padStart(2, '0')}.png`;
    await page.screenshot({
      path: path.join(outDir, file),
      fullPage: true,
      clip: { x: 0, y, width, height: Math.min(vh, size.total - y) },
    });
    shots.push(file);
  }
  return { shots, pageHeight: size.total, horizontalOverflowPx: Math.max(0, size.overflow) };
}

async function visit(context, vpName, spec) {
  const page = await context.newPage();
  const errors = [];
  const failed = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning')
      errors.push(`${m.type()}: ${m.text().slice(0, 300)}`);
  });
  page.on('response', (r) => {
    if (r.status() >= 400)
      failed.push(`${r.status()} ${r.request().method()} ${r.url().slice(0, 200)}`);
  });
  page.on('requestfailed', (r) =>
    failed.push(`failed ${r.url().slice(0, 200)}: ${r.failure()?.errorText}`),
  );

  const entry = { viewport: vpName, name: spec.name, path: spec.path };
  const t0 = Date.now();
  try {
    const res = await page.goto(base + spec.path, {
      waitUntil: 'domcontentloaded',
      timeout: 120000,
    });
    entry.status = res?.status();
    entry.finalUrl = page.url().replace(base, '');
    entry.domContentLoadedMs = Date.now() - t0;
    await page.waitForLoadState('networkidle', { timeout: 25000 }).catch(() => {
      entry.networkIdleTimedOut = true;
    });
    entry.settledMs = Date.now() - t0;
    await page.waitForTimeout(spec.settle ?? 1500);
    entry.timing = await page.evaluate(() => {
      const n = performance.getEntriesByType('navigation')[0];
      return n
        ? {
            ttfbMs: Math.round(n.responseStart),
            loadMs: Math.round(n.loadEventEnd),
            transferKb: Math.round(n.transferSize / 1024),
          }
        : null;
    });
    entry.title = await page.title();
    entry.text = (await page.evaluate(() => document.body.innerText))
      .replace(/\n{3,}/g, '\n\n')
      .slice(0, 6000);
    const prefix = `${vpName}-${spec.name}`;
    Object.assign(entry, await capture(page, prefix));
    entry.actionShots = [];
    if (spec.actions) {
      await spec.actions(page, async (label, extra = {}) => {
        const r = await capture(
          page,
          `${prefix}--${label.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`,
          extra,
        );
        entry.actionShots.push(...r.shots);
      });
    }
  } catch (e) {
    entry.error = String(e).slice(0, 500);
    await page
      .screenshot({ path: path.join(outDir, `${vpName}-${spec.name}-error.png`) })
      .catch(() => {});
  }
  entry.consoleErrors = errors.slice(0, 20);
  entry.failedRequests = failed.slice(0, 20);
  report.push(entry);
  console.log(
    `${vpName} ${spec.name}: ${entry.status ?? 'ERR'} ${entry.finalUrl ?? ''} dom=${entry.domContentLoadedMs}ms settled=${entry.settledMs}ms shots=${entry.shots?.length ?? 0} errors=${errors.length} failed=${failed.length}`,
  );
  await page.close();
}

async function digestEmail(browser) {
  const res = await fetch(`${base}/api/notifications/check?run=morning`, {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
  const body = await res.text();
  console.log(`alerts run: HTTP ${res.status} ${body.slice(0, 1500)}`);
  report.push({ viewport: '-', name: 'alerts-run', status: res.status, text: body.slice(0, 4000) });
  await new Promise((r) => setTimeout(r, 3000));
  const log = process.env.WRANGLER_LOG ? fs.readFileSync(process.env.WRANGLER_LOG, 'utf8') : '';
  // Local dev writes each email's HTML and text parts to files and logs their paths
  const htmlFiles = [...new Set([...log.matchAll(/HTML: (\S+\.html)/g)].map((m) => m[1]))];
  console.log(`emails written: ${htmlFiles.join(', ') || 'none'}`);
  for (const [i, file] of htmlFiles.entries()) {
    const html = fs.readFileSync(file, 'utf8');
    fs.writeFileSync(path.join(outDir, `email-${i + 1}.html`), html);
    for (const [vpName, vp] of Object.entries(VIEWPORTS)) {
      const ctx = await browser.newContext(vp);
      const page = await ctx.newPage();
      await page.setContent(html, { waitUntil: 'networkidle' }).catch(() => {});
      const r = await capture(page, `${vpName}-email-${i + 1}`);
      report.push({
        viewport: vpName,
        name: `email-${i + 1}`,
        ...r,
        text: (await page.evaluate(() => document.body.innerText)).slice(0, 4000),
      });
      await ctx.close();
    }
  }
}

// Builds the forecast track records the site pages show (a few seconds each
// the first time), so the screenshots catch them loaded: Tiger, and
// Roldanillo in Colombia, where model rain is little trusted.
async function trackRecords() {
  for (const [name, lat, lng] of [
    ['tiger', 47.4995, -122.009],
    ['roldanillo', 4.407, -76.203],
  ]) {
    const started = Date.now();
    const res = await fetch(`${base}/api/track-record?lat=${lat}&lng=${lng}`);
    const body = await res.text();
    const ms = Date.now() - started;
    console.log(`track record ${name}: HTTP ${res.status} in ${ms} ms ${body.slice(0, 600)}`);
    report.push({
      viewport: '-',
      name: `track-record-${name}`,
      status: res.status,
      ms,
      text: body,
    });
  }
}

if (mode === 'local') await trackRecords().catch((e) => console.log(`track records: ${e}`));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const pages = mode === 'prod' ? prodPages() : localPages();
const host = new URL(base).hostname;
for (const [vpName, vp] of Object.entries(VIEWPORTS)) {
  const contexts = {};
  for (const spec of pages) {
    const key = spec.user ?? 'anon';
    if (!contexts[key]) {
      contexts[key] = await browser.newContext({
        ...vp,
        locale: 'en-US',
        timezoneId: 'America/Los_Angeles',
        geolocation: { latitude: 47.4957, longitude: -121.7868 },
        permissions: ['geolocation'],
      });
      if (spec.user) {
        await contexts[key].addCookies([
          {
            name: 'better-auth.session_token',
            value: seed.sessions[spec.user],
            domain: host,
            path: '/',
          },
        ]);
      }
    }
    await visit(contexts[key], vpName, spec);
  }
  for (const ctx of Object.values(contexts)) await ctx.close();
}
if (mode === 'local') await digestEmail(browser).catch((e) => console.log(`digest: ${e}`));
await browser.close();

fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
console.log(`Wrote ${report.length} entries to ${outDir}/report.json`);
