// Formatage français centralisé : montants dans leur devise, pourcentages, dates.
export const NBSP = ' '; // espace insécable fine entre nombre et unité
export const MINUS = '−';

const cache = new Map<string, Intl.NumberFormat>();
function nf(min: number, max: number): Intl.NumberFormat {
  const k = min + ':' + max;
  let f = cache.get(k);
  if (!f) {
    f = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: min, maximumFractionDigits: max });
    cache.set(k, f);
  }
  return f;
}

/** Nombre au format français (espace fine pour les milliers, virgule), signe moins typographique. */
export function num(v: number, min = 2, max = min): string {
  if (!isFinite(v)) return '—';
  const s = nf(min, max).format(Math.abs(v)).replace(/ | /g, NBSP);
  return (v < 0 && Math.abs(v) >= Math.pow(10, -max) / 2 ? MINUS : '') + s;
}

const SYMBOL: Record<string, string> = { USD: '$', EUR: '€', GBP: '£', CHF: 'CHF', CAD: 'C$' };
export const symbol = (cur: string): string => SYMBOL[cur] || cur;

/** Montant : « 1 234,56 $ », « 12,30 € ». */
export function money(v: number, cur: string, decimals = 2): string {
  if (!isFinite(v)) return '—';
  return num(v, decimals) + NBSP + symbol(cur);
}

/** Montant signé (+ explicite pour les entrées). */
export function moneySigned(v: number, cur: string, decimals = 2): string {
  if (!isFinite(v)) return '—';
  const r = Math.round(v * Math.pow(10, decimals));
  return (r > 0 ? '+' : '') + money(v, cur, decimals);
}

/** Montant arrondi pour les cartes et graphiques : 1 234 $ ; 12,3 k$ au-delà de 100 000. */
export function moneyShort(v: number, cur: string): string {
  const a = Math.abs(v);
  if (a >= 1e5) return num(v / 1e3, 0, 1) + NBSP + 'k' + symbol(cur);
  if (a >= 1000) return num(v, 0) + NBSP + symbol(cur);
  return money(v, cur, a >= 100 ? 0 : 2);
}

export function pct(ratio: number, decimals = 0): string {
  if (!isFinite(ratio)) return '—';
  return num(ratio * 100, decimals) + NBSP + '%';
}

const MONTHS_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const MONTHS_LONG = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const WEEKDAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
export const MONTHS_TITLE = MONTHS_LONG.map((m) => m.charAt(0).toUpperCase() + m.slice(1));
export const MONTHS_ABBR = MONTHS_SHORT;

/** 'AAAA-MM-JJ' → 'jj/mm/aaaa' */
export function dateFr(iso: string): string {
  if (!iso) return '';
  return iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4);
}
/** 'AAAA-MM-JJ' → 'jj/mm' */
export function dateShort(iso: string): string {
  return iso.slice(8, 10) + '/' + iso.slice(5, 7);
}
/** 'AAAA-MM' → 'sept. 26' */
export function monthShort(ym: string): string {
  return MONTHS_SHORT[+ym.slice(5, 7) - 1] + ' ' + ym.slice(2, 4);
}
/** 'AAAA-MM' → 'Septembre 2026' */
export function monthTitle(ym: string): string {
  return MONTHS_TITLE[+ym.slice(5, 7) - 1] + ' ' + ym.slice(0, 4);
}
/** 'AAAA-MM' → 'sept.' (initiale de graphique) */
export function monthAbbr(ym: string): string {
  return MONTHS_SHORT[+ym.slice(5, 7) - 1];
}
export function weekday(iso: string): string {
  return WEEKDAYS[new Date(iso.slice(0, 10) + 'T12:00:00').getDay()];
}
/** « Lundi 5 oct. » */
export function dayTitle(iso: string): string {
  const d = weekday(iso);
  return d.charAt(0).toUpperCase() + d.slice(1) + ' ' + +iso.slice(8, 10) + ' ' + MONTHS_SHORT[+iso.slice(5, 7) - 1];
}
export function dateLong(iso: string): string {
  return dayTitle(iso) + ' ' + iso.slice(0, 4);
}

/** Saisie « 1 234,56 » ou « 1234.56 » → nombre (NaN si vide ou invalide). */
export function parseNum(s: string): number {
  let t = String(s).replace(/[\s  $€%]/g, '').replace(/[−–]/g, '-');
  if (t.includes(',') && t.includes('.')) t = t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  else t = t.replace(',', '.');
  if (t === '' || t === '-' || t === '.') return NaN;
  const v = Number(t);
  return isFinite(v) ? v : NaN;
}

/** Nombre → texte de champ « 34,28 ». */
export function toInput(v: number, maxDecimals = 2): string {
  if (!isFinite(v)) return '';
  return String(Number(v.toFixed(maxDecimals))).replace('.', ',');
}

export function todayIso(d = new Date()): string {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

/** Mois suivant / précédent : addMonths('2026-12', 1) = '2027-01'. */
export function addMonths(ym: string, k: number): string {
  let y = +ym.slice(0, 4), m = +ym.slice(5, 7) + k;
  while (m > 12) { m -= 12; y++; }
  while (m < 1) { m += 12; y--; }
  return y + '-' + String(m).padStart(2, '0');
}

export function daysInMonth(ym: string): number {
  return new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0)).getUTCDate();
}

/** Écart en jours entre deux dates ISO. */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b.slice(0, 10) + 'T00:00:00Z') - Date.parse(a.slice(0, 10) + 'T00:00:00Z')) / 864e5);
}

export function addDays(iso: string, k: number): string {
  return new Date(Date.parse(iso.slice(0, 10) + 'T00:00:00Z') + k * 864e5).toISOString().slice(0, 10);
}

/** Pluriel simple : plural(3, 'opération', 'opérations'). */
export function plural(n: number, one: string, many: string): string {
  return num(n, 0) + ' ' + (Math.abs(n) >= 2 ? many : one);
}
