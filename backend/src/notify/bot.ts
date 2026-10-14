import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';
dotenv.config();
import { query, queryOne } from '../db';
import { scrape } from '../scraper';

let botInstance: TelegramBot | null = null;

// Emoji constants using String.fromCodePoint to avoid encoding issues
const E = {
  PKG: String.fromCodePoint(0x1F4E6),    // package
  FIRE: String.fromCodePoint(0x1F525),   // fire
  GLOBE: String.fromCodePoint(0x1F310),  // globe
  REFRESH: String.fromCodePoint(0x1F504),// refresh
  CHART: String.fromCodePoint(0x1F4CA),  // chart
  STOP: String.fromCodePoint(0x23F9),    // stop
  PLAY: String.fromCodePoint(0x25B6),    // play
  WAVE: String.fromCodePoint(0x1F44B),   // wave
  CHECK: String.fromCodePoint(0x2705),   // check
  CROSS: String.fromCodePoint(0x274C),   // cross
  CART: String.fromCodePoint(0x1F6D2),   // cart
  MONEY: String.fromCodePoint(0x1F4B5),  // money
  TAG: String.fromCodePoint(0x1F3F7),    // tag
  GEM: String.fromCodePoint(0x1F48E),    // gem
  BULB: String.fromCodePoint(0x1F4A1),   // bulb
  LINK: String.fromCodePoint(0x1F517),   // link
  SCALE: String.fromCodePoint(0x2696),   // scale
  ZAP: String.fromCodePoint(0x26A1),     // lightning
  STAR: String.fromCodePoint(0x1F31F),   // star
  SPARKLE: String.fromCodePoint(0x2728), // sparkles
  TARGET: String.fromCodePoint(0x1F3AF), // target
  UP: String.fromCodePoint(0x1F4C8),     // chart up
  INFO: String.fromCodePoint(0x2139),    // info
  BELL: String.fromCodePoint(0x1F514),   // bell
  MUTED: String.fromCodePoint(0x1F515),  // muted bell
  TROPHY: String.fromCodePoint(0x1F3C6), // trophy
  SHIELD: String.fromCodePoint(0x1F6E1), // shield
  EYES: String.fromCodePoint(0x1F440),   // eyes
  ROCKET: String.fromCodePoint(0x1F680), // rocket
  DOWN: String.fromCodePoint(0x1F4C9),   // chart down
  HOUSE: String.fromCodePoint(0x1F3E0),  // house
};

export const DEFAULT_KEYBOARD = {
  keyboard: [
    [
      { text: `${E.PKG} My Watchlist` },
      { text: `${E.FIRE} Best Deals` }
    ],
    [
      { text: `${E.GLOBE} Browse by Store` },
      { text: `${E.REFRESH} Refresh Prices` }
    ],
    [
      { text: `${E.CHART} Savings Summary` },
      { text: `${E.BELL} Notifications` }
    ]
  ],
  resize_keyboard: true,
  persistent: true,
};

function formatCurrency(price: number | null | undefined, currency?: string, rawText?: string): string {
  if (rawText && (rawText.includes('\u20B9') || rawText.includes('$') || rawText.includes('\u00A3') || rawText.includes('\u20AC'))) {
    return rawText;
  }
  if (price === null || price === undefined || isNaN(Number(price))) return '--';
  const num = Number(price);
  const cur = (currency || 'USD').toUpperCase();
  if (cur === 'INR') return `\u20B9${num.toLocaleString('en-IN')}`;
  if (cur === 'GBP') return `\u00A3${num.toFixed(2)}`;
  if (cur === 'EUR') return `\u20AC${num.toFixed(2)}`;
  return `$${num.toFixed(2)}`;
}

function getUserQuery(chatId: string): { clause: string; params: any[] } {
  return {
    clause: `(t.user_id = (SELECT user_id FROM users WHERE telegram_chat_id = $1 LIMIT 1) OR t.user_id = 'default')`,
    params: [chatId]
  };
}

