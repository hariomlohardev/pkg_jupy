/**
 * theme/themeEngine.js
 * Compiles theme token objects into CSS custom properties and injects them
 * over base/variables.css. Handles validation, dark-mode derivation,
 * persistence (localStorage), fonts, and YAML/JSON parsing.
 */
import { DEFAULT_THEME } from './defaultTheme.js';

const COLOR_KEYS = [
  'primary','secondary','success','warning','danger',
  'surface','text','bg_well','border','shadow',
  'on_primary','on_secondary','on_danger','muted',
  'terminal_bg','terminal_fg','terminal_accent','plot_bg',
  'primary_tint','secondary_tint',
];

const COLOR_VAR = {
  primary:'--color-primary', secondary:'--color-secondary', success:'--color-success',
  warning:'--color-warning', danger:'--color-danger', surface:'--color-surface',
  text:'--color-text', bg_well:'--color-bg-well', border:'--color-border', shadow:'--color-shadow',
  on_primary:'--color-on-primary', on_secondary:'--color-on-secondary', on_danger:'--color-on-danger',
  muted:'--color-muted', terminal_bg:'--color-terminal-bg', terminal_fg:'--color-terminal-fg',
  terminal_accent:'--color-terminal-accent', plot_bg:'--color-plot-bg',
  primary_tint:'--color-primary-tint', secondary_tint:'--color-secondary-tint',
};

const STYLE_ID = 'jupy-active-theme';
const FONT_LINK_ID = 'jupy-theme-fonts';
const LS_THEMES = 'jupy-themes';
const LS_ACTIVE = 'jupy-active-theme';
const DEFAULT_KEY = '__default__';

