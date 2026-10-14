import { chromium } from 'playwright';
import { ScrapeResult, parsePriceAndCurrency, detectInStock } from './cheerio';

export async function scrapeWithPlaywright(url: string, selector: string): Promise<ScrapeResult> {
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
    ],
  });

  try {
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      viewport: { width: 1366, height: 768 },
      locale: 'en-IN',
    });

    const page = await context.newPage();

    // Abort media to save bandwidth, but allow stylesheets for layout stability
    await page.route('**/*', (route) => {
      const rt = route.request().resourceType();
      if (['image', 'font', 'media'].includes(rt)) {
        route.abort();
      } else {
        route.continue();
      }
    });

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    let rawText: string | null = null;

    // 1. First try requested selector
    try {
      await page.waitForSelector(selector, { timeout: 6000 });
      rawText = await page.$eval(selector, (el) => el.textContent?.trim() ?? null);
    } catch {
      // Fall through to domain-specific selectors
    }

    // 2. Fallbacks for Amazon and Flipkart if primary selector failed
    if (!rawText) {
      const u = url.toLowerCase();
      if (u.includes('amazon.')) {
        const azSelectors = [
          '.priceToPay span.a-price-whole',
          'span.a-price span.a-offscreen',
          '#priceblock_ourprice',
          '#priceblock_dealprice',
          '#corePrice_feature_div .a-price-whole',
          '#corePriceDisplay_desktop_feature_div .a-price-whole',
          '.apexPriceToPay span.a-offscreen',
        ];
        for (const sel of azSelectors) {
          try {
            const found = await page.$eval(sel, (el) => el.textContent?.trim() ?? null);
            if (found) {
              rawText = found;
              break;
            }
          } catch {
            // continue
          }
        }
      } else if (u.includes('flipkart.')) {
        const fkSelectors = [
          'div._30jeq3._16Jk6d',
          'div._30jeq3',
          'div.Nx9daj',
          'div._25b18c ._30jeq3',
        ];
        for (const sel of fkSelectors) {
          try {
            const found = await page.$eval(sel, (el) => el.textContent?.trim() ?? null);
            if (found) {
              rawText = found;
              break;
            }
          } catch {
            // continue
          }
        }
      }
    }

    const html = await page.content();
    const { price, currency } = parsePriceAndCurrency(rawText, url);
    const inStock = detectInStock(html);

    return { rawText, price, currency, inStock };
  } finally {
    await browser.close();
  }
}