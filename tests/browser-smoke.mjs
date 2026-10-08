import assert from 'node:assert/strict';
import { chromium, firefox, webkit } from 'playwright';

for (const [name, type] of Object.entries({ chromium, firefox, webkit })) {
  const browser = await type.launch({headless: true});
  const page = await browser.newPage({viewport: {width: 1440, height: 900}, acceptDownloads:true});
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const settle = () => page.evaluate(() => new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve))));
  try {
    await page.goto('http://127.0.0.1:8787/', {waitUntil:'networkidle'});
    await page.locator('#engineDot.ready').waitFor({timeout:45000});
    await settle();
    assert.match(await page.locator('#engineStatus').innerText(), /RUST ENGINE ONLINE/);
    assert.notEqual((await page.locator('#pathLength').innerText()).trim(), '—');

    const original = await page.locator('#sourceShape').getAttribute('d');
    const node = page.locator('[data-control="anchor"][data-index="0"]');
    const box = await node.boundingBox();
    assert.ok(box, `${name}: anchor is not visible`);
    await page.mouse.move(box.x + box.width/2, box.y + box.height/2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width/2 + 35, box.y + box.height/2 + 18, {steps:6});
    await page.mouse.up();
    await page.waitForTimeout(100);
    assert.notEqual(await page.locator('#sourceShape').getAttribute('d'), original);
    await page.locator('#undo').click();
    await settle();
    assert.equal(await page.locator('#sourceShape').getAttribute('d'), original);

    await page.locator('[data-tab="combine"]').click();
    await settle();
    const union = await page.locator('#resultShape').getAttribute('d');
    assert.ok(union?.length > 12, `${name}: union result is missing`);
    await page.locator('[data-operation="difference"]').click();
    await settle();
    const subtraction = await page.locator('#resultShape').getAttribute('d');
    assert.ok(subtraction?.length > 12, `${name}: subtract result is missing`);
    assert.notEqual(union, subtraction);

    await page.locator('[data-tab="inspect"]').click();
    await page.locator('[data-inspection="points"]').click();
    await settle();
    assert.equal(await page.locator('#sampleLayer circle').count(), 12);
    await page.locator('[data-inspection="offset"]').click();
    await settle();
    assert.ok((await page.locator('#resultShape').getAttribute('d'))?.length > 12);

    await page.locator('#themeButton').click();
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#exportButton').click(),
    ]);
    assert.equal(download.suggestedFilename(), 'pfx-vector-lab.svg');
    assert.deepEqual(errors, [], `${name}: unexpected browser JavaScript errors`);
    console.log(`${name}: consumer UI + real WASM: PASS`);
  } finally { await browser.close(); }
}