// ---------- helpers ----------
function hexToRgba(hex, alpha) {
  let h = String(hex).replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
function isValidColor(v) {
  if (typeof v !== 'string') return false;
  const s = v.trim();
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s) || /^(rgba?|hsla?)\(/i.test(s);
}
function isLength(v) { return typeof v === 'string' && /^\d+(\.\d+)?(px|em|rem|%)?$/.test(v.trim()); }
function toPx(v) { const s = String(v).trim(); return /^\d+(\.\d+)?$/.test(s) ? s + 'px' : s; }

function deepMerge(base, override) {
  const out = { ...base };
  for (const k of Object.keys(override)) {
    const bv = base[k], ov = override[k];
    if (ov && typeof ov === 'object' && !Array.isArray(ov) && bv && typeof bv === 'object' && !Array.isArray(bv)) {
      out[k] = deepMerge(bv, ov);
    } else if (ov !== undefined) {
      out[k] = ov;
    }
  }
  return out;
}

// ---------- validation ----------
export function validateTheme(theme) {
  const errors = [], warnings = [];
  if (!theme || typeof theme !== 'object') {
    return { ok: false, errors: ['Theme did not parse to an object.'], warnings };
  }
  if (!theme.name || typeof theme.name !== 'string') errors.push('Missing required field: name');
  if (!theme.colors || !theme.colors.light) {
    errors.push('Missing required section: colors.light');
  } else {
    for (const k of ['primary','secondary','surface','text','bg_well','border','shadow']) {
      if (theme.colors.light[k] === undefined) errors.push(`colors.light.${k} is required`);
    }
    for (const mode of ['light','dark']) {
      const pal = theme.colors[mode];
      if (!pal) continue;
      for (const k of Object.keys(pal)) {
        if (!COLOR_KEYS.includes(k)) { warnings.push(`colors.${mode}.${k} is not a recognized token (ignored)`); continue; }
        if (!isValidColor(pal[k])) errors.push(`colors.${mode}.${k} has invalid color "${pal[k]}"`);
      }
    }
  }
  if (theme.shape) {
    if (theme.shape.shadow_style && !['hard','soft','none'].includes(theme.shape.shadow_style))
      errors.push(`shape.shadow_style must be hard, soft, or none (got "${theme.shape.shadow_style}")`);
    for (const k of ['radius_sm','radius_md','border_width']) {
      if (theme.shape[k] !== undefined && !isLength(theme.shape[k]))
        errors.push(`shape.${k} must be a length like "4px" (got "${theme.shape[k]}")`);
    }
  }
  if (theme.density && !['compact','comfortable','spacious'].includes(theme.density))
    errors.push(`density must be compact, comfortable, or spacious (got "${theme.density}")`);
  return { ok: errors.length === 0, errors, warnings };
}

// ---------- dark derivation (fallback when colors.dark is omitted) ----------
function deriveDark(light) {
  return {
    primary: light.primary, secondary: light.secondary, success: light.success,
    warning: light.warning, danger: light.danger,
    surface: '#18181B', text: '#F9FAFB', bg_well: '#09090B',
    border: '#F9FAFB', shadow: '#F9FAFB',
    on_primary: light.on_primary || '#FFFFFF',
    on_secondary: light.on_secondary || '#111827',
    on_danger: light.on_danger || '#FFFFFF',
    muted: '#9CA3AF',
    terminal_bg: light.terminal_bg || '#09090B',
    terminal_fg: light.terminal_fg || '#F9FAFB',
    terminal_accent: light.terminal_accent || '#34D399',
    plot_bg: '#FFFFFF',
    primary_tint: hexToRgba(light.primary, 0.12),
    secondary_tint: hexToRgba(light.secondary, 0.12),
  };
}

// ---------- compilation ----------
function shadowsFor(style) {
  if (style === 'none') return { sm: 'none', md: 'none', lg: 'none' };
  if (style === 'soft') {
    const c = 'rgba(0, 0, 0, 0.28)';
    return { sm: `0 2px 6px ${c}`, md: `0 4px 12px ${c}`, lg: `0 8px 24px ${c}` };
  }
  return {
    sm: '2px 2px 0px var(--color-shadow)',
    md: '3px 3px 0px var(--color-shadow)',
    lg: '5px 5px 0px var(--color-shadow)',
  };
}
function densityVars(d) {
  if (d === 'compact')   return { '--cell-padding':'4px',  '--cell-gap':'4px',  '--block-padding':'4px 8px' };
  if (d === 'spacious')  return { '--cell-padding':'12px', '--cell-gap':'10px', '--block-padding':'10px 14px' };
  return { '--cell-padding':'8px', '--cell-gap':'8px', '--block-padding':'6px 10px' };
}
function paletteCss(pal, indent = '  ') {
  return COLOR_KEYS
    .filter(k => pal[k] !== undefined)
    .map(k => `${indent}${COLOR_VAR[k]}: ${pal[k]};`)
    .join('\n');
}

export function compileTheme(theme) {
  const light = theme.colors.light;
  const dark = theme.colors.dark || deriveDark(light);
  const shape = theme.shape || {};
  const shadows = shadowsFor(shape.shadow_style || 'hard');
  const fonts = theme.fonts || {};
  const dens = densityVars(theme.density || 'comfortable');

  const shapeBlock = [
    `  --rounded-sm: ${toPx(shape.radius_sm || '4px')};`,
    `  --rounded-md: ${toPx(shape.radius_md || '6px')};`,
    `  --border-thick: ${toPx(shape.border_width || '2px')} solid var(--color-border);`,
    `  --shadow-brutal-sm: ${shadows.sm};`,
    `  --shadow-brutal: ${shadows.md};`,
    `  --shadow-brutal-lg: ${shadows.lg};`,
  ].join('\n');

  const fontBlock = [
    fonts.display ? `  --font-display: "${fonts.display}", sans-serif;` : null,
    fonts.body    ? `  --font-body: "${fonts.body}", sans-serif;` : null,
    fonts.mono    ? `  --font-mono: "${fonts.mono}", monospace;` : null,
  ].filter(Boolean).join('\n');

  const densBlock = Object.entries(dens).map(([k, v]) => `  ${k}: ${v};`).join('\n');

  const lightCss = `:root {\n${paletteCss(light)}\n${shapeBlock}\n${fontBlock}\n${densBlock}\n}`;
  const darkCss  = `html[data-theme="dark"] {\n${paletteCss(dark)}\n}`;
  const mediaCss = `@media (prefers-color-scheme: dark) {\n  html:not([data-theme="light"]) {\n${paletteCss(dark, '    ')}\n  }\n}`;

  return `/* Jupy active theme: ${theme.name || 'custom'} */\n${lightCss}\n${darkCss}\n${mediaCss}`;
}

// ---------- parsing / export ----------
function parseThemeFile(text, filename) {
  if (window.jsyaml && typeof window.jsyaml.load === 'function') {
    return window.jsyaml.load(text); // YAML superset — also handles .json
  }
  return JSON.parse(text); // fallback when the YAML lib isn't loaded
}
function toYaml(theme) {
  if (window.jsyaml && typeof window.jsyaml.dump === 'function') {
    return window.jsyaml.dump(theme, { indent: 2, lineWidth: 120 });
  }
  return JSON.stringify(theme, null, 2);
}

// ---------- engine ----------
export function initThemeEngine() {
  const getInstalled = () => { try { return JSON.parse(localStorage.getItem(LS_THEMES) || '{}'); } catch { return {}; } };
  const saveInstalled = (m) => localStorage.setItem(LS_THEMES, JSON.stringify(m));
  const getActiveKey = () => localStorage.getItem(LS_ACTIVE) || DEFAULT_KEY;
  const setActiveKey = (k) => localStorage.setItem(LS_ACTIVE, k);

  function injectCss(css) {
    let el = document.getElementById(STYLE_ID);
    if (!el) { el = document.createElement('style'); el.id = STYLE_ID; document.head.appendChild(el); }
    el.textContent = css;
  }
  function setFonts(url) {
    let link = document.getElementById(FONT_LINK_ID);
    if (!url) { if (link) link.remove(); return; }
    if (!link) { link = document.createElement('link'); link.id = FONT_LINK_ID; link.rel = 'stylesheet'; document.head.appendChild(link); }
    if (link.href !== url) link.href = url;
  }

  function applyTheme(theme) {
    const merged = deepMerge(DEFAULT_THEME, theme || {});
    injectCss(compileTheme(merged));
    setFonts(merged.fonts && merged.fonts.url);
    return merged;
  }

  function applyActive() {
    const key = getActiveKey();
    if (key === DEFAULT_KEY) return applyTheme(DEFAULT_THEME);
    const theme = getInstalled()[key];
    return theme ? applyTheme(theme) : applyTheme(DEFAULT_THEME);
  }

  function installTheme(theme) {
    const m = getInstalled();
    m[theme.name] = theme;
    saveInstalled(m);
  }
  function removeTheme(name) {
    const m = getInstalled();
    delete m[name];
    saveInstalled(m);
    if (getActiveKey() === name) { setActiveKey(DEFAULT_KEY); applyTheme(DEFAULT_THEME); }
  }
  function activate(name) {
    if (name === DEFAULT_KEY) { setActiveKey(DEFAULT_KEY); return applyTheme(DEFAULT_THEME); }
    const theme = getInstalled()[name];
    if (!theme) return null;
    setActiveKey(name);
    return applyTheme(theme);
  }
  function resetToDefault() { setActiveKey(DEFAULT_KEY); applyTheme(DEFAULT_THEME); }
  function getActiveTheme() {
    const key = getActiveKey();
    return key === DEFAULT_KEY ? DEFAULT_THEME : (getInstalled()[key] || DEFAULT_THEME);
  }

  return {
    DEFAULT_KEY, DEFAULT_THEME,
    applyActive, applyTheme, installTheme, removeTheme, activate, resetToDefault,
    getInstalled, getActiveKey, getActiveTheme,
    validate: validateTheme, compile: compileTheme,
    parse: parseThemeFile, exportYaml: toYaml,
  };
}