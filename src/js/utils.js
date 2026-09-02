/* ════════════════════════════════════════════════════════════
   UTILS — Shared helpers used across all page modules
════════════════════════════════════════════════════════════ */
'use strict';

/* ── TOAST ──────────────────────────────────────────────── */
const Toast = (() => {
  const icons = { ok:'fa-circle-check', err:'fa-circle-xmark', warn:'fa-triangle-exclamation', info:'fa-circle-info' };

  function show(type, title, msg='', duration=3500) {
    const stack = document.getElementById('toastStack');
    if (!stack) return;

    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.innerHTML = `
      <div class="t-icon"><i class="fas ${icons[type]||icons.info}"></i></div>
      <div class="t-body">
        <div class="t-title">${title}</div>
        ${msg ? `<div class="t-msg">${msg}</div>` : ''}
      </div>
      <button class="t-close" aria-label="إغلاق"><i class="fas fa-xmark"></i></button>`;

    stack.appendChild(t);
    const close = () => { t.classList.add('die'); setTimeout(()=>t.remove(), 160); };
    t.querySelector('.t-close').addEventListener('click', close);
    setTimeout(close, duration);
  }

  return {
    ok:   (t,m,d) => show('ok',  t,m,d),
    err:  (t,m,d) => show('err', t,m,d),
    warn: (t,m,d) => show('warn',t,m,d),
    info: (t,m,d) => show('info',t,m,d),
  };
})();

/* ── MODAL ──────────────────────────────────────────────── */
const Modal = (() => {
  let _onConfirm = null;
  let _locked = false;

  function open({ title='', body='', foot='', size='', onConfirm=null, locked=false }) {
    const overlay = document.getElementById('gOverlay');
    const modal   = document.getElementById('gModal');
    const mtitle  = document.getElementById('gModalTitle');
    const mbody   = document.getElementById('gModalBody');
    const mfoot   = document.getElementById('gModalFoot');

    if (!modal) return;
    mtitle.innerHTML = title;
    mbody.innerHTML  = body;
    mfoot.innerHTML  = foot;

    modal.className = `g-modal${size ? ' '+size : ''}`;
    _onConfirm = onConfirm;
    _locked = Boolean(locked);
    const closeBtn = document.getElementById('gModalClose');
    if (closeBtn) closeBtn.style.display = _locked ? 'none' : '';

    overlay.classList.add('on');
    modal.classList.add('on');
    document.body.style.overflow = 'hidden';
  }

  function close(force=false) {
    if (_locked && !force) return;
    const overlay = document.getElementById('gOverlay');
    const modal   = document.getElementById('gModal');
    if (!modal) return;
    overlay.classList.remove('on');
    modal.classList.remove('on');
    document.body.style.overflow = '';
    _onConfirm = null;
    _locked = false;
  }

  function confirm(title, msg, onYes, yesLabel='تأكيد', yesClass='btn-danger') {
    open({
      title: `<i class="fas fa-triangle-exclamation"></i> ${title}`,
      body: `<p style="font-size:.9rem;color:var(--tx-2);line-height:1.7">${msg}</p>`,
      foot: `
        <button class="btn btn-ghost" id="modalCancelBtn">إلغاء</button>
        <button class="btn ${yesClass}" id="modalConfirmBtn">${yesLabel}</button>`,
      onConfirm: onYes,
    });
    document.getElementById('modalCancelBtn')?.addEventListener('click', close);
    document.getElementById('modalConfirmBtn')?.addEventListener('click', () => { onYes && onYes(); close(); });
  }

  // init close handlers
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('gModalClose')?.addEventListener('click', close);
    document.getElementById('gOverlay')?.addEventListener('click', close);
  });

  return { open, close, confirm, isLocked:()=>_locked };
})();

