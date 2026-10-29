import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

const server = createServer(async (req, res) => {
  const path = req.url?.split('?')[0] === '/proposal.html' ? 'proposal.html' : 'index.html';
  try {
    const html = await readFile(resolve(process.cwd(), path), 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  } catch (error) {
    res.writeHead(500);
    res.end(String(error));
  }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const port = server.address().port;
const base = 'http://127.0.0.1:' + port + '/';
const browser = await chromium.launch({ headless: true });
let checks = 0;
const check = (condition, description) => {
  assert.ok(condition, description);
  checks++;
  console.log('PASS: ' + description);
};
try {
  for (const width of [320, 390, 768, 1440]) {
    const mobile = width < 800;
    const page = await browser.newPage({ viewport: { width, height: 800 }, isMobile: mobile, hasTouch: mobile });
    const scriptErrors = [];
    page.on('pageerror', error => scriptErrors.push(String(error)));
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    check(await page.locator('#hero-title').isVisible(), 'Main title at ' + width);
    check(await page.locator('.hero-image').evaluate(img => img.complete && img.naturalWidth > 0), 'Embedded food photo at ' + width);
    const widths = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, view: window.innerWidth }));
    check(widths.scroll <= widths.view + 2, 'No horizontal overflow at ' + width + ' (scroll=' + widths.scroll + ', view=' + widths.view + ')');
    check(await page.locator('article.product-card').count() === 3, 'Catalog has three demo categories at ' + width);
    check(scriptErrors.length === 0, 'No uncaught JavaScript errors at ' + width + ': ' + scriptErrors.join('; '));

    if (mobile && width === 390) {
      await page.locator('#menuToggle').click();
      check(await page.locator('#mobileMenu').isVisible(), 'Mobile menu opens');
      await page.locator('#mobileMenu a[href="#locations"]').click();
      check(await page.locator('#menuToggle').getAttribute('aria-expanded') === 'false', 'Mobile menu closes on navigation');
      await page.locator('button.tab[data-filter="grill"]').click();
      check(await page.locator('article.product-card:visible').count() === 1, 'Catalog category filter');
      await page.locator('button.tab[data-filter="all"]').click();
      check(await page.locator('article.product-card:visible').count() === 3, 'Catalog category reset');
      const search = page.locator('#locationSearch');
      await search.fill('9-й');
      check(await page.locator('article.location-card:visible').count() === 1, 'Store search finds a specific record');
      await search.fill('невозможный адрес 4537');
      check(await page.locator('article.location-card:visible').count() === 0, 'Store search handles empty results');
      check(await page.locator('#locationEmpty').isVisible(), 'No-results explanation visible');
      await page.locator('#clearSearch').click();
      check(await page.locator('article.location-card:visible').count() === 2, 'Clear button restores stores');
      await page.locator('.faq-list details').first().locator('summary').click();
      check(await page.locator('.faq-list details').first().getAttribute('open') !== null, 'FAQ opens');
    }
    await page.goto(base + 'proposal.html', { waitUntil: 'domcontentloaded' });
    check(await page.locator('h1').isVisible(), 'Owner presentation has heading at ' + width);
    const proposalWidths = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, view: window.innerWidth }));
    check(proposalWidths.scroll <= proposalWidths.view + 2, 'Owner presentation no overflow at ' + width + ' (scroll=' + proposalWidths.scroll + ', view=' + proposalWidths.view + ')');
    check(await page.locator('a[href="./"]').count() >= 2, 'Proposal links to live demo at ' + width);
    if (width === 390) {
      await page.locator('a[href="./"]').first().click();
      check(new URL(page.url()).pathname === '/', 'Proposal button opens demo');
    }
    await page.close();
  }
  for (const [url, needed] of [
    ['https://podaroknebes0708-hue.github.io/nasha-marka-demo/', 'НАША МАРКА'],
    ['https://podaroknebes0708-hue.github.io/nasha-marka-demo/proposal.html', 'ОДНА СЕТЬ']
  ]) {
    const result = await fetch(url, { signal: AbortSignal.timeout(25000) });
    const html = await result.text();
    check(result.status === 200, 'Public URL HTTP 200: ' + url);
    check(html.includes(needed), 'Public URL includes expected content: ' + url);
  }
  console.log('ALL ' + checks + ' CHECKS PASSED');
} finally {
  await browser.close();
  await new Promise(done => server.close(done));
}
