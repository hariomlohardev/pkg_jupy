/**
 * theme/themeEngine.js
 * Compiles theme token objects (YAML/JSON) into CSS custom properties and
 * injects them over base/variables.css. Handles validation, dark-mode
 * derivation, persistence, fonts, and the full token schema including
 * colors, shape, fonts, density, and cells.
 */

// ==========================================================================
// DEFAULT THEME (single source of truth — matches current brutalism look)
// ==========================================================================
export const DEFAULT_THEME = {
  name: 'Jupy Brutalism',
  author: 'Jupy',
  version: 1,
  fonts: {
    display: 'Darker Grotesque',
    body: 'Darker Grotesque',
    mono: 'JetBrains Mono',
    url: 'https://fonts.googleapis.com/css2?family=Darker+Grotesque:wght@500;700;800;900&family=JetBrains+Mono:wght@400;500;700;800&display=swap',
  },
  shape: {
    radius_sm: '4px',
    radius_md: '6px',
    border_width: '2px',
    shadow_style: 'hard',
  },
  density: 'comfortable',
  colors: {
    light: {
      primary: '#DD614C',
      secondary: '#DAA144',
      success: '#16A34A',
      warning: '#D97706',
      danger: '#DC2626',
      surface: '#FFFFFF',
      text: '#111827',
      bg_well: '#F3F4F6',
      border: '#111827',
      shadow: '#111827',
      on_primary: '#FFFFFF',
      on_secondary: '#111827',
      on_danger: '#FFFFFF',
      muted: '#6B7280',
      terminal_bg: '#09090B',
      terminal_fg: '#F9FAFB',
      terminal_accent: '#34D399',
      plot_bg: '#FFFFFF',
      primary_tint: 'rgba(221, 97, 76, 0.08)',
      secondary_tint: 'rgba(218, 161, 68, 0.08)',
      hover_tint: 'rgba(0, 0, 0, 0.03)',
    },
    dark: {
      primary: '#DD614C',
      secondary: '#DAA144',
      success: '#16A34A',
      warning: '#D97706',
      danger: '#DC2626',
      surface: '#18181B',
      text: '#F9FAFB',
      bg_well: '#09090B',
      border: '#F9FAFB',
      shadow: '#F9FAFB',
      on_primary: '#FFFFFF',
      on_secondary: '#111827',
      on_danger: '#FFFFFF',
      muted: '#9CA3AF',
      terminal_bg: '#09090B',
      terminal_fg: '#F9FAFB',
      terminal_accent: '#34D399',
      plot_bg: '#FFFFFF',
      primary_tint: 'rgba(221, 97, 76, 0.12)',
      secondary_tint: 'rgba(218, 161, 68, 0.12)',
      hover_tint: 'rgba(255, 255, 255, 0.04)',
    },
  },
  cells: {
    card: {
      background: 'var(--color-surface)',
      border_width: '2px',
      radius: 'var(--rounded-md)',
      shadow: 'hard',
      padding: '8px',
      spacing: '8px',
      inner_gap: '8px',
      max_width: '820px',
    },
    states: {
      selected: 'var(--color-secondary)',
      editing: 'var(--color-primary)',
      running_tint: 'var(--color-primary-tint)',
      queued_tint: 'var(--color-secondary-tint)',
    },
    gutter: {
      width: '28px',
      run_size: '24px',
      run_radius: 'var(--rounded-sm)',
      run_bg: 'var(--color-secondary)',
      run_fg: 'var(--color-on-secondary)',
      run_bg_hover: 'var(--color-primary)',
      run_fg_hover: 'var(--color-on-primary)',
      run_bg_running: 'var(--color-danger)',
      run_fg_running: 'var(--color-on-danger)',
    },
    editor: {
      border_width: '2px',
      background: 'var(--color-surface)',
      radius: 'var(--rounded-sm)',
      font_size: '0.82rem',
      line_height: '1.4',
    },
    output: {
      background: 'var(--color-surface)',
      border_width: '2px',
      radius: 'var(--rounded-sm)',
      font_size: '0.8rem',
      line_height: '1.45',
      max_height: '480px',
    },
    toolbar: {
      button_size: '22px',
      idle_opacity: '0',
    },
    markdown: {
      font_size: '1.05rem',
      line_height: '1.65',
    },
  },
};

// ==========================================================================
// TOKEN → CSS VARIABLE MAPPINGS
// ==========================================================================
const COLOR_KEYS = [
  'primary', 'secondary', 'success', 'warning', 'danger',
  'surface', 'text', 'bg_well', 'border', 'shadow',
  'on_primary', 'on_secondary', 'on_danger', 'muted',
  'terminal_bg', 'terminal_fg', 'terminal_accent', 'plot_bg',
  'primary_tint', 'secondary_tint', 'hover_tint',
];