/* ── FORMAT HELPERS ─────────────────────────────────────── */
const Fmt = {
  money: (n, sym='ر.س') => Number(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ' ' + sym,
  num:   n => Number(n).toLocaleString('ar-SA'),
  date:  d => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('ar-SA', { year:'numeric', month:'long', day:'numeric' });
  },
  dateShort: d => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('ar-SA');
  },
  daysUntil: d => {
    const diff = new Date(d) - new Date();
    return Math.ceil(diff / 86400000);
  },
  expiryBadge(d) {
    const days = this.daysUntil(d);
    if (days < 0)   return `<span class="badge bdg-err"><i class="fas fa-circle-xmark"></i> منتهي الصلاحية</span>`;
    if (days <= 30) return `<span class="badge bdg-err"><i class="fas fa-clock"></i> ${days} يوم</span>`;
    if (days <= 90) return `<span class="badge bdg-amb"><i class="fas fa-clock"></i> ${days} يوم</span>`;
    return `<span class="badge bdg-ok"><i class="fas fa-check"></i> ${this.dateShort(d)}</span>`;
  },
  stockBadge(stock, min) {
    if (stock === 0)      return `<span class="badge bdg-err">نفد المخزون</span>`;
    if (stock <= min)     return `<span class="badge bdg-warn">مخزون منخفض</span>`;
    return `<span class="badge bdg-ok">متوفر</span>`;
  },
};

/* ── ESCAPE HTML/XML ────────────────────────────────────── */
// تحويل الأحرف الخاصة لتجنب كسر SVG و HTML
function _esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/* ── AVATAR COLOR ───────────────────────────────────────── */
const avatarColors = [
  '#2c7d86','#c47a1e','#2e8a51','#b83030','#7a3a10',
  '#5b4ecf','#c84c7a','#0e7c6a','#7b5e00','#264f6e',
];
function getAvatarColor(str) {
  let hash = 0;
  for (let i=0; i<str.length; i++) hash = str.charCodeAt(i) + ((hash<<5)-hash);
  return avatarColors[Math.abs(hash) % avatarColors.length];
}
function avatarInitials(name, size=44) {
  const parts = name.trim().split(' ');
  const init  = parts.length >= 2 ? parts[0][0] + parts[1][0] : parts[0].slice(0,2);
  const color = getAvatarColor(name);
  return `<div style="width:${size}px;height:${size}px;min-width:${size}px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font-size:${size*.3}px;font-weight:700;color:#fff;">${init}</div>`;
}

/* ── DEBOUNCE ───────────────────────────────────────────── */
function debounce(fn, delay=300) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(()=>fn(...args), delay); };
}

/* ── STARS RENDER ───────────────────────────────────────── */
function renderStars(n) {
  return Array.from({length:5}, (_,i) =>
    `<i class="fa${i<n?'s':'r'} fa-star" style="color:${i<n?'var(--amb-400)':'var(--sl-200)'};font-size:.8rem"></i>`
  ).join('');
}

/* ── ARABIC TEXT NORMALIZER ─────────────────────────────── */
// FEAT [1]: unified Arabic-aware search normalizer
// a) toLowerCase  b) unify hamzas  c) unify taa marbouta  d) unify alef layyena  e) Arabic→Latin digits
function normalizeArabicText(str) {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')       // b) hamzas → bare alef
    .replace(/ة/g, 'ه')           // c) taa marbouta → haa
    .replace(/ى/g, 'ي')           // d) alef layyena → yaa
    .replace(/[٠١٢٣٤٥٦٧٨٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)); // e) Arabic digits
}

