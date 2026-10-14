import { scrapeWithCheerio, ScrapeResult } from './cheerio';
import { scrapeWithPlaywright } from './playwright';

const PLAYWRIGHT_DOMAINS = [
  'amazon.in',
  'amazon.com',
  'flipkart.com',
  'myntra.com',
];

function needsPlaywright(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.replace('www.', '');
    return PLAYWRIGHT_DOMAINS.some((d) => hostname.includes(d));
  } catch {
    return false;
  }
}

export async function scrape(url: string, selector: string): Promise<ScrapeResult> {
  if (needsPlaywright(url)) {
    console.log('[scraper] Using Playwright for', url);
    return scrapeWithPlaywright(url, selector);
  }
  console.log('[scraper] Using Cheerio for', url);
  return scrapeWithCheerio(url, selector);
}

export { ScrapeResult };
