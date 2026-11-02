// Détection des abonnements et prélèvements récurrents.
// Un même marchand qui revient tous les ~30 jours (ou chaque semaine, chaque année) pour un montant stable = abonnement.
// Un seul passage d'un marchand connu (Netflix, Spotify…) ou d'un prélèvement SEPA = abonnement « probable ».
import type { Row } from './calc';
import { daysBetween, addDays, addMonths, daysInMonth } from './format';
import { norm } from './text';
import { suggestPattern } from './categories';

export type Period = 'weekly' | 'monthly' | 'yearly';
export interface Subscription {
  key: string; // marchand normalisé
  label: string;
  cat: string;
  period: Period;
  amount: number; // montant habituel (devise de référence, positif)
  monthly: number; // coût ramené au mois
  count: number;
  last: string;
  next: string;
  accountId: string;
  status: 'confirmed' | 'probable';
  rowIds: string[];
}

/** Clé de regroupement d'un marchand : « CHECKCARD 0927 NOW INTERNET 8889… » et « Now Internet » → « now internet ». */
export function merchantKey(label: string): string {
  const k = suggestPattern(label).replace(/\.(com|fr|net|io)\b/g, '').replace(/\bcom\b/g, '').trim();
  return k || norm(label);
}

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const n = s.length; return n ? (n % 2 ? s[(n - 1) >> 1] : (s[n / 2 - 1] + s[n / 2]) / 2) : 0; };

export function detectSubscriptions(rows: Row[], today: string): Subscription[] {
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    if (r.tx.amount >= 0 || r.kind === 'transfer' || r.kind === 'invest' || r.kind === 'income') continue;
    if (r.cat === 'especes' || r.cat === 'courses' || r.cat === 'essence' || r.cat === 'restos') continue; // achats du quotidien, jamais des abonnements
    const k = merchantKey(r.tx.label);
    groups.set(k, [...(groups.get(k) || []), r]);
  }
  const out: Subscription[] = [];
  for (const [key, list] of groups) {
    const sorted = [...list].sort((a, b) => a.tx.date.localeCompare(b.tx.date));
    // passages rapprochés (≤ 5 jours) = un seul cycle (prorata + facture du mois chez un assureur, par exemple)
    const cycles: { date: string; amount: number; rows: Row[] }[] = [];
    for (const r of sorted) {
      const c = cycles[cycles.length - 1];
      if (c && daysBetween(c.date, r.tx.date) <= 5) { c.amount += -r.ref; c.rows.push(r); }
      else cycles.push({ date: r.tx.date, amount: -r.ref, rows: [r] });
    }
    const lastRow = sorted[sorted.length - 1];
    const base = { key, label: lastRow.tx.label, cat: lastRow.cat, accountId: lastRow.tx.accountId, rowIds: sorted.map((r) => r.tx.id), last: lastRow.tx.date };
    if (cycles.length >= 2) {
      const gaps = cycles.slice(1).map((c, i) => daysBetween(cycles[i].date, c.date));
      const g = median(gaps);
      const period: Period | null = g >= 6 && g <= 8 && cycles.length >= 3 ? 'weekly' : g >= 25 && g <= 35 ? 'monthly' : g >= 350 && g <= 380 ? 'yearly' : null;
      if (!period) continue;
      const amounts = cycles.map((c) => c.amount);
      const typical = median(amounts.slice(-3));
      const lastA = amounts[amounts.length - 1];
      const stable = amounts.slice(-3).every((a) => Math.abs(a - typical) <= Math.max(3, typical * 0.15));
      const loose = amounts.slice(-3).every((a) => Math.abs(a - typical) <= Math.max(5, typical * 0.4));
      if (!loose) continue;
      // abonnement arrêté : aucun passage depuis 2 périodes
      const stepDays = period === 'weekly' ? 7 : period === 'monthly' ? 30 : 365;
      if (daysBetween(cycles[cycles.length - 1].date, today) > stepDays * 2 + 5) continue;
      const monthly = period === 'weekly' ? (typical * 52) / 12 : period === 'yearly' ? typical / 12 : typical;
      out.push({ ...base, period, amount: round(lastA), monthly: round(monthly), count: cycles.length, next: nextDate(cycles[cycles.length - 1].date, period, g), status: stable ? 'confirmed' : 'probable' });
    } else {
      // un seul passage : abonnement probable si la catégorie l'indique ou si c'est un prélèvement
      const r = sorted[0];
      const isSub = r.cat === 'abonnements' || r.cat === 'telephone' || r.cat === 'credits' || r.cat === 'assu_auto' || /^(prlv|prelevement|ech pret|reglement)/.test(norm(r.tx.kind || ''));
      if (!isSub || daysBetween(r.tx.date, today) > 40) continue;
      out.push({ ...base, period: 'monthly', amount: round(-r.ref), monthly: round(-r.ref), count: 1, next: nextDate(r.tx.date, 'monthly', 30), status: 'probable' });
    }
  }
  return out.sort((a, b) => b.monthly - a.monthly);
}

const round = (v: number) => Math.round(v * 100) / 100;

/** Prochaine échéance : même jour le mois suivant pour un abonnement mensuel (31 → dernier jour du mois). */
function nextDate(last: string, period: Period, gap: number): string {
  if (period !== 'monthly') return addDays(last, Math.round(gap));
  const ym = addMonths(last.slice(0, 7), 1);
  return ym + '-' + String(Math.min(+last.slice(8, 10), daysInMonth(ym))).padStart(2, '0');
}