const COLOR_VAR = {
  primary: '--color-primary',
  secondary: '--color-secondary',
  success: '--color-success',
  warning: '--color-warning',
  danger: '--color-danger',
  surface: '--color-surface',
  text: '--color-text',
  bg_well: '--color-bg-well',
  border: '--color-border',
  shadow: '--color-shadow',
  on_primary: '--color-on-primary',
  on_secondary: '--color-on-secondary',
  on_danger: '--color-on-danger',
  muted: '--color-muted',
  terminal_bg: '--color-terminal-bg',
  terminal_fg: '--color-terminal-fg',
  terminal_accent: '--color-terminal-accent',
  plot_bg: '--color-plot-bg',
  primary_tint: '--color-primary-tint',
  secondary_tint: '--color-secondary-tint',
  hover_tint: '--color-hover-tint',
};

const CELLS_VAR = {
  'card.background': '--cell-bg',
  'card.border_width': '--cell-border-width',
  'card.radius': '--cell-radius',
  'card.padding': '--cell-padding',
  'card.spacing': '--cell-spacing',
  'card.inner_gap': '--cell-inner-gap',
  'card.max_width': '--notebook-max-width',
  'states.selected': '--cell-selected',
  'states.editing': '--cell-editing',
  'states.running_tint': '--cell-running-tint',
  'states.queued_tint': '--cell-queued-tint',
  'gutter.width': '--gutter-width',
  'gutter.run_size': '--run-size',
  'gutter.run_radius': '--run-radius',
  'gutter.run_bg': '--run-bg',
  'gutter.run_fg': '--run-fg',
  'gutter.run_bg_hover': '--run-bg-hover',
  'gutter.run_fg_hover': '--run-fg-hover',
  'gutter.run_bg_running': '--run-bg-running',
  'gutter.run_fg_running': '--run-fg-running',
  'editor.border_width': '--editor-border-width',
  'editor.background': '--editor-bg',
  'editor.radius': '--editor-radius',
  'editor.font_size': '--editor-font-size',
  'editor.line_height': '--editor-line-height',
  'output.background': '--output-bg',
  'output.border_width': '--output-border-width',
  'output.radius': '--output-radius',
  'output.font_size': '--output-font-size',
  'output.line_height': '--output-line-height',
  'output.max_height': '--output-max-height',
  'toolbar.button_size': '--toolbar-btn-size',
  'toolbar.idle_opacity': '--toolbar-idle-opacity',
  'markdown.font_size': '--md-font-size',
  'markdown.line_height': '--md-line-height',
};

// ==========================================================================
// CONSTANTS
// ==========================================================================
const STYLE_ID = 'jupy-active-theme';
const FONT_LINK_ID = 'jupy-theme-fonts';
const LS_THEMES = 'jupy-themes';
const LS_ACTIVE = 'jupy-active-theme';
const DEFAULT_KEY = '__default__';

// ==========================================================================
// HELPERS
// ==========================================================================
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
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s)) return true;
  if (/^(rgba?|hsla?)\(/i.test(s)) return true;
  if (s.startsWith('var(')) return true;
  return false;
}

function isLength(v) {
  return typeof v === 'string' && /^\d+(\.\d+)?(px|em|rem|%|vh|vw)?$/.test(v.trim());
}

function toPx(v) {
  const s = String(v).trim();
  return /^\d+(\.\d+)?$/.test(s) ? s + 'px' : s;
}

function deepMerge(base, override) {
  if (!override || typeof override !== 'object') return base;
  const out = { ...base };
  for (const k of Object.keys(override)) {
    const bv = base?.[k];
    const ov = override[k];
    if (ov && typeof ov === 'object' && !Array.isArray(ov) && bv && typeof bv === 'object' && !Array.isArray(bv)) {
      out[k] = deepMerge(bv, ov);
    } else if (ov !== undefined) {
      out[k] = ov;
    }
  }
  return out;
}