export function initTelegramBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.warn('[telegram-bot] TELEGRAM_BOT_TOKEN not provided, interactive bot skipped.');
    return;
  }

  botInstance = new TelegramBot(token, { polling: true });
  console.log('[telegram-bot] Interactive Bot running with Production Keyboards!');

  botInstance.setMyCommands([
    { command: 'watchlist', description: 'View all tracked products' },
    { command: 'deals', description: 'Top deals with best price scores' },
    { command: 'stores', description: 'Browse products by retailer' },
    { command: 'refresh', description: 'Live check all product prices' },
    { command: 'summary', description: 'Portfolio savings summary' },
    { command: 'help', description: 'Help & instructions' },
  ]).catch(err => console.warn('[bot] Failed to set commands:', err.message));

  // ---- /start with deep-link ----
  botInstance.onText(/\/start(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id.toString();
    const param = match ? match[1] : null;

    if (param && param.startsWith('link_')) {
      const userId = param.replace('link_', '');
      try {
        await query(
          `INSERT INTO users (user_id, telegram_chat_id, telegram_verified)
           VALUES ($1, $2, true)
           ON CONFLICT (user_id) DO UPDATE SET telegram_chat_id = EXCLUDED.telegram_chat_id, telegram_verified = true`,
          [userId, chatId]
        );
        botInstance?.sendMessage(
          chatId,
          `${E.CHECK} <b>Account Linked Successfully!</b>\n\n` +
          `Your Telegram is now connected to:\n` +
          `<code>${userId}</code>\n\n` +
          `${E.BELL} You'll receive instant alerts when:\n` +
          `  \u2022 Prices drop on your tracked products\n` +
          `  \u2022 Out-of-stock items come back\n` +
          `  \u2022 A product hits your target price\n\n` +
          `<i>Use the menu below to get started.</i>`,
          { parse_mode: 'HTML', reply_markup: DEFAULT_KEYBOARD }
        );
      } catch (err: any) {
        console.error('[bot] Link error:', err.message);
        botInstance?.sendMessage(chatId, `${E.CROSS} Linking failed. Please try again.`);
      }
      return;
    }

    const welcome =
      `${E.WAVE} <b>Welcome to Smart Price Tracker!</b>\n\n` +
      `Your personal price monitoring assistant.\n\n` +
      `${E.PKG} <b>Track products</b> across Amazon, Flipkart & more\n` +
      `${E.CHART} <b>View price history</b> with trend analysis\n` +
      `${E.BELL} <b>Get instant alerts</b> when prices drop\n\n` +
      `<i>Choose an option from the menu below:</i>`;

    botInstance?.sendMessage(chatId, welcome, {
      parse_mode: 'HTML',
      reply_markup: DEFAULT_KEYBOARD
    });
  });

  // ---- Message handler ----
  botInstance.on('message', async (msg) => {
    const text = (msg.text || '').trim();
    const chatId = msg.chat.id.toString();

    // Skip /start (handled by onText above)
    if (text.startsWith('/start')) return;

    try {
      if (text === `${E.PKG} My Watchlist` || text === '/watchlist') {
        await sendAllItems(chatId);
      } else if (text === `${E.FIRE} Best Deals` || text === '/deals') {
        await sendBestDeals(chatId);
      } else if (text === `${E.GLOBE} Browse by Store` || text === '/stores') {
        await sendStoresMenu(chatId);
      } else if (text === `${E.REFRESH} Refresh Prices` || text === '/refresh') {
        await runRefreshPrices(chatId);
      } else if (text === `${E.CHART} Savings Summary` || text === '/summary') {
        await sendSavingsSummary(chatId);
      } else if (text === `${E.BELL} Notifications`) {
        await sendNotificationOptions(chatId);
      } else if (text === '/help') {
        await sendHelp(chatId);
      }
    } catch (err: any) {
      console.error(`[bot] Error handling "${text}":`, err.message);
      botInstance?.sendMessage(chatId, `${E.CROSS} Something went wrong. Please try again.`, { reply_markup: DEFAULT_KEYBOARD });
    }
  });

  // ---- Callback query handler ----
  botInstance.on('callback_query', async (cbQuery) => {
    const chatId = cbQuery.message?.chat.id.toString();
    const data = cbQuery.data;
    if (!chatId || !data) return;

    botInstance?.answerCallbackQuery(cbQuery.id);

    try {
      if (data === 'browse_stores') {
        await sendStoresMenu(chatId);
      } else if (data === 'view_all_items') {
        await sendAllItems(chatId);
      } else if (data === 'view_deals') {
        await sendBestDeals(chatId);
      } else if (data.startsWith('store_')) {
        const retailer = data.replace('store_', '');
        await sendItemsForStore(chatId, retailer);
      } else if (data.startsWith('hist_')) {
        const itemId = data.replace('hist_', '');
        await sendItemPriceHistory(chatId, itemId);
      } else if (data === 'pause_notifs') {
        await handlePauseNotifications(chatId);
      } else if (data === 'resume_notifs') {
        await handleResumeNotifications(chatId);
      }
    } catch (err: any) {
      console.error(`[bot] Callback error "${data}":`, err.message);
      botInstance?.sendMessage(chatId, `${E.CROSS} Something went wrong.`);
    }
  });
}

