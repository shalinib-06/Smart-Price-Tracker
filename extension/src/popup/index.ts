const list = document.getElementById('items-list')!;
const statusText = document.getElementById('status-text')!;
const searchInput = document.getElementById('search-input') as HTMLInputElement;
const filterSelect = document.getElementById('filter-select') as HTMLSelectElement;
const sortSelect = document.getElementById('sort-select') as HTMLSelectElement;

const chartModal = document.getElementById('chart-modal')!;
const chartClose = document.getElementById('chart-close')!;
const chartTitle = document.getElementById('chart-title')!;
const chartCanvas = document.getElementById('chart-canvas') as HTMLCanvasElement;
const statMin = document.getElementById('stat-min')!;
const statAvg = document.getElementById('stat-avg')!;
const statMax = document.getElementById('stat-max')!;

const tgStatusText = document.getElementById('tg-status-text')!;
const tgBtnConnect = document.getElementById('tg-btn-connect') as HTMLButtonElement;
const tgBtnDisconnect = document.getElementById('tg-btn-disconnect') as HTMLButtonElement;

let allItems: any[] = [];

function getCurrencySymbol(currency?: string, url?: string): string {
  if (currency === 'INR' || (url && (url.includes('.in') || url.includes('flipkart') || url.includes('myntra')))) return '\u20B9';
  if (currency === 'GBP' || (url && url.includes('.co.uk'))) return '\u00A3';
  if (currency === 'EUR') return '\u20AC';
  return '$';
}

function formatDate(iso: string | null): string {
  if (!iso) return 'Just added';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return 'Just added';
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return 'Just added';
  }
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return url;
  }
}

function renderEmpty(): void {
  list.innerHTML = [
    '<li class="empty">',
    '  <div style="font-size:24px;margin-bottom:8px;">[ ]</div>',
    '  <p>No items found.</p>',
    '  <p>Open a product page and click <b>Track price</b>.</p>',
    '</li>'
  ].join('');
}

function applyFilterAndSort() {
  const query = searchInput.value.toLowerCase().trim();
  const filter = filterSelect.value;
  const sort = sortSelect.value;

  let filtered = allItems.filter((item) => {
    const name = (item.label || getDomain(item.url)).toLowerCase();
    const matchesSearch = !query || name.includes(query) || item.url.toLowerCase().includes(query);

    if (!matchesSearch) return false;

    if (filter === 'in_stock') return item.in_stock !== false;
    if (filter === 'target') return item.target_price !== null && item.target_price !== undefined;
    return true;
  });

  filtered.sort((a, b) => {
    const nameA = (a.label || getDomain(a.url)).toLowerCase();
    const nameB = (b.label || getDomain(b.url)).toLowerCase();
    const priceA = a.current_price ? Number(a.current_price) : 0;
    const priceB = b.current_price ? Number(b.current_price) : 0;
    const dateA = new Date(a.created_at || a.savedAt || 0).getTime();
    const dateB = new Date(b.created_at || b.savedAt || 0).getTime();

    if (sort === 'date_desc') return dateB - dateA;
    if (sort === 'date_asc') return dateA - dateB;
    if (sort === 'alpha_asc') return nameA.localeCompare(nameB);
    if (sort === 'alpha_desc') return nameB.localeCompare(nameA);
    if (sort === 'price_asc') return priceA - priceB;
    if (sort === 'price_desc') return priceB - priceA;
    return 0;
  });

  renderItems(filtered);
}

