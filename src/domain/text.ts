// Outils de lecture communs aux lecteurs de relevés : normalisation, CSV, montants et dates.

/** Minuscules, sans accents ni ponctuation superflue, espaces simples : sert aux comparaisons et aux règles. */
export function norm(s: string): string {
  return String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[  \t]/g, ' ')
    .replace(/[’`´]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** Espaces multiples réduits (libellés de relevés alignés en colonnes). */
export function squash(s: string): string {
  return String(s ?? '').replace(/[  \t]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Lecture CSV robuste : séparateur détecté (, ; tabulation), guillemets, retours à la ligne entre guillemets. */
export function parseCsv(text: string): string[][] {
  const t = text.replace(/^﻿/, '');
  const firstLines = t.split(/\r?\n/).slice(0, 15).join('\n');
  const count = (c: string) => (firstLines.match(new RegExp(c === '\t' ? '\\t' : '\\' + c, 'g')) || []).length;
  const sep = [',', ';', '\t'].sort((a, b) => count(b) - count(a))[0];
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) {
      if (ch === '"') {
        if (t[i + 1] === '"') { field += '"'; i++; } else q = false;
      } else field += ch;
    } else if (ch === '"' && field.trim() === '') { q = true; field = ''; }
    else if (ch === sep) { row.push(field.trim()); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && t[i + 1] === '\n') i++;
      row.push(field.trim());
      if (row.some((x) => x !== '')) rows.push(row);
      row = []; field = '';
    } else field += ch;
  }
  row.push(field.trim());
  if (row.some((x) => x !== '')) rows.push(row);
  return rows;
}

/**
 * Montant écrit à la française (« 1 234,56 », « -12,30 € ») ou à l'américaine (« 1,234.56 », « -$12.30 », « (12.30) »).
 * Renvoie NaN si le texte n'est pas un montant.
 */
export function parseAmount(s: string): number {
  let t = String(s ?? '').trim();
  if (!t) return NaN;
  let neg = false;
  if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
  t = t.replace(/[\s  ]/g, '').replace(/[$€£]|EUR|USD/gi, '').replace(/[−–ñ]/g, '-');
  if (t.startsWith('+')) t = t.slice(1);
  if (t.startsWith('-')) { neg = !neg; t = t.slice(1); }
  if (t.endsWith('-')) { neg = !neg; t = t.slice(0, -1); }
  if (!/^[\d.,']+$/.test(t)) return NaN;
  t = t.replace(/'/g, '');
  const lc = t.lastIndexOf(','), ld = t.lastIndexOf('.');
  if (lc >= 0 && ld >= 0) t = lc > ld ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  else if (lc >= 0) t = /,\d{3}$/.test(t) && (t.match(/,/g) || []).length > 1 ? t.replace(/,/g, '') : /^\d{1,3}(,\d{3})+$/.test(t) && !/,\d{1,2}$/.test(t) ? t.replace(/,/g, '') : t.replace(',', '.');
  else if (ld >= 0 && (t.match(/\./g) || []).length > 1) t = t.replace(/\./g, '');
  const v = Number(t);
  if (!isFinite(v)) return NaN;
  return Math.round((neg ? -v : v) * 100) / 100;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Numéro de série Excel (jours depuis le 30/12/1899) → AAAA-MM-JJ. */
export function excelDate(serial: number): string {
  const d = new Date(Math.round((serial - 25569) * 864e5));
  return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
}

/**
 * Date d'un relevé → AAAA-MM-JJ (ou '' si illisible).
 * order : 'dmy' (France), 'mdy' (États-Unis) ; formats ISO et numéro de série Excel reconnus d'office.
 */
export function parseDate(s: string, order: 'dmy' | 'mdy' = 'dmy'): string {
  const t = String(s ?? '').trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  m = /^(\d{4})(\d{2})(\d{2})(?:\d{6})?(?:\.\d+)?(?:\[.*\])?$/.exec(t); // OFX : 20261005120000[-5:EST]
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  m = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})/.exec(t);
  if (m) {
    let [a, b] = [+m[1], +m[2]];
    if (order === 'mdy') [a, b] = [b, a];
    let y = +m[3];
    if (y < 100) y += 2000;
    if (b < 1 || b > 12 || a < 1 || a > 31) return '';
    return y + '-' + pad(b) + '-' + pad(a);
  }
  if (/^\d{5}(\.\d+)?$/.test(t)) {
    const n = +t;
    if (n > 30000 && n < 80000) return excelDate(n);
  }
  return '';
}

const FR_MONTHS: Record<string, number> = { janvier: 1, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7, aout: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12, janv: 1, fevr: 2, fev: 2, avr: 4, juil: 7, sept: 9, oct: 10, nov: 11, dec: 12 };
const EN_MONTHS: Record<string, number> = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12, jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };

/** Numéro de mois d'un nom de mois français ou anglais (abrégé ou non), 0 si inconnu. */
export function monthNumber(name: string): number {
  const k = norm(name).replace(/\./g, '');
  return FR_MONTHS[k] || EN_MONTHS[k] || 0;
}

/** « October 6, 2026 » ou « 06 Octobre 2026 » → AAAA-MM-JJ. */
export function parseWordDate(s: string): string {
  let m = /([A-Za-zéû]+)\.?\s+(\d{1,2}),?\s+(\d{4})/.exec(s);
  if (m && monthNumber(m[1])) return m[3] + '-' + pad(monthNumber(m[1])) + '-' + pad(+m[2]);
  m = /(\d{1,2})\s+([A-Za-zéû]+)\.?\s+(\d{4})/.exec(s);
  if (m && monthNumber(m[2])) return m[3] + '-' + pad(monthNumber(m[2])) + '-' + pad(+m[1]);
  return '';
}

/** Index de la première colonne dont l'en-tête correspond à un des alias (comparaison normalisée). */
export function findCol(header: string[], aliases: string[]): number {
  const h = header.map(norm);
  for (const a of aliases) {
    const i = h.indexOf(norm(a));
    if (i >= 0) return i;
  }
  return -1;
}

/** Titulaire « M. Dupont Jean », « JEAN PIERRE DUPONT » → « Dupont Jean » / « JEAN PIERRE DUPONT » (civilité retirée). */
export function cleanHolder(s: string): string {
  return squash(s).replace(/^(m\.?|mme\.?|mlle\.?|mr\.?|mrs\.?|ms\.?|monsieur|madame)\s+/i, '').replace(/\s+(ou|and|et)\s+.*$/i, '');
}
