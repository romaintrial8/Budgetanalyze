// Thème de l'interface : clair, sombre ou celui du système. Préférence propre à l'appareil,
// appliquée sans recharger (attribut data-theme sur <html>, couleurs dans styles/tokens.css).
export type ThemePref = 'light' | 'dark' | 'system';
const KEY = 'budgetanalyze:theme';

function read(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

let pref: ThemePref = typeof window === 'undefined' ? 'system' : read();
const listeners = new Set<() => void>();
const media = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

export function themePref(): ThemePref {
  return pref;
}

export function resolvedTheme(): 'light' | 'dark' {
  return pref === 'system' ? (media?.matches ? 'dark' : 'light') : pref;
}

function apply(): void {
  if (typeof document === 'undefined') return;
  const t = resolvedTheme();
  document.documentElement.dataset.theme = t;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', getComputedStyle(document.documentElement).getPropertyValue('--bg-page').trim() || (t === 'dark' ? '#0B0E16' : '#FFFFFF'));
  listeners.forEach((l) => l());
}

export function setThemePref(p: ThemePref): void {
  pref = p;
  try { localStorage.setItem(KEY, p); } catch { /* stockage indisponible */ }
  apply();
}

/** Notifié quand le thème affiché change (choix de l'utilisateur ou réglage du système). */
export function onThemeChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

media?.addEventListener?.('change', () => { if (pref === 'system') apply(); });
apply();