function renderItems(items: any[]): void {
  if (!items.length) { renderEmpty(); return; }

  list.innerHTML = items.map((item) => {
    const sym = getCurrencySymbol(item.currency, item.url);
    let priceDisplay = '--';
    if (item.current_price_text) {
      priceDisplay = item.current_price_text;
    } else if (item.current_price !== null && item.current_price !== undefined) {
      priceDisplay = `${sym}${Number(item.current_price).toLocaleString('en-IN')}`;
    }

    const failed = item.status === 'failed';
    const isPaused = item.is_paused === true;
    const outOfStock = item.in_stock === false;

    const badge = failed
      ? '<span class="badge badge-failed">check failed</span>'
      : isPaused
        ? '<span class="badge badge-paused">paused</span>'
        : outOfStock
          ? '<span class="badge badge-out">out of stock</span>'
          : '<span class="badge badge-ok">in stock</span>';

    const displayName = item.label || getDomain(item.url);
    const hasTarget = item.target_price !== null && item.target_price !== undefined;
    const targetTag = hasTarget
      ? `<span class="item-target">Target: ${sym}${Number(item.target_price).toLocaleString('en-IN')}</span>`
      : '';

    const targetBtnLabel = hasTarget ? 'Edit Target' : 'Set Target';

    return [
      '<li class="item" data-id="' + item.id + '">',
      '  <div class="item-header">',
      `    <div class="item-label" title="${item.url}">${displayName}</div>`,
      `    <div class="item-price${failed ? ' failed' : ''}">${failed ? 'Check failed' : priceDisplay}</div>`,
      '  </div>',
      targetTag ? `  <div>${targetTag}</div>` : '',
      '  <div class="item-meta">',
      `    <span>${badge} &bull; ${formatDate(item.last_checked || item.created_at)}</span>`,
      '    <div class="actions">',
      `      <button class="btn-action btn-target" data-action="target" data-id="${item.id}">${targetBtnLabel}</button>`,
      `      <button class="btn-action btn-graph" data-action="graph" data-id="${item.id}">Chart</button>`,
      `      <button class="btn-action btn-delete" data-action="delete" data-id="${item.id}" title="Delete item">Delete</button>`,
      '    </div>',
      '  </div>',
      '</li>'
    ].join('');
  }).join('');

  list.querySelectorAll<HTMLButtonElement>('.btn-action').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id!;
      const action = btn.dataset.action!;
      if (action === 'delete') {
        await deleteItem(id);
      } else if (action === 'target') {
        await promptSetTarget(id);
      } else if (action === 'graph') {
        await showPriceChart(id);
      }
    });
  });
}

async function promptSetTarget(id: string) {
  const current = allItems.find(i => i.id === id);
  const currentVal = current?.target_price ? String(current.target_price) : '';
  const sym = getCurrencySymbol(current?.currency, current?.url);
  const input = prompt(`Enter target price in ${sym} for this product (leave blank to remove):`, currentVal);
  if (input === null) return;

  const targetNum = input.trim() === '' ? null : parseFloat(input.trim());
  if (input.trim() !== '' && isNaN(targetNum!)) {
    alert('Please enter a valid numeric price');
    return;
  }

  const { backendUrl, apiKey } = await getConfig();
  try {
    await fetch(`${backendUrl}/items/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': apiKey,
      },
      body: JSON.stringify({ target_price: targetNum }),
    });
    await loadItems();
  } catch (err) {
    console.error('Failed to update target price:', err);
  }
}

async function showPriceChart(id: string) {
  const item = allItems.find(i => i.id === id);
  if (!item) return;

  chartTitle.textContent = item.label || getDomain(item.url);
  chartModal.style.display = 'flex';

  const { backendUrl, apiKey } = await getConfig();
  try {
    const res = await fetch(`${backendUrl}/items/${id}/history`, {
      headers: { 'X-Api-Key': apiKey }
    });
    const data = await res.json();
    const stats = data.stats;
    const history = data.history || [];

    const sym = getCurrencySymbol(item.currency, item.url);
    statMin.textContent = stats.min_price !== null ? `${sym}${Number(stats.min_price).toLocaleString('en-IN')}` : '--';
    statAvg.textContent = stats.avg_price !== null ? `${sym}${Number(stats.avg_price).toLocaleString('en-IN')}` : '--';
    statMax.textContent = stats.max_price !== null ? `${sym}${Number(stats.max_price).toLocaleString('en-IN')}` : '--';

    renderRealLineChart(history, stats.target_price, sym);
  } catch (err) {
    console.error('Failed to load chart:', err);
  }
}

function renderRealLineChart(history: any[], targetPrice: number | null, sym: string = '\u20B9') {
  const ctx = chartCanvas.getContext('2d');
  if (!ctx) return;

  // Handle HiDPI displays
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = chartCanvas.clientWidth || 348;
  const cssHeight = chartCanvas.clientHeight || 160;
  chartCanvas.width = cssWidth * dpr;
  chartCanvas.height = cssHeight * dpr;
  ctx.scale(dpr, dpr);

  const width = cssWidth;
  const height = cssHeight;
  ctx.clearRect(0, 0, width, height);

  const points: { price: number; time: Date }[] = [];
  history.forEach((row) => {
    if (row.price !== null && row.price !== undefined) {
      const p = Number(row.price);
      if (!isNaN(p)) {
        points.push({
          price: p,
          time: new Date(row.checked_at || Date.now()),
        });
      }
    }
  });

  if (points.length === 0) {
    ctx.fillStyle = '#64748b';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No price data recorded yet', width / 2, height / 2);
    return;
  }

  // Sort by time ascending
  points.sort((a, b) => a.time.getTime() - b.time.getTime());

  const marginLeft = 56;
  const marginRight = 16;
  const marginTop = 20;
  const marginBottom = 32;
  const plotW = width - marginLeft - marginRight;
  const plotH = height - marginTop - marginBottom;

  const allValues = points.map(p => p.price);
  if (targetPrice !== null) allValues.push(targetPrice);

  let minVal = Math.min(...allValues);
  let maxVal = Math.max(...allValues);

  if (minVal === maxVal) {
    minVal = minVal * 0.9;
    maxVal = maxVal * 1.1;
  } else {
    const pad = (maxVal - minVal) * 0.15;
    minVal -= pad;
    maxVal += pad;
  }

  const timeMin = points[0].time.getTime();
  const timeMax = points[points.length - 1].time.getTime();
  const timeSpan = timeMax - timeMin || 1;

  const getY = (val: number) => marginTop + plotH - ((val - minVal) / (maxVal - minVal)) * plotH;
  const getX = (time: Date) => {
    if (points.length === 1) return marginLeft + plotW / 2;
    return marginLeft + ((time.getTime() - timeMin) / timeSpan) * plotW;
  };

  // Format price for Y-axis ticks
  function formatTickPrice(val: number): string {
    if (sym === '\u20B9') {
      if (val >= 100000) return `${sym}${(val / 100000).toFixed(1)}L`;
      if (val >= 1000) return `${sym}${(val / 1000).toFixed(1)}K`;
      return `${sym}${Math.round(val)}`;
    }
    if (val >= 1000) return `${sym}${(val / 1000).toFixed(1)}K`;
    return `${sym}${val.toFixed(val < 10 ? 2 : 0)}`;
  }

  // Draw grid lines and Y-axis ticks
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 1;
  ctx.fillStyle = '#64748b';
  ctx.font = '9px -apple-system, sans-serif';
  ctx.textAlign = 'right';

  const ySteps = 4;
  for (let i = 0; i <= ySteps; i++) {
    const frac = i / ySteps;
    const yVal = minVal + frac * (maxVal - minVal);
    const yPixel = marginTop + plotH - frac * plotH;

    ctx.beginPath();
    ctx.moveTo(marginLeft, yPixel);
    ctx.lineTo(width - marginRight, yPixel);
    ctx.stroke();

    ctx.fillText(formatTickPrice(yVal), marginLeft - 6, yPixel + 3);
  }

  // X-axis date labels (distribute evenly along actual timeline)
  ctx.textAlign = 'center';
  ctx.fillStyle = '#64748b';

  const numXTicks = Math.min(points.length, 5);
  const xTickIndices: number[] = [];
  if (points.length <= 5) {
    points.forEach((_, i) => xTickIndices.push(i));
  } else {
    for (let i = 0; i < numXTicks; i++) {
      xTickIndices.push(Math.round(i * (points.length - 1) / (numXTicks - 1)));
    }
  }
  const uniqueXIndices = Array.from(new Set(xTickIndices));

  uniqueXIndices.forEach((idx) => {
    const pt = points[idx];
    const xPixel = getX(pt.time);
    const d = pt.time;
    const dateLabel = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });

    ctx.beginPath();
    ctx.moveTo(xPixel, marginTop + plotH);
    ctx.lineTo(xPixel, marginTop + plotH + 4);
    ctx.strokeStyle = '#475569';
    ctx.stroke();

    ctx.fillText(dateLabel, xPixel, height - 10);
  });

  // Draw axes
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(marginLeft, marginTop);
  ctx.lineTo(marginLeft, marginTop + plotH);
  ctx.lineTo(width - marginRight, marginTop + plotH);
  ctx.stroke();

  // Draw target price line (dashed)
  if (targetPrice !== null && targetPrice >= minVal && targetPrice <= maxVal) {
    const tY = getY(targetPrice);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(marginLeft, tY);
    ctx.lineTo(width - marginRight, tY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#38bdf8';
    ctx.textAlign = 'left';
    ctx.font = '9px -apple-system, sans-serif';
    ctx.fillText(`Target: ${sym}${targetPrice.toLocaleString('en-IN')}`, marginLeft + 6, Math.max(tY - 4, 12));
  }

  // Draw gradient fill under the line
  const grad = ctx.createLinearGradient(0, marginTop, 0, marginTop + plotH);
  grad.addColorStop(0, 'rgba(74, 222, 128, 0.25)');
  grad.addColorStop(1, 'rgba(74, 222, 128, 0.0)');

  ctx.fillStyle = grad;
  ctx.beginPath();
  points.forEach((pt, idx) => {
    const x = getX(pt.time);
    const y = getY(pt.price);
    if (idx === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.lineTo(getX(points[points.length - 1].time), marginTop + plotH);
  ctx.lineTo(getX(points[0].time), marginTop + plotH);
  ctx.closePath();
  ctx.fill();

  // Draw the price line
  ctx.strokeStyle = '#4ade80';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  points.forEach((pt, idx) => {
    const x = getX(pt.time);
    const y = getY(pt.price);
    if (idx === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Draw data points with price labels
  points.forEach((pt, idx) => {
    const x = getX(pt.time);
    const y = getY(pt.price);

    // Outer dot
    ctx.fillStyle = '#22c55e';
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();

    // Inner dot
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, 2, 0, Math.PI * 2);
    ctx.fill();

    // Show price label on first, last, and if few points
    if (idx === 0 || idx === points.length - 1 || points.length <= 5) {
      ctx.fillStyle = '#f1f5f9';
      ctx.font = 'bold 9px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      const label = sym === '\u20B9'
        ? `${sym}${pt.price.toLocaleString('en-IN')}`
        : `${sym}${pt.price.toLocaleString()}`;
      ctx.fillText(label, x, Math.max(y - 8, 12));
    }
  });
}

chartClose.onclick = () => {
  chartModal.style.display = 'none';
};

async function checkTelegramStatus() {
  const { backendUrl, apiKey, userId } = await getConfig();
  try {
    const res = await fetch(`${backendUrl}/items/telegram/status?user_id=${userId}`, {
      headers: { 'X-Api-Key': apiKey }
    });
    const data = await res.json();
    if (data.connected) {
      tgStatusText.textContent = 'Telegram Connected';
      tgStatusText.style.color = '#4ade80';
      if (tgBtnConnect) tgBtnConnect.style.display = 'none';
      if (tgBtnDisconnect) tgBtnDisconnect.style.display = 'inline-block';
    } else {
      tgStatusText.textContent = 'Telegram Disconnected';
      tgStatusText.style.color = '#94a3b8';
      if (tgBtnConnect) tgBtnConnect.style.display = 'inline-block';
      if (tgBtnDisconnect) tgBtnDisconnect.style.display = 'none';
    }
  } catch {
    tgStatusText.textContent = 'Telegram';
    if (tgBtnConnect) tgBtnConnect.style.display = 'inline-block';
    if (tgBtnDisconnect) tgBtnDisconnect.style.display = 'none';
  }
}

// QR Code modal elements
const qrModal = document.getElementById('qr-modal')!;
const qrImage = document.getElementById('qr-image') as HTMLImageElement;
const qrClose = document.getElementById('qr-close')!;
const qrOpenLink = document.getElementById('qr-open-link')!;
const qrCopyLink = document.getElementById('qr-copy-link')!;
const qrLinkText = document.getElementById('qr-link-text')!;
let currentBotUrl = '';

if (tgBtnConnect) {
  tgBtnConnect.onclick = async () => {
    const { userId } = await getConfig();
    const botUrl = `https://t.me/MatirxPriceBot?start=link_${userId}`;
    currentBotUrl = botUrl;

    // Generate QR code via free API
    const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&color=4f46e5&bgcolor=ffffff&data=${encodeURIComponent(botUrl)}`;
    qrImage.src = qrApiUrl;
    qrLinkText.textContent = botUrl;

    qrModal.style.display = 'flex';
  };
}

qrClose.onclick = () => {
  qrModal.style.display = 'none';
};

qrOpenLink.onclick = () => {
  if (currentBotUrl) {
    chrome.tabs.create({ url: currentBotUrl });
    qrModal.style.display = 'none';
  }
};

qrCopyLink.onclick = async () => {
  if (currentBotUrl) {
    try {
      await navigator.clipboard.writeText(currentBotUrl);
      qrCopyLink.textContent = 'Copied!';
      setTimeout(() => { qrCopyLink.textContent = 'Copy Link'; }, 2000);
    } catch {
      // Fallback for clipboard API not available
      const ta = document.createElement('textarea');
      ta.value = currentBotUrl;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      qrCopyLink.textContent = 'Copied!';
      setTimeout(() => { qrCopyLink.textContent = 'Copy Link'; }, 2000);
    }
  }
};

tgBtnDisconnect.onclick = async () => {
  if (!confirm('Are you sure you want to disconnect Telegram notifications?')) return;
  const { backendUrl, apiKey, userId } = await getConfig();
  try {
    const res = await fetch(`${backendUrl}/items/telegram/disconnect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': apiKey,
      },
      body: JSON.stringify({ user_id: userId }),
    });
    const d = await res.json();
    if (d.ok) {
      alert('Telegram bot disconnected. You will not receive notifications until reconnected.');
      await checkTelegramStatus();
    }
  } catch (err: any) {
    alert('Failed to disconnect: ' + err.message);
  }
};

async function getConfig(): Promise<{ backendUrl: string; apiKey: string; userId: string }> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'GET_CONFIG' }, (cfg) => {
      resolve(cfg ?? { backendUrl: 'http://localhost:8083', apiKey: 'price-tracker-secret-key-2026', userId: 'default' });
    });
  });
}

async function loadItems(): Promise<void> {
  const { backendUrl, apiKey, userId } = await getConfig();
  try {
    statusText.textContent = 'Fetching watchlist...';
    const res = await fetch(`${backendUrl}/items?user_id=${userId}`, {
      headers: { 'X-Api-Key': apiKey },
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    allItems = await res.json();
    statusText.textContent = `${allItems.length} product${allItems.length !== 1 ? 's' : ''} tracked`;
    applyFilterAndSort();
    await checkTelegramStatus();
  } catch {
    statusText.textContent = 'Backend offline - local data';
    chrome.storage.local.get(['trackedItems', 'pendingTracks'], ({ trackedItems = [], pendingTracks = [] }) => {
      const local = pendingTracks.map((t: any) => {
        const sym = getCurrencySymbol(t.currency, t.url);
        return {
          id: 'local-' + t.savedAt,
          url: t.url,
          label: t.label || null,
          currency: t.currency || (t.url.includes('.in') || t.url.includes('flipkart') ? 'INR' : 'USD'),
          target_price: t.target_price || null,
          current_price_text: t.initialPrice != null ? `${sym}${Number(t.initialPrice).toLocaleString('en-IN')}` : null,
          current_price: t.initialPrice,
          status: 'ok',
          in_stock: true,
          last_checked: t.savedAt ? new Date(t.savedAt).toISOString() : null,
        };
      });
      allItems = [...trackedItems, ...local];
      applyFilterAndSort();
    });
  }
}

async function deleteItem(id: string): Promise<void> {
  if (id.startsWith('local-')) {
    const savedAt = Number(id.replace('local-', ''));
    chrome.storage.local.get('pendingTracks', ({ pendingTracks = [] }) => {
      chrome.storage.local.set(
        { pendingTracks: pendingTracks.filter((t: any) => t.savedAt !== savedAt) },
        () => loadItems()
      );
    });
    return;
  }

  const { backendUrl, apiKey } = await getConfig();
  try {
    await fetch(`${backendUrl}/items/${id}`, {
      method: 'DELETE',
      headers: { 'X-Api-Key': apiKey },
    });
    loadItems();
  } catch (err) {
    console.error('Delete failed:', err);
  }
}

searchInput.addEventListener('input', applyFilterAndSort);
filterSelect.addEventListener('change', applyFilterAndSort);
sortSelect.addEventListener('change', applyFilterAndSort);

loadItems();