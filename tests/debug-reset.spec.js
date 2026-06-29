import { test, expect } from '@playwright/test';

test.describe('debug resetPage', () => {
  test('article status and click', async ({ page }) => {
    await page.goto('http://localhost:8901/index.html');
    await page.waitForTimeout(1000);

    const status = await page.evaluate(() => {
      const article = document.querySelector('article');
      return {
        exists: !!article,
        offsetWidth: article?.offsetWidth || 0,
        offsetHeight: article?.offsetHeight || 0,
        clientWidth: article?.clientWidth || 0,
        clientHeight: article?.clientHeight || 0,
        computedStyle: article ? JSON.stringify({
          display: getComputedStyle(article).display,
          visibility: getComputedStyle(article).visibility,
          opacity: getComputedStyle(article).opacity,
          position: getComputedStyle(article).position,
          zIndex: getComputedStyle(article).zIndex,
        }) : null,
        children: article?.children?.length || 0,
        innerHTML: article?.innerHTML?.substring(0, 100) || '',
      };
    });
    console.log('Article status:', JSON.stringify(status, null, 2));

    try {
      await page.click('article');
      console.log('Click succeeded');
    } catch (e) {
      console.error('Click failed:', e.message);
    }
  });

  test('resetPage flow', async ({ page }) => {
    await page.goto('http://localhost:8901/index.html?_t=123456');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(300);

    const status = await page.evaluate(() => {
      const article = document.querySelector('article');
      return {
        exists: !!article,
        offsetWidth: article?.offsetWidth || 0,
        offsetHeight: article?.offsetHeight || 0,
        computedStyle: article ? JSON.stringify({
          display: getComputedStyle(article).display,
          visibility: getComputedStyle(article).visibility,
        }) : null,
      };
    });
    console.log('Before click:', JSON.stringify(status, null, 2));

    try {
      await page.click('article');
      console.log('Click succeeded');
    } catch (e) {
      console.error('Click failed:', e.message);
    }
  });

  test('page load with console/page errors', async ({ page }) => {
    const logs = [];
    page.on('console', msg => logs.push(`[CONSOLE ${msg.type()}] ${msg.text()}`));
    page.on('pageerror', err => logs.push(`[PAGE ERROR] ${err.message}`));

    await page.goto('http://localhost:8901/index.html?_t=123456');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    console.log('Logs:', logs.join('\n'));

    const status = await page.evaluate(() => {
      const article = document.querySelector('article');
      return {
        exists: !!article,
        offsetWidth: article?.offsetWidth || 0,
        offsetHeight: article?.offsetHeight || 0,
        children: article?.children?.length || 0,
        innerHTML: article?.innerHTML?.substring(0, 200) || '',
      };
    });
    console.log('Article status:', JSON.stringify(status, null, 2));
  });

  test('page load - non-200 responses', async ({ page }) => {
    const responses = [];
    page.on('response', async response => {
      if (response.status() !== 200) {
        responses.push(`${response.status()} ${response.url()}`);
      }
    });

    await page.goto('http://localhost:8901/index.html?_t=123456');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    console.log('Non-200 responses:', responses);

    const status = await page.evaluate(() => {
      const article = document.querySelector('article');
      return {
        exists: !!article,
        offsetWidth: article?.offsetWidth || 0,
        offsetHeight: article?.offsetHeight || 0,
        children: article?.children?.length || 0,
        innerHTML: article?.innerHTML?.substring(0, 200) || '',
      };
    });
    console.log('Article status:', JSON.stringify(status, null, 2));
  });
});