// ========================================================
// 1. WATCHLIST
// ========================================================
async function sendAllItems(chatId: string) {
  const items = await query<{ id: string; label: string; retailer: string; currency: string; url: string; raw_text: string; current_price: number }>(
    `SELECT t.id, t.label, t.retailer, t.currency, t.url, ph.price as current_price, ph.raw_text
     FROM tracked_items t
     LEFT JOIN LATERAL (
       SELECT price, raw_text FROM price_history WHERE item_id = t.id ORDER BY checked_at DESC LIMIT 1
     ) ph ON TRUE
     WHERE t.deleted_at IS NULL
       AND (t.user_id = (SELECT user_id FROM users WHERE telegram_chat_id = $1 LIMIT 1) OR t.user_id = 'default')
     ORDER BY t.created_at DESC LIMIT 15`,
    [chatId]
  );

  if (items.length === 0) {
    botInstance?.sendMessage(
      chatId,
      `${E.CART} <b>Your watchlist is empty!</b>\n\n` +
      `Open any product page in Chrome and click\n<b>Track Price</b> to start monitoring.`,
      { parse_mode: 'HTML', reply_markup: DEFAULT_KEYBOARD }
    );
    return;
  }

  let msg = `${E.PKG} <b>YOUR WATCHLIST</b>  <i>(${items.length} products)</i>\n`;
  msg += `${''.padStart(32, '\u2500')}\n\n`;

  items.forEach((item, idx) => {
    const price = formatCurrency(item.current_price, item.currency, item.raw_text);
    const name = item.label ? (item.label.length > 40 ? item.label.substring(0, 40) + '...' : item.label) : 'Product';
    const store = item.retailer || 'Store';
    msg += `<b>${idx + 1}. ${name}</b>\n`;
    msg += `   ${E.GLOBE} ${store}  \u2022  ${E.MONEY} <b>${price}</b>\n\n`;
  });

  msg += `<i>Tap a product below to view price history:</i>`;

  const buttons = items.map((i) => {
    const price = formatCurrency(i.current_price, i.currency, i.raw_text);
    const name = i.label ? i.label.substring(0, 22) : 'Item';
    return [{ text: `${E.CHART} ${name} (${price})`, callback_data: `hist_${i.id}` }];
  });

  botInstance?.sendMessage(chatId, msg, {
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: buttons }
  });
}

