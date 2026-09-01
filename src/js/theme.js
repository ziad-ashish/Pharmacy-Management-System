/* ════════════════════════════════════════════════════════════
   THEME  —  Light/Dark mode + accent color
   Works purely by overriding CSS custom properties at runtime;
   no existing stylesheet rules are modified.
════════════════════════════════════════════════════════════ */
'use strict';

const Theme = (() => {

  const LIGHT_VARS = {
    '--bg':'#f4f6f8', '--surface':'#ffffff', '--surface-2':'#f8fafb',
    '--border':'#dfe5ea', '--border-2':'#edf0f3',
    '--tx':'#17212d', '--tx-2':'#526071', '--tx-3':'#8793a2',
    '--sl-50':'#f6f8fa', '--sl-100':'#edf1f4', '--sl-200':'#dce2e8',
    '--ok-light':'#eaf8f1', '--warn-light':'#fff5e5', '--err-light':'#fff0f1',
  };

  const DARK_VARS = {
    '--bg':'#0b1118', '--surface':'#111923', '--surface-2':'#16212c',
    '--border':'#283543', '--border-2':'#202c38',
    '--tx':'#e7edf2', '--tx-2':'#afbbc7', '--tx-3':'#758494',
    '--sl-50':'#16212c', '--sl-100':'#1d2935', '--sl-200':'#2a3744',
    '--ok-light':'#102b22', '--warn-light':'#302410', '--err-light':'#321920',
    '--ok-dark':'#68c69f', '--warn-dark':'#e5ad57', '--err-dark':'#f08b95',
  };

  const TEAL_DEFAULT = '#0f766e';

  // ratio<0 mixes toward black (shade), ratio>0 mixes toward white (tint)
  const TEAL_RAMP = {
    950:-0.90, 900:-0.80, 800:-0.65, 700:-0.50, 600:-0.25,
    500: 0,
    400: 0.15, 300: 0.35, 200: 0.58, 100: 0.80, 50: 0.93,
  };

  function _hexToRgb(hex) {
    hex = (hex || '').replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const n = parseInt(hex, 16) || 0;
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  function _rgbToHex({ r, g, b }) {
    return '#' + [r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
  }
  function _mix(hex, ratio) {
    const c = _hexToRgb(hex);
    const target = ratio < 0 ? { r: 0, g: 0, b: 0 } : { r: 255, g: 255, b: 255 };
    const t = Math.abs(ratio);
    return _rgbToHex({
      r: c.r + (target.r - c.r) * t,
      g: c.g + (target.g - c.g) * t,
      b: c.b + (target.b - c.b) * t,
    });
  }

  function applyMode(mode) {
    const root = document.documentElement;
    const map = mode === 'dark' ? DARK_VARS : LIGHT_VARS;
    Object.entries(map).forEach(([k, v]) => root.style.setProperty(k, v));
    root.setAttribute('data-theme', mode === 'dark' ? 'dark' : 'light');
  }

  function applyAccent(hex) {
    const root = document.documentElement;
    const base = hex || TEAL_DEFAULT;
    Object.entries(TEAL_RAMP).forEach(([step, ratio]) => {
      root.style.setProperty(`--teal-${step}`, ratio === 0 ? base : _mix(base, ratio));
    });
  }

  async function init() {
    try {
      const [mode, accent] = await Promise.all([
        DB.getSetting('ui_theme_mode'),
        DB.getSetting('ui_theme_accent'),
      ]);
      applyMode(mode === 'dark' ? 'dark' : 'light');
      // Keep one controlled brand accent. Arbitrary colors caused unreadable
      // combinations, especially in dark mode.
      applyAccent(TEAL_DEFAULT);
    } catch (e) { /* keep stylesheet defaults */ }
  }

  return { init, applyMode, applyAccent, TEAL_DEFAULT };
})();
