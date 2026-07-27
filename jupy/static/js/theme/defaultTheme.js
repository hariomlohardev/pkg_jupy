/**
 * theme/defaultTheme.js
 * The default Jupy Brutalism token set. A theme file only needs to override
 * what it changes — everything else falls back to these values.
 */
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
    shadow_style: 'hard',   // hard | soft | none
  },
  density: 'comfortable',   // compact | comfortable | spacious
  colors: {
    light: {
      primary: '#DD614C', secondary: '#DAA144', success: '#16A34A',
      warning: '#D97706', danger: '#DC2626',
      surface: '#FFFFFF', text: '#111827', bg_well: '#F3F4F6',
      border: '#111827', shadow: '#111827',
      on_primary: '#FFFFFF', on_secondary: '#111827', on_danger: '#FFFFFF',
      muted: '#6B7280',
      terminal_bg: '#09090B', terminal_fg: '#F9FAFB', terminal_accent: '#34D399',
      plot_bg: '#FFFFFF',
      primary_tint: 'rgba(221, 97, 76, 0.08)',
      secondary_tint: 'rgba(218, 161, 68, 0.08)',
    },
    dark: {
      primary: '#DD614C', secondary: '#DAA144', success: '#16A34A',
      warning: '#D97706', danger: '#DC2626',
      surface: '#18181B', text: '#F9FAFB', bg_well: '#09090B',
      border: '#F9FAFB', shadow: '#F9FAFB',
      on_primary: '#FFFFFF', on_secondary: '#111827', on_danger: '#FFFFFF',
      muted: '#9CA3AF',
      terminal_bg: '#09090B', terminal_fg: '#F9FAFB', terminal_accent: '#34D399',
      plot_bg: '#FFFFFF',
      primary_tint: 'rgba(221, 97, 76, 0.12)',
      secondary_tint: 'rgba(218, 161, 68, 0.12)',
    },
  },
};