// ========================================================
// 2. BEST DEALS
// ========================================================
async function sendBestDeals(chatId: string) {
  const items = await query<{
    id: string; label: string; retailer: string; currency: string;
    current_price: number; raw_text: string; target_price: number;
    min_price: number; max_price: number; avg_price: number;
  }>(`
    SELECT
      t.id, t.label, t.retailer, t.currency, t.target_price,
      curr.price as current_price, curr.raw_text,
      stats.min_price, stats.max_price, stats.avg_price
    FROM tracked_items t
    JOIN LATERAL (
      SELECT price, raw_text FROM price_history WHERE item_id = t.id ORDER BY checked_at DESC LIMIT 1
    ) curr ON TRUE
    JOIN LATERAL (
      SELECT MIN(price) as min_price, MAX(price) as max_price, AVG(price) as avg_price
      FROM price_history WHERE item_id = t.id AND price IS NOT NULL
    ) stats ON TRUE
    WHERE t.deleted_at IS NULL AND curr.price IS NOT NULL
      AND (t.user_id = (SELECT user_id FROM users WHERE telegram_chat_id = $1 LIMIT 1) OR t.user_id = 'default')
  `, [chatId]);

  if (items.length === 0) {
    botInstance?.sendMessage(
      chatId,
      `${E.CART} <b>No deals to show yet!</b>\nTrack products first using the Chrome Extension.`,
      { parse_mode: 'HTML', reply_markup: DEFAULT_KEYBOARD }
    );
    return;
  }

  // Calculate deal scores
  const scored = items.map((i) => {
    const curr = Number(i.current_price);
    const min = Number(i.min_price);
    const max = Number(i.max_price);

    let score = 50;
    if (max > min) {
      score = Math.round(((max - curr) / (max - min)) * 100);
    } else if (curr < Number(i.avg_price)) {
      score = 75;
    }
    if (i.target_price && curr <= Number(i.target_price)) {
      score = Math.min(score + 15, 100);
    }
    score = Math.max(10, Math.min(100, score));
    return { ...i, dealScore: score };
  });

  scored.sort((a, b) => b.dealScore - a.dealScore);

  let msg = `${E.FIRE} <b>TOP DEALS & PRICE INTELLIGENCE</b>\n`;
  msg += `${''.padStart(32, '\u2500')}\n\n`;

  scored.slice(0, 5).forEach((item, idx) => {
    const rating = item.dealScore >= 80 ? `${E.STAR} GREAT DEAL` : item.dealScore >= 60 ? `${E.SPARKLE} GOOD DEAL` : `${E.SCALE} FAIR`;
    const price = formatCurrency(item.current_price, item.currency, item.raw_text);
    const lowest = formatCurrency(item.min_price, item.currency);

    msg += `<b>${idx + 1}. ${item.label || 'Product'}</b>\n`;
    msg += `   ${E.MONEY} Current: <b>${price}</b>  (Lowest: ${lowest})\n`;
    msg += `   ${E.TARGET} Deal Score: <b>${item.dealScore}/100</b> \u2014 <i>${rating}</i>\n\n`;
  });

  const buttons = scored.slice(0, 5).map(item => [
    { text: `${E.CHART} ${(item.label || 'Item').substring(0, 22)} (${item.dealScore}/100)`, callback_data: `hist_${item.id}` }
  ]);

  botInstance?.sendMessage(chatId, msg, {
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: buttons }
  });
}

// ========================================================
// 3. BROWSE BY STORE
// ========================================================
async function sendStoresMenu(chatId: string) {
  const stores = await query<{ retailer: string; count: string }>(
    `SELECT COALESCE(retailer, 'Other Stores') as retailer, COUNT(*) as count
     FROM tracked_items
     WHERE deleted_at IS NULL
       AND (user_id = (SELECT user_id FROM users WHERE telegram_chat_id = $1 LIMIT 1) OR user_id = 'default')
     GROUP BY COALESCE(retailer, 'Other Stores')
     ORDER BY count DESC`,
    [chatId]
  );

  if (stores.length === 0) {
    botInstance?.sendMessage(
      chatId,
      `${E.CART} <b>No tracked products found!</b>\nUse the Chrome Extension to track products first.`,
      { parse_mode: 'HTML', reply_markup: DEFAULT_KEYBOARD }
    );
    return;
  }

  let msg = `${E.GLOBE} <b>YOUR STORES</b>\n`;
  msg += `${''.padStart(32, '\u2500')}\n\n`;
  msg += `<i>Select a retailer to browse products:</i>`;

  const buttons = stores.map((s) => [
    { text: `${E.HOUSE} ${s.retailer} (${s.count} items)`, callback_data: `store_${s.retailer}` }
  ]);

  botInstance?.sendMessage(chatId, msg, {
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: buttons }
  });
}

