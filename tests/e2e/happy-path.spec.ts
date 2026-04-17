import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(__dirname, '../fixtures/checkerboard-small.png');
const fixtureBytes = Array.from(readFileSync(fixturePath));

test('happy path: load images, add points, export PNG', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toHaveText('Metro-Warp');

  // Inject the fixture into both panes via the store exposed on window.__store
  await page.evaluate(async (bytes: number[]) => {
    const s = (window as any).__store;
    if (!s) throw new Error('__store not found on window — DEV mode hook missing');
    const file = new File([new Uint8Array(bytes)], 'fixture.png', { type: 'image/png' });
    await s.loadImage('schematic', file);
    await s.loadImage('geographic', file);
  }, fixtureBytes);

  // Give Svelte reactivity a moment to settle
  await page.waitForTimeout(500);

  // Add 4 paired points programmatically via the store
  await page.evaluate(async () => {
    const s = (window as any).__store;
    const labels = ['A', 'B', 'C', 'D'];
    const positions: [number, number][] = [[5, 5], [55, 5], [5, 55], [55, 55]];
    for (let i = 0; i < 4; i++) {
      const label = labels[i];
      const pos = positions[i];
      if (label && pos) {
        s.addPoint('schematic', label, pos[0], pos[1]);
        s.addPoint('geographic', label, pos[0] + 2, pos[1] + 2);
      }
    }
  });

  // The "Paired (4)" text should appear in PointList
  await expect(page.locator('text=Paired (4)')).toBeVisible({ timeout: 5000 });

  // Trigger export and assert a download is initiated
  const downloadPromise = page.waitForEvent('download', { timeout: 30_000 });
  await page.locator('button', { hasText: 'Export PNG' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain('warped.png');
});
