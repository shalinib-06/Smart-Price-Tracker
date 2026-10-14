import axios, { AxiosRequestConfig } from 'axios';
import * as cheerio from 'cheerio';

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
];

const domainLastHit: Record<string, number> = {};
const RATE_LIMIT_MS = 2000;

function randomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

async function respectRateLimit(url: string): Promise<void> {
  const hostname = new URL(url).hostname;
  const lastHit = domainLastHit[hostname] ?? 0;
  const now = Date.now();
  const wait = RATE_LIMIT_MS - (now - lastHit);
  if (wait > 0) {
    await new Promise((r) => setTimeout(r, wait + Math.random() * 500));
  }
  domainLastHit[hostname] = Date.now();
}

export interface ScrapeResult {
  rawText: string | null;
  price: number | null;
  currency: string;
  inStock: boolean;
}

export function parsePriceAndCurrency(text: string | null | undefined, domain?: string): { price: number | null; currency: string } {
  if (!text) return { price: null, currency: 'USD' };
  const d = (domain || '').toLowerCase();
  let currency = 'USD';

  if (text.indexOf('\u20B9') !== -1 || /rs\.?|inr/i.test(text) || d.includes('.in') || d.includes('flipkart') || d.includes('myntra')) {
    currency = 'INR';
  } else if (text.includes('\u00A3') || d.includes('.co.uk')) {
    currency = 'GBP';
  } else if (text.includes('\u20AC')) {
    currency = 'EUR';
  }

  // Remove currency signs & words: $, Rs, INR, MRP, etc.
  const cleaned = text.replace(/[\$\u20B9\u00A3\u20AC]/g, ' ')
                      .replace(/(?:^|\s)(?:rs\.?|inr|mrp)(?:\s|$)/gi, ' ')
                      .trim();

  // Extract number pattern like 1,49,999.00 or 1,299 or 49.99
  const m = cleaned.match(/([0-9]{1,3}(?:,[0-9]{2,3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/);
  if (!m) return { price: null, currency };

  const num = parseFloat(m[1].replace(/,/g, ''));
  return {
    price: isNaN(num) ? null : num,
    currency,
  };
}

export function parsePrice(text: string, domain?: string): number | null {
  return parsePriceAndCurrency(text, domain).price;
}

export function detectInStock(html: string): boolean {
  const lower = html.toLowerCase();
  const outPatterns = ['out of stock', 'currently unavailable', 'sold out', 'not available', 'unavailable'];
  return !outPatterns.some((p) => lower.includes(p));
}

// Retailer-specific auto-selectors for Amazon & Flipkart
function tryRetailerSpecificSelectors($: cheerio.CheerioAPI, url: string): { rawText: string | null; price: number | null } | null {
  const d = url.toLowerCase();
  if (d.includes('amazon.')) {
    const amazonSelectors = [
      '.priceToPay span.a-price-whole',
      'span.a-price span.a-offscreen',
      '#priceblock_ourprice',
      '#priceblock_dealprice',
      '#corePrice_feature_div .a-price-whole',
      '#corePriceDisplay_desktop_feature_div .a-price-whole',
      '.apexPriceToPay span.a-offscreen',
    ];
    for (const sel of amazonSelectors) {
      const el = $(sel);
      if (el.length > 0) {
        const txt = el.first().text().trim();
        const p = parsePrice(txt, url);
        if (p !== null) return { rawText: txt, price: p };
      }
    }
  } else if (d.includes('flipkart.')) {
    const flipkartSelectors = [
      'div._30jeq3._16Jk6d',
      'div._30jeq3',
      'div._25b18c ._30jeq3',
      'div.Nx9daj',
    ];
    for (const sel of flipkartSelectors) {
      const el = $(sel);
      if (el.length > 0) {
        const txt = el.first().text().trim();
        const p = parsePrice(txt, url);
        if (p !== null) return { rawText: txt, price: p };
      }
    }
  }
  return null;
}

export async function scrapeWithCheerio(url: string, selector: string): Promise<ScrapeResult> {
  await respectRateLimit(url);

  const config: AxiosRequestConfig = {
    headers: {
      'User-Agent': randomUserAgent(),
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-IN,en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
    },
    timeout: 15000,
    maxRedirects: 5,
  };

  const response = await axios.get(url, config);
  const dollar = cheerio.load(response.data as string);
  const inStock = detectInStock(response.data as string);

  // 1. First try given selector
  const el = dollar(selector);
  if (el.length > 0) {
    const rawText = el.first().text().trim();
    const { price, currency } = parsePriceAndCurrency(rawText, url);
    if (price !== null) {
      return { rawText, price, currency, inStock };
    }
  }

  // 2. Fallback to retailer-specific selectors (e.g. Amazon / Flipkart price classes)
  const retailerMatch = tryRetailerSpecificSelectors(dollar, url);
  if (retailerMatch && retailerMatch.price !== null) {
    const { currency } = parsePriceAndCurrency(retailerMatch.rawText, url);
    return { rawText: retailerMatch.rawText, price: retailerMatch.price, currency, inStock };
  }

  const { currency } = parsePriceAndCurrency(null, url);
  return { rawText: null, price: null, currency, inStock };
}