async function sendItemsForStore(chatId: string, retailer: string) {
  const items = await query<{ id: string; label: string; currency: string; current_price: number; raw_text: string }>(
    `SELECT t.id, t.label, t.currency, ph.price as current_price, ph.raw_text
     FROM tracked_items t
     LEFT JOIN LATERAL (
       SELECT price, raw_text FROM price_history WHERE item_id = t.id ORDER BY checked_at DESC LIMIT 1
     ) ph ON TRUE
     WHERE COALESCE(t.retailer, 'Other Stores') = $1 AND t.deleted_at IS NULL
       AND (t.user_id = (SELECT user_id FROM users WHERE telegram_chat_id = $2 LIMIT 1) OR t.user_id = 'default')
     ORDER BY t.created_at DESC`,
    [retailer, chatId]
  );

  if (items.length === 0) {
    botInstance?.sendMessage(chatId, `No active items under <b>${retailer}</b>.`, { parse_mode: 'HTML' });
    return;
  }

  let msg = `${E.HOUSE} <b>Products on ${retailer}</b>\n`;
  msg += `${''.padStart(32, '\u2500')}\n\n`;
  msg += `<i>Tap any product to view price history:</i>`;

  const buttons = items.map((i) => {
    const price = formatCurrency(i.current_price, i.currency, i.raw_text);
    return [{ text: `${E.CHART} ${(i.label || 'Product').substring(0, 24)} (${price})`, callback_data: `hist_${i.id}` }];
  });

  buttons.push([{ text: `${E.GLOBE} Back to All Stores`, callback_data: 'browse_stores' }]);

  botInstance?.sendMessage(chatId, msg, {
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: buttons }
  });
}

// ========================================================
// 4. REFRESH PRICES
// ========================================================
async function runRefreshPrices(chatId: string) {
  botInstance?.sendMessage(
    chatId,
    `${E.REFRESH} <b>Checking prices across your tracked websites...</b>\n<i>This may take a few seconds.</i>`,
    { parse_mode: 'HTML' }
  );

  const items = await query<{ id: string; url: string; selector: string; label: string }>(
    `SELECT id, url, selector, label
     FROM tracked_items
     WHERE deleted_at IS NULL
       AND (user_id = (SELECT user_id FROM users WHERE telegram_chat_id = $1 LIMIT 1) OR user_id = 'default')
       AND is_paused = false
     LIMIT 8`,
    [chatId]
  );

  if (items.length === 0) {
    botInstance?.sendMessage(chatId, `${E.CART} No active items to check.`, { reply_markup: DEFAULT_KEYBOARD });
    return;
  }

  let successCount = 0;
  const results: string[] = [];

  for (const item of items) {
    try {
      const res = await scrape(item.url, item.selector);
      if (res.price !== null) {
        await query(
          'INSERT INTO price_history (item_id, price, raw_text, in_stock) VALUES ($1, $2, $3, $4)',
          [item.id, res.price, res.rawText, res.inStock]
        );
        await query('UPDATE tracked_items SET last_checked = now(), status = $1 WHERE id = $2', ['ok', item.id]);
        successCount++;
        results.push(`${E.CHECK} ${(item.label || 'Item').substring(0, 25)}`);
      } else {
        await query('UPDATE tracked_items SET last_checked = now() WHERE id = $1', [item.id]);
        results.push(`${E.CROSS} ${(item.label || 'Item').substring(0, 25)}`);
      }
    } catch {
      await query('UPDATE tracked_items SET last_checked = now() WHERE id = $1', [item.id]);
      results.push(`${E.CROSS} ${(item.label || 'Item').substring(0, 25)}`);
    }
  }

  let msg = `${E.CHECK} <b>Price Check Complete!</b>\n`;
  msg += `${''.padStart(32, '\u2500')}\n\n`;
  msg += `<b>${successCount}/${items.length}</b> products refreshed successfully.\n\n`;
  msg += results.join('\n');

  botInstance?.sendMessage(chatId, msg, { parse_mode: 'HTML', reply_markup: DEFAULT_KEYBOARD });
}

