import { test, expect } from '@playwright/test';

test('intro preserves layout, theme persistence, copy, and existing workspace links', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true,
      value: { writeText: async text => { window.copiedText = text; } } });
  });
  await page.goto('/loading');
  await expect(page.getByRole('heading', { name: 'React following deveguide by Next.js' })).toBeVisible();
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(0, 0, 0)');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Switch to Docs purple color mode' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'docs');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'docs');
  await page.getByRole('button', { name: 'Switch to normal black and white color mode' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'normal');
  await page.getByRole('button', { name: 'คัดลอก', exact: true }).click();
  await expect(page.getByRole('button', { name: 'คัดลอกแล้ว', exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.copiedText)).toContain("import { Lsupergen }");
  await expect(page.getByRole('link', { name: 'Open Workspace', exact: true })).toHaveAttribute('href', 'https://agents-sdk.space/');
  await expect(page.getByRole('link', { name: 'Open Chat', exact: true })).toHaveAttribute('href', 'https://agents-sdk.space/chat');
  expect(errors).toEqual([]);
});

test('root keeps session decisions on the existing backend; protected pages are not duplicated', async ({ request }) => {
  const root = await request.get('/', { maxRedirects: 0 });
  expect(root.status()).toBe(307);
  expect(root.headers().location).toBe('https://agents-sdk.space/');
  expect((await request.get('/chat')).status()).toBe(404);
  expect((await request.get('/api/chat')).status()).toBe(404);
});