// ==========================================================================
// VALIDATION
// ==========================================================================
export function validateTheme(theme) {
  const errors = [];
  const warnings = [];

  if (!theme || typeof theme !== 'object') {
    return { ok: false, errors: ['Theme did not parse to an object.'], warnings };
  }
  if (!theme.name || typeof theme.name !== 'string') {
    errors.push('Missing required field: name');
  }
  if (!theme.colors || !theme.colors.light) {
    errors.push('Missing required section: colors.light');
  } else {
    const required = ['primary', 'secondary', 'surface', 'text', 'bg_well', 'border', 'shadow'];
    for (const k of required) {
      if (theme.colors.light[k] === undefined) {
        errors.push(`colors.light.${k} is required`);
      }
    }
    for (const mode of ['light', 'dark']) {
      const pal = theme.colors[mode];
      if (!pal) continue;
      for (const k of Object.keys(pal)) {
        if (!COLOR_KEYS.includes(k)) {
          warnings.push(`colors.${mode}.${k} is not a recognized token (ignored)`);
          continue;
        }
        if (!isValidColor(pal[k])) {
          errors.push(`colors.${mode}.${k} has invalid color "${pal[k]}"`);
        }
      }
    }
  }
  if (theme.shape) {
    if (theme.shape.shadow_style && !['hard', 'soft', 'none'].includes(theme.shape.shadow_style)) {
      errors.push(`shape.shadow_style must be hard, soft, or none (got "${theme.shape.shadow_style}")`);
    }
    for (const k of ['radius_sm', 'radius_md', 'border_width']) {
      if (theme.shape[k] !== undefined && !isLength(theme.shape[k])) {
        errors.push(`shape.${k} must be a length like "4px" (got "${theme.shape[k]}")`);
      }
    }
  }
  if (theme.density && !['compact', 'comfortable', 'spacious'].includes(theme.density)) {
    errors.push(`density must be compact, comfortable, or spacious (got "${theme.density}")`);
  }
  if (theme.cells) {
    if (theme.cells.card?.shadow && !['hard', 'soft', 'none'].includes(theme.cells.card.shadow)) {
      errors.push(`cells.card.shadow must be hard, soft, or none (got "${theme.cells.card.shadow}")`);
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

// ==========================================================================
// DARK MODE DERIVATION (fallback when colors.dark is omitted)
// ==========================================================================
function deriveDark(light) {
  return {
    primary: light.primary,
    secondary: light.secondary,
    success: light.success,
    warning: light.warning,
    danger: light.danger,
    surface: '#18181B',
    text: '#F9FAFB',
    bg_well: '#09090B',
    border: '#F9FAFB',
    shadow: '#F9FAFB',
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
    hover_tint: 'rgba(255, 255, 255, 0.04)',
  };
}

// ==========================================================================
// COMPILATION
// ==========================================================================
function shadowsFor(style) {
  if (style === 'none') return { sm: 'none', md: 'none', lg: 'none' };
  if (style === 'soft') {
    const c = 'rgba(0, 0, 0, 0.28)';
    return { sm: `0 2px 6px ${c}`, md: `0 4px 14px ${c}`, lg: `0 8px 24px ${c}` };
  }
  // hard (default)
  return {
    sm: '2px 2px 0px var(--color-shadow)',
    md: '3px 3px 0px var(--color-shadow)',
    lg: '5px 5px 0px var(--color-shadow)',
  };
}

function densityVars(d) {
  if (d === 'compact') return { '--cell-padding': '4px', '--cell-gap': '4px', '--block-padding': '4px 8px' };
  if (d === 'spacious') return { '--cell-padding': '12px', '--cell-gap': '10px', '--block-padding': '10px 14px' };
  return { '--cell-padding': '8px', '--cell-gap': '8px', '--block-padding': '6px 10px' };
}

function paletteCss(pal, indent = '  ') {
  return COLOR_KEYS
    .filter(k => pal[k] !== undefined)
    .map(k => `${indent}${COLOR_VAR[k]}: ${pal[k]};`)
    .join('\n');
}

function compileCells(cells) {
  if (!cells) return '';
  const lines = [];
  for (const [path, cssVar] of Object.entries(CELLS_VAR)) {
    const [group, key] = path.split('.');
    const val = cells[group]?.[key];
    if (val !== undefined) lines.push(`  ${cssVar}: ${val};`);
  }
  // cells.card.shadow is an enum → translate to actual box-shadow value
  const shadow = cells.card?.shadow;
  if (shadow) {
    const map = {
      hard: '3px 3px 0px var(--color-shadow)',
      soft: '0 4px 14px rgba(0,0,0,0.25)',
      none: 'none',
    };
    if (map[shadow]) lines.push(`  --cell-shadow: ${map[shadow]};`);
  }
  return lines.length ? `  /* cells */\n${lines.join('\n')}` : '';
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
    fonts.body ? `  --font-body: "${fonts.body}", sans-serif;` : null,
    fonts.mono ? `  --font-mono: "${fonts.mono}", monospace;` : null,
  ].filter(Boolean).join('\n');

  const densBlock = Object.entries(dens).map(([k, v]) => `  ${k}: ${v};`).join('\n');
  const cellsBlock = compileCells(theme.cells);

  const lightCss = `:root {\n${paletteCss(light)}\n${shapeBlock}\n${fontBlock}\n${densBlock}\n${cellsBlock}\n}`;
  const darkCss = `html[data-theme="dark"] {\n${paletteCss(dark)}\n}`;
  const mediaCss = `@media (prefers-color-scheme: dark) {\n  html:not([data-theme="light"]) {\n${paletteCss(dark, '    ')}\n  }\n}`;

  return `/* Jupy active theme: ${theme.name || 'custom'} */\n${lightCss}\n${darkCss}\n${mediaCss}`;
}

// ==========================================================================
// PARSING / EXPORT
// ==========================================================================
function parseThemeFile(text, filename) {
  const isJson = filename && filename.toLowerCase().endsWith('.json');
  if (window.jsyaml && typeof window.jsyaml.load === 'function') {
    return window.jsyaml.load(text);
  }
  if (isJson) {
    return JSON.parse(text);
  }
  // Last resort: try JSON anyway (some .yml files are actually JSON)
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('js-yaml library not loaded and file is not valid JSON. Add the js-yaml CDN script to index.html.');
  }
}

function toYaml(theme) {
  if (window.jsyaml && typeof window.jsyaml.dump === 'function') {
    return window.jsyaml.dump(theme, { indent: 2, lineWidth: 120, noRefs: true });
  }
  return JSON.stringify(theme, null, 2);
}

// ==========================================================================
// ENGINE
// ==========================================================================
export function initThemeEngine() {
  // ---- localStorage helpers ----
  const getInstalled = () => {
    try { return JSON.parse(localStorage.getItem(LS_THEMES) || '{}'); } catch { return {}; }
  };
  const saveInstalled = (m) => localStorage.setItem(LS_THEMES, JSON.stringify(m));
  const getActiveKey = () => localStorage.getItem(LS_ACTIVE) || DEFAULT_KEY;
  const setActiveKey = (k) => localStorage.setItem(LS_ACTIVE, k);

  // ---- DOM injection ----
  function injectCss(css) {
    let el = document.getElementById(STYLE_ID);
    if (!el) {
      el = document.createElement('style');
      el.id = STYLE_ID;
      document.head.appendChild(el);
    }
    el.textContent = css;
  }

  function setFonts(url) {
    let link = document.getElementById(FONT_LINK_ID);
    if (!url) {
      if (link) link.remove();
      return;
    }
    if (!link) {
      link = document.createElement('link');
      link.id = FONT_LINK_ID;
      link.rel = 'stylesheet';
      document.head.appendChild(link);
    }
    if (link.href !== url) link.href = url;
  }

  // ---- Core apply ----
  function applyTheme(theme) {
    const merged = deepMerge(DEFAULT_THEME, theme || {});
    injectCss(compileTheme(merged));
    setFonts(merged.fonts?.url);
    return merged;
  }

  function applyActive() {
    const key = getActiveKey();
    if (key === DEFAULT_KEY) return applyTheme(DEFAULT_THEME);
    const theme = getInstalled()[key];
    return theme ? applyTheme(theme) : applyTheme(DEFAULT_THEME);
  }

  // ---- CRUD ----
  function installTheme(theme) {
    const m = getInstalled();
    m[theme.name] = theme;
    saveInstalled(m);
  }

  function removeTheme(name) {
    const m = getInstalled();
    delete m[name];
    saveInstalled(m);
    if (getActiveKey() === name) {
      setActiveKey(DEFAULT_KEY);
      applyTheme(DEFAULT_THEME);
    }
  }

  function activate(name) {
    if (name === DEFAULT_KEY) {
      setActiveKey(DEFAULT_KEY);
      return applyTheme(DEFAULT_THEME);
    }
    const theme = getInstalled()[name];
    if (!theme) return null;
    setActiveKey(name);
    return applyTheme(theme);
  }

  function resetToDefault() {
    setActiveKey(DEFAULT_KEY);
    applyTheme(DEFAULT_THEME);
  }

  function getActiveTheme() {
    const key = getActiveKey();
    return key === DEFAULT_KEY ? DEFAULT_THEME : (getInstalled()[key] || DEFAULT_THEME);
  }

  // ---- Public API ----
  return {
    DEFAULT_KEY,
    DEFAULT_THEME,
    applyActive,
    applyTheme,
    installTheme,
    removeTheme,
    activate,
    resetToDefault,
    getInstalled,
    getActiveKey,
    getActiveTheme,
    validate: validateTheme,
    compile: compileTheme,
    parse: parseThemeFile,
    exportYaml: toYaml,
  };
}