/* ── TABLE SEARCH ───────────────────────────────────────── */
function filterRows(tbodyId, query) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  const q = query.toLowerCase().trim();
  tbody.querySelectorAll('tr').forEach(tr => {
    tr.style.display = tr.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
}

/* ── ANIMATE NUMBER ─────────────────────────────────────── */
// FIX [6]: `const start` was reassigned inside the rAF callback → TypeError
// in strict mode. Changed to `let`.
function animateNumber(el, target, duration=1000, prefix='', suffix='') {
  if (!el) return;
  let start = 0;                          // ← was `const` — crashed in strict mode
  const step = (timestamp) => {
    if (!start) start = timestamp;
    const progress = Math.min((timestamp - start) / duration, 1);
    const ease = 1 - Math.pow(1 - progress, 3);
    el.textContent = prefix + Math.floor(ease * target).toLocaleString('ar-SA') + suffix;
    if (progress < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* ── MINI BAR CHART ─────────────────────────────────────── */
function renderBarChart(containerId, labels, values, color='var(--teal-400)') {
  const el = document.getElementById(containerId);
  if (!el) return;
  const max = Math.max(...values, 1);
  el.innerHTML = values.map((v,i) => `
    <div class="bc-col">
      <div class="bc-val">${v > 0 ? Fmt.money(v,'') : ''}</div>
      <div class="bc-bar" style="height:${Math.round((v/max)*100)}%;background:${color}" title="${labels[i]}: ${Fmt.money(v)}"></div>
      <div class="bc-lbl">${labels[i]}</div>
    </div>`).join('');
}

/* ── DONUT CHART ────────────────────────────────────────── */
function renderDonut(containerId, segments, centerVal, centerLabel) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const colors = ['var(--teal-500)','var(--amb-400)','var(--ok)','var(--err)','var(--sl-400)','var(--warn)'];
  const total  = segments.reduce((a,s)=>a+s.value,0)||1;
  const r=44, circ=2*Math.PI*r;
  let offset = 0;
  const segs = segments.map((s,i) => {
    const pct  = s.value/total;
    const dash = pct*circ;
    const gap  = circ-dash;
    const seg  = `<circle class="donut-seg" cx="55" cy="55" r="${r}" stroke="${colors[i%colors.length]}" stroke-width="9" stroke-dasharray="${dash} ${gap}" stroke-dashoffset="${-offset}" />`;
    offset += dash;
    return seg;
  }).join('');

  const legend = segments.map((s,i) => `
    <div class="dl-item">
      <div class="dl-dot" style="background:${colors[i%colors.length]}"></div>
      <span class="dl-name">${s.label}</span>
      <span class="dl-val">${s.value}</span>
    </div>`).join('');

  el.innerHTML = `
    <div class="donut-wrap">
      <div class="donut-svg-wrap">
        <svg viewBox="0 0 110 110">
          <circle class="donut-track" cx="55" cy="55" r="${r}" stroke-width="9"/>
          ${segs}
        </svg>
        <div class="donut-center">
          <div class="dc-val">${centerVal}</div>
          <div class="dc-lbl">${centerLabel}</div>
        </div>
      </div>
      <div class="donut-legend">${legend}</div>
    </div>`;
}

/* ── PAGINATION ─────────────────────────────────────────── */
// FIX [7]: old version added fresh click-listeners to every button on every
// render, causing double-fire on each page change. Now uses a single
// delegated listener on the container, replaced cleanly on each render.
function Paginator(items, perPage=10) {
  let page         = 1;
  let _lastEl      = null;   // container we last attached a listener to
  let _lastHandler = null;   // the handler we attached, so we can remove it

  const total = () => Math.ceil(items.length / perPage);
  const slice = () => items.slice((page-1)*perPage, page*perPage);

  const render = (el) => {
    if (!el) return;
    const t = total();
    if (t <= 1) { el.innerHTML = ''; return; }

    let html = '';
    if (page > 1)
      html += `<button class="pg-btn" data-p="${page-1}"><i class="fas fa-angle-right"></i></button>`;
    for (let i=1; i<=t; i++) {
      if (i===1 || i===t || Math.abs(i-page)<=1)
        html += `<button class="pg-btn ${i===page?'active':''}" data-p="${i}">${i}</button>`;
      else if (Math.abs(i-page)===2)
        html += `<span style="color:var(--tx-3);padding:0 .2rem">…</span>`;
    }
    if (page < t)
      html += `<button class="pg-btn" data-p="${page+1}"><i class="fas fa-angle-left"></i></button>`;

    el.innerHTML = html;

    // Remove the previous delegated listener to prevent accumulation
    if (_lastEl === el && _lastHandler)
      el.removeEventListener('click', _lastHandler);

    const handler = (e) => {
      const btn = e.target.closest('.pg-btn[data-p]');
      if (!btn) return;
      page = parseInt(btn.dataset.p, 10);
      render(el);
    };
    el.addEventListener('click', handler);
    _lastEl      = el;
    _lastHandler = handler;
  };

  return {
    slice,
    render,
    setPage: p  => { page = p; },
    getPage: () => page,
  };
}

/* ── EXPORT TO CSV ──────────────────────────────────────── */
// FIX [8]: revokeObjectURL was called synchronously right after .click(),
// before the browser could process the download → silent failure in some
// environments. Wrapped in a short setTimeout.
function exportCSV(filename, headers, rows) {
  const bom  = '\uFEFF';
  const head = headers.join(',');
  const body = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([bom+head+'\n'+body], {type:'text/csv;charset=utf-8;'});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename + '.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 150); // ← was immediate, now deferred
  Toast.ok('تم التصدير', `تم تصدير ${filename}.csv بنجاح`);
}

/* ── BARCODE GENERATOR (Pure JS Code-128 SVG Generator) ── */
const BarcodeGenerator = (() => {
  // Code 128 pattern widths (107 patterns)
  const PATTERNS = [
    "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
    "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
    "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
    "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
    "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
    "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
    "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
    "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
    "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
    "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
    "114131", "311141", "411131", "211412", "211214", "211232", "2331112"
  ];
  const START_B = 104;
  const STOP = 106;

  function generateSVG(text, options = {}) {
    const str = String(text || '').trim();
    if (!str) return '';
    const height = options.height || 40;
    const includeText = options.includeText !== false;
    const barColor = options.color || '#000000';

    // Encode chars in Code 128 Set B (ASCII 32..126)
    const codes = [START_B];
    let checksum = START_B;

    for (let i = 0; i < str.length; i++) {
      let code = str.charCodeAt(i) - 32;
      if (code < 0 || code > 95) code = 0; // fallback to space
      codes.push(code);
      checksum += code * (i + 1);
    }
    codes.push(checksum % 103);
    codes.push(STOP);

    // Build module widths
    let totalModules = 0;
    const patterns = codes.map(c => PATTERNS[c]);
    patterns.forEach(p => {
      for (let j = 0; j < p.length; j++) totalModules += parseInt(p[j], 10);
    });

    // Quiet zones (10 modules each side)
    const quietZone = 10;
    const fullWidth = totalModules + (quietZone * 2);

    let x = quietZone;
    let rects = '';
    patterns.forEach(p => {
      for (let j = 0; j < p.length; j++) {
        const w = parseInt(p[j], 10);
        if (j % 2 === 0) { // Bar (even index)
          rects += `<rect x="${x}" y="0" width="${w}" height="${height}" fill="${barColor}" />`;
        }
        x += w;
      }
    });

    const textH = includeText ? 14 : 0;
    const totalSvgH = height + textH;
    const textSvg = includeText
      ? `<text x="${fullWidth / 2}" y="${height + 11}" text-anchor="middle" font-family="'Cairo', monospace, sans-serif" font-size="11" font-weight="600" fill="${barColor}">${_esc(str)}</text>`
      : '';

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fullWidth} ${totalSvgH}" style="max-width:100%;height:auto;display:block;">${rects}${textSvg}</svg>`;
  }

  return { generateSVG };
})();

/* ── DEVICE SETTINGS (printer / barcode scanner — per-terminal, local only) ── */
const DeviceSettings = (() => {
  const KEY = 'ph_device_settings';
  const DEFAULTS = { paperWidth: '80', autoPrint: false, barcodeScan: true, soundOnScan: true };
  function get() {
    try { return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY)) || {}) }; }
    catch { return { ...DEFAULTS }; }
  }
  function set(patch) {
    const merged = { ...get(), ...patch };
    localStorage.setItem(KEY, JSON.stringify(merged));
    return merged;
  }
  return { get, set };
})();

/* ── PRINT ──────────────────────────────────────────────── */
// Robust printing helper supporting PyWebView, Electron, and standard web browsers via isolated iframe
function printElement(id, customTitle = '') {
  const el = typeof id === 'string' ? document.getElementById(id) : id;
  if (!el) return;

  // Remove existing print iframe if any
  let frame = document.getElementById('ph_print_frame');
  if (frame) frame.remove();

  frame = document.createElement('iframe');
  frame.id = 'ph_print_frame';
  frame.style.position = 'fixed';
  frame.style.right = '-9999px';
  frame.style.bottom = '-9999px';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  frame.style.visibility = 'hidden';
  document.body.appendChild(frame);

  const doc = frame.contentWindow.document;
  const isReceipt = el.classList.contains('receipt') || !!el.querySelector('.receipt');
  const isBarcodeSheet = el.classList.contains('barcode-sheet') || !!el.querySelector('.barcode-sheet');
  const paperW = DeviceSettings.get().paperWidth || '80';
  const maxW = paperW === '58' ? '58mm' : '80mm';

  let extraCSS = '';
  if (isReceipt) {
    extraCSS = `
      @page { size: ${paperW === '58' ? '58mm auto' : '80mm auto'}; margin: 0; }
      body { width: ${maxW}; margin: 0 auto; padding: 8px 10px; direction: rtl; font-family: 'Cairo', sans-serif; font-size: 12px; color: #000; }
      .receipt { width: 100%; max-width: ${maxW}; margin: 0 auto; }
      .rcp-head { text-align: center; margin-bottom: 8px; }
      .rcp-title { font-size: 15px; font-weight: 800; color: #000; margin-bottom: 2px; }
      .rcp-sub { font-size: 10px; color: #333; margin-top: 1px; }
      .rcp-div { border-top: 1.5px dashed #444; margin: 8px 0; }
      .rcp-row { display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 11px; line-height: 1.35; color: #000; }
      .rcp-row.total { font-weight: 800; font-size: 13px; border-top: 1.5px solid #000; padding-top: 5px; margin-top: 5px; }
      .rcp-barcode { text-align: center; margin: 10px auto 4px auto; width: 100%; max-width: 220px; }
      .rcp-barcode svg { width: 100%; height: 38px; margin: 0 auto; display: block; }
      .rcp-foot-note { text-align: center; font-size: 10px; color: #444; margin-top: 8px; line-height: 1.4; }
    `;
  } else if (isBarcodeSheet) {
    extraCSS = `
      @page { size: auto; margin: 4mm; }
      body { margin: 0; padding: 4mm; direction: rtl; font-family: 'Cairo', sans-serif; }
      .barcode-sheet { display: flex; flex-wrap: wrap; gap: 4mm; justify-content: flex-start; }
      .barcode-sticker {
        width: 50mm; height: 30mm; border: 1px dashed #aaa; border-radius: 4px;
        padding: 2mm 2.5mm; box-sizing: border-box; display: flex; flex-direction: column;
        align-items: center; justify-content: space-between; page-break-inside: avoid; text-align: center;
        background: #fff; color: #000;
      }
      .bs-pharmacy { font-size: 8px; font-weight: 700; color: #222; }
      .bs-name { font-size: 10px; font-weight: 800; color: #000; line-height: 1.15; max-height: 22px; overflow: hidden; }
      .bs-info { display: flex; justify-content: space-between; width: 100%; font-size: 8px; font-weight: 700; color: #111; }
      .bs-barcode { width: 100%; display: flex; justify-content: center; margin: 1px 0; }
      .bs-barcode svg { width: 95%; height: 25px; }
    `;
  } else {
    extraCSS = `
      @page { size: A4; margin: 12mm; }
      body { direction: rtl; font-family: 'Cairo', sans-serif; color: #000; padding: 10px; font-size: 13px; }
      table { width: 100%; border-collapse: collapse; margin-top: 10px; }
      th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: right; }
      th { background: #f0f0f0; font-weight: 700; }
    `;
  }

  doc.open();
  doc.write(`<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8">
    <title>${customTitle || 'طباعة'}</title>
    <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap" rel="stylesheet">
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background: #fff; }
      ${extraCSS}
    </style>
  </head><body>${el.outerHTML}</body></html>`);
  doc.close();

  setTimeout(() => {
    try {
      frame.contentWindow.focus();
      frame.contentWindow.print();
    } catch (err) {
      console.warn('Iframe print error, falling back to window.print', err);
      window.print();
    }
  }, 350);
}

/* ── BARCODE STICKERS PRINT HELPER ───────────────────────── */
function printBarcodeStickers(medicine, count = 1, pharmacyName = 'صيدلية الشفاء') {
  if (!medicine) return;
  const barcode = medicine.barcode || medicine.id || '00000000';
  const svg = BarcodeGenerator.generateSVG(barcode, { height: 26, includeText: true });

  const container = document.createElement('div');
  container.className = 'barcode-sheet';

  let stickersHTML = '';
  for (let i = 0; i < count; i++) {
    stickersHTML += `
      <div class="barcode-sticker">
        <div class="bs-pharmacy">${_esc(pharmacyName)}</div>
        <div class="bs-name">${_esc(medicine.name)}</div>
        <div class="bs-barcode">${svg}</div>
        <div class="bs-info">
          <span>السعر: ${medicine.price} ر.س</span>
          <span>صلاحية: ${medicine.expiry || '—'}</span>
        </div>
      </div>`;
  }
  container.innerHTML = stickersHTML;

  // Add temporary element to body for printing
  container.id = 'tempBarcodePrintSheet';
  container.style.display = 'none';
  document.body.appendChild(container);

  printElement('tempBarcodePrintSheet', `ملصقات باركود - ${medicine.name}`);
  setTimeout(() => container.remove(), 2000);
}