// ========================================================
// 5. SAVINGS SUMMARY
// ========================================================
async function sendSavingsSummary(chatId: string) {
  const stats = await query<{ count: string; avg_price: number; highest_price: number; lowest_price: number }>(`
    SELECT
      COUNT(*) as count,
      AVG(curr.price) as avg_price,
      MAX(curr.price) as highest_price,
      MIN(curr.price) as lowest_price
    FROM tracked_items t
    JOIN LATERAL (
      SELECT price FROM price_history WHERE item_id = t.id ORDER BY checked_at DESC LIMIT 1
    ) curr ON TRUE
    WHERE t.deleted_at IS NULL AND curr.price IS NOT NULL
      AND (t.user_id = (SELECT user_id FROM users WHERE telegram_chat_id = $1 LIMIT 1) OR t.user_id = 'default')
  `, [chatId]);

  const stat = stats[0];
  const count = parseInt(stat?.count || '0');

  if (count === 0) {
    botInstance?.sendMessage(
      chatId,
      `${E.CART} <b>No price data available yet.</b>\nTrack products via the extension first!`,
      { parse_mode: 'HTML', reply_markup: DEFAULT_KEYBOARD }
    );
    return;
  }

  const avg = Number(stat.avg_price);
  const low = Number(stat.lowest_price);
  const high = Number(stat.highest_price);

  let msg = `${E.CHART} <b>YOUR PRICE TRACKING PORTFOLIO</b>\n`;
  msg += `${''.padStart(32, '\u2500')}\n\n`;
  msg += `${E.PKG} <b>Active Products:</b>  <b>${count}</b>\n`;
  msg += `${E.MONEY} <b>Average Price:</b>  <b>\u20B9${avg.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</b>\n`;
  msg += `${E.TAG} <b>Lowest Priced:</b>  <b>\u20B9${low.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</b>\n`;
  msg += `${E.GEM} <b>Highest Priced:</b>  <b>\u20B9${high.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</b>\n\n`;
  msg += `${E.BULB} <i>Tip: Tap ${E.FIRE} Best Deals to see which items are closest to their historical lowest price!</i>`;

  botInstance?.sendMessage(chatId, msg, {
    parse_mode: 'HTML',
    reply_markup: DEFAULT_KEYBOARD
  });
}

// ========================================================
// 6. NOTIFICATIONS
// ========================================================
async function sendNotificationOptions(chatId: string) {
  let msg = `${E.BELL} <b>NOTIFICATION SETTINGS</b>\n`;
  msg += `${''.padStart(32, '\u2500')}\n\n`;
  msg += `<i>Choose an action below:</i>`;

  botInstance?.sendMessage(chatId, msg, {
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        [{ text: `${E.MUTED} Pause All Notifications`, callback_data: 'pause_notifs' }],
        [{ text: `${E.BELL} Resume All Notifications`, callback_data: 'resume_notifs' }],
        [{ text: `${E.PKG} Back to Watchlist`, callback_data: 'view_all_items' }]
      ]
    }
  });
}

async function handlePauseNotifications(chatId: string) {
  await query(
    `UPDATE tracked_items SET is_paused = true
     WHERE user_id = (SELECT user_id FROM users WHERE telegram_chat_id = $1 LIMIT 1) OR user_id = 'default'`,
    [chatId]
  );

  botInstance?.sendMessage(
    chatId,
    `${E.MUTED} <b>Notifications Paused!</b>\n\nYou will not receive any price alerts until you resume.\n\nTap <b>${E.BELL} Notifications</b> to resume anytime.`,
    { parse_mode: 'HTML', reply_markup: DEFAULT_KEYBOARD }
  );
}

async function handleResumeNotifications(chatId: string) {
  await query(
    `UPDATE tracked_items SET is_paused = false
     WHERE user_id = (SELECT user_id FROM users WHERE telegram_chat_id = $1 LIMIT 1) OR user_id = 'default'`,
    [chatId]
  );

  botInstance?.sendMessage(
    chatId,
    `${E.BELL} <b>Notifications Resumed!</b>\n\nActive monitoring is ON. You will receive alerts when prices drop or items restock.`,
    { parse_mode: 'HTML', reply_markup: DEFAULT_KEYBOARD }
  );
}

// ========================================================
// 7. PRICE HISTORY (callback)
// ========================================================
async function sendItemPriceHistory(chatId: string, itemId: string) {
  const item = await queryOne<{ label: string; retailer: string; currency: string; url: string; target_price: number }>(
    'SELECT label, retailer, currency, url, target_price FROM tracked_items WHERE id = $1',
    [itemId]
  );

  if (!item) {
    botInstance?.sendMessage(chatId, 'Item not found.');
    return;
  }

  const history = await query<{ price: number; raw_text: string; in_stock: boolean; checked_at: string }>(
    'SELECT price, raw_text, in_stock, checked_at FROM price_history WHERE item_id = $1 ORDER BY checked_at DESC LIMIT 8',
    [itemId]
  );

  if (history.length === 0) {
    botInstance?.sendMessage(
      chatId,
      `No price data recorded for <b>${item.label}</b> yet.`,
      { parse_mode: 'HTML' }
    );
    return;
  }

  const prices = history.map(h => Number(h.price)).filter(p => !isNaN(p) && p !== null);
  const hasChanges = new Set(prices).size > 1;

  let msg = `${E.CHART} <b>PRICE HISTORY</b>\n`;
  msg += `<b>${item.label}</b>\n`;
  msg += `${''.padStart(32, '\u2500')}\n\n`;
  msg += `${E.GLOBE} <b>Retailer:</b> ${item.retailer || 'Web Store'}\n`;
  if (item.target_price) {
    msg += `${E.TARGET} <b>Target:</b> <b>${formatCurrency(item.target_price, item.currency)}</b>\n`;
  }
  msg += `${E.UP} <b>Trend:</b> ${hasChanges ? `${E.ZAP} <i>Price changes detected!</i>` : `${E.SCALE} <i>Price is stable</i>`}\n\n`;
  msg += `<b>Recent Observations:</b>\n`;

  history.forEach((h, idx) => {
    const d = new Date(h.checked_at);
    const dateStr = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const price = formatCurrency(h.price, item.currency, h.raw_text);
    const stock = h.in_stock ? `${E.CHECK} In Stock` : `${E.CROSS} Out of Stock`;
    msg += `${idx + 1}. <b>${price}</b>  \u2022  ${stock}  \u2022  <i>${dateStr}</i>\n`;
  });

  msg += `\n<a href="${item.url}">${E.LINK} View Product on ${item.retailer || 'Store'}</a>`;

  const buttons = [
    [
      { text: `${E.GLOBE} More from ${(item.retailer || 'Store').substring(0, 15)}`, callback_data: `store_${item.retailer || 'Other Stores'}` },
      { text: `${E.PKG} Full Watchlist`, callback_data: 'view_all_items' }
    ]
  ];

  botInstance?.sendMessage(chatId, msg, {
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: buttons }
  });
}

// ========================================================
// 8. HELP
// ========================================================
async function sendHelp(chatId: string) {
  const msg =
    `${E.INFO} <b>Smart Price Tracker \u2014 Help</b>\n` +
    `${''.padStart(32, '\u2500')}\n\n` +
    `${E.PKG} <b>My Watchlist</b> \u2014 View tracked items & prices\n` +
    `${E.FIRE} <b>Best Deals</b> \u2014 Products with top deal scores\n` +
    `${E.GLOBE} <b>Browse by Store</b> \u2014 Group by retailer\n` +
    `${E.REFRESH} <b>Refresh Prices</b> \u2014 Live scrape & update\n` +
    `${E.CHART} <b>Savings Summary</b> \u2014 Portfolio overview\n` +
    `${E.BELL} <b>Notifications</b> \u2014 Pause/resume alerts\n\n` +
    `<i>Your Chat ID:</i> <code>${chatId}</code>`;

  botInstance?.sendMessage(chatId, msg, { parse_mode: 'HTML', reply_markup: DEFAULT_KEYBOARD });
}