import axios from 'axios';

const TG_BASE = 'https://api.telegram.org/bot';

export interface TelegramMsg {
  text: string;
  chatId?: string;
}

export async function sendTelegramMessage(msg: TelegramMsg): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = msg.chatId ?? process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.warn('[telegram] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set - skipping');
    return;
  }

  await axios.post(
    `${TG_BASE}${token}/sendMessage`,
    {
      chat_id: chatId,
      text: msg.text,
      parse_mode: 'HTML',
      disable_web_page_preview: false,
    },
    { timeout: 10000 }
  );
  console.log('[telegram] Message sent to chat', chatId);
}

export function buildPriceAlertMessage(p: {
  label: string;
  retailer?: string | null;
  url: string;
  oldPrice: number | null;
  newPrice: number | null;
  targetPrice?: number | null;
  oldRawText?: string | null;
  newRawText?: string | null;
  currency?: string;
  inStock: boolean;
  eventExplanation?: string;
}): string {
    let curr = p.currency || '$';
  if (curr === 'INR' || curr.toLowerCase() === 'inr') curr = '₹';
  else if (curr === 'GBP' || curr.toLowerCase() === 'gbp') curr = '£';
  else if (curr === 'EUR' || curr.toLowerCase() === 'eur') curr = '€';
  else if (curr === 'USD' || curr.toLowerCase() === 'usd') curr = '$';
  const oldP = p.oldPrice;
  const newP = p.newPrice;

  let header = 'ðŸ”” SMART PRICE TRACKER â€” ALERT';
  let changeLine = '';

  if (oldP !== null && newP !== null && oldP !== newP) {
    const diff = Math.abs(newP - oldP);
    const pct = ((diff / oldP) * 100).toFixed(1);
    if (newP < oldP) {
      header = 'ðŸ“‰ SMART PRICE TRACKER â€” PRICE DROP';
      changeLine = `Price Decrease: <b>-${curr}${diff.toFixed(2)} (${pct}%)</b>\n`;
    } else {
      header = 'ðŸ“ˆ SMART PRICE TRACKER â€” PRICE INCREASE';
      changeLine = `Price Increase: <b>+${curr}${diff.toFixed(2)} (${pct}%)</b>\n`;
    }
  }

  let msg = `<b>${header}</b>\n\n`;
  msg += `<b>Product:</b> ${p.label}\n`;
  if (p.retailer) {
    msg += `<b>Retailer:</b> ${p.retailer}\n`;
  }
  if (p.oldRawText || oldP !== null) {
    msg += `<b>Previous Price:</b> <s>${p.oldRawText || `${curr}${oldP?.toFixed(2)}`}</s>\n`;
  }
  if (p.newRawText || newP !== null) {
    msg += `<b>Current Price:</b> <b>${p.newRawText || `${curr}${newP?.toFixed(2)}`}</b>\n`;
  }
  if (changeLine) {
    msg += changeLine;
  }
  if (p.targetPrice !== undefined && p.targetPrice !== null) {
    msg += `<b>Target Price:</b> ${curr}${Number(p.targetPrice).toFixed(2)}\n`;
  }
  if (p.eventExplanation) {
    msg += `<b>Status:</b> ${p.eventExplanation}\n`;
  }
  if (!p.inStock) {
    msg += `\nâš ï¸ <b>Status:</b> Currently OUT OF STOCK\n`;
  }

  msg += `\n<a href="${p.url}">View Product</a>`;
  return msg;
}

export function buildRestockMessage(p: {
  label: string;
  retailer?: string | null;
  url: string;
  currentPrice: string | null;
}): string {
  let msg = `âœ… <b>SMART PRICE TRACKER â€” RESTOCK ALERT</b>\n\n`;
  msg += `<b>Product:</b> ${p.label}\n`;
  if (p.retailer) msg += `<b>Retailer:</b> ${p.retailer}\n`;
  if (p.currentPrice) msg += `<b>Price:</b> <b>${p.currentPrice}</b>\n`;
  msg += `<b>Status:</b> Back in stock!\n`;
  msg += `\n<a href="${p.url}">Buy Now</a>`;
  return msg;
}