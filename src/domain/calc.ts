// Calculs du budget : conversion de devises, virements internes, catégorie effective, totaux mensuels.
// Tout est recalculé depuis les faits stockés ; aucune date « d'aujourd'hui » cachée (elle est passée en paramètre).
import type { AppData, CatKind, Tx } from './types';
import { CAT_BY_ID, categorize, defaultCat, ruleText, UNCAT, type CatSource } from './categories';
import { daysBetween } from './format';
import { norm } from './text';

// ------------------------------------------------------------------ devises
export type FxTable = Record<string, Record<string, number>>; // devise → date → valeur en USD de 1 unité

/** Valeur en USD d'une unité de `cur` au jour `date` : taux du jour, sinon le plus proche (≤ 10 jours avant), sinon le plus récent connu. */
export function usdPer(fx: FxTable, cur: string, date: string, fallbackEurUsd: number): { rate: number; estimated: boolean } {
  if (cur === 'USD') return { rate: 1, estimated: false };
  const t = fx[cur];
  if (t) {
    if (t[date]) return { rate: t[date], estimated: false };
    const days = Object.keys(t).sort();
    if (days.length) {
      // dernier jour connu ≤ date
      let lo = 0, hi = days.length - 1, best = -1;
      while (lo <= hi) { const mid = (lo + hi) >> 1; if (days[mid] <= date) { best = mid; lo = mid + 1; } else hi = mid - 1; }
      if (best >= 0 && daysBetween(days[best], date) <= 10) return { rate: t[days[best]], estimated: false };
      const near = best >= 0 ? days[best] : days[0];
      return { rate: t[near], estimated: true };
    }
  }
  if (cur === 'EUR') return { rate: fallbackEurUsd, estimated: true };
  return { rate: 1, estimated: true };
}

export function convert(amount: number, from: string, to: string, date: string, fx: FxTable, fallbackEurUsd: number): { value: number; estimated: boolean } {
  if (from === to) return { value: amount, estimated: false };
  const a = usdPer(fx, from, date, fallbackEurUsd), b = usdPer(fx, to, date, fallbackEurUsd);
  return { value: (amount * a.rate) / b.rate, estimated: a.estimated || b.estimated };
}

/**
 * Taux implicites tirés des opérations de change Revolut (« Change en USD » : −1 000 € et +1 115,10 $ au même instant).
 * Servent de secours tant que les taux BCE ne sont pas chargés (hors ligne).
 */
export function impliedRates(txs: Tx[]): FxTable {
  const out: FxTable = {};
  const changes = txs.filter((t) => /^change en (usd|eur)$/.test(norm(t.label)) && t.accountId.startsWith('revolut'));
  const byDay = new Map<string, Tx[]>();
  for (const t of changes) { const k = t.date + '|' + norm(t.label); byDay.set(k, [...(byDay.get(k) || []), t]); }
  for (const [k, list] of byDay) {
    const eur = list.filter((t) => t.currency === 'EUR'), usd = list.filter((t) => t.currency === 'USD');
    const se = eur.reduce((s, t) => s + t.amount, 0), su = usd.reduce((s, t) => s + t.amount, 0);
    if (eur.length && usd.length && se * su < 0 && Math.abs(se) > 1) (out.EUR ||= {})[k.slice(0, 10)] = Math.round((Math.abs(su) / Math.abs(se)) * 1e5) / 1e5;
  }
  return out;
}

/** Table utilisée par les calculs : taux BCE prioritaires, taux implicites Revolut en complément. */
export function fxTable(data: Pick<AppData, 'fx' | 'txs'>): FxTable {
  const imp = impliedRates(data.txs);
  const out: FxTable = {};
  for (const cur of new Set([...Object.keys(imp), ...Object.keys(data.fx)])) out[cur] = { ...(imp[cur] || {}), ...(data.fx[cur] || {}) };
  return out;
}

// ------------------------------------------------------------------ virements entre comptes
const TRANSFERISH = /virement|transfer|vir |zelle|ajout de fonds|top-up|top up|paiement envoye|wire|ach |deposit|depot|versement|web /;

/**
 * Deux opérations de sens opposé, même devise, même montant, comptes différents, à 5 jours d'écart au plus :
 * ce sont les deux moitiés d'un virement interne (sinon on compterait une dépense et un revenu fictifs).
 * Seules les opérations qui ressemblent à un virement sont candidates (jamais un achat par carte).
 */
export function pairTransfers(txs: Tx[]): Map<string, string> {
  const pairs = new Map<string, string>();
  const eligible = (t: Tx) => {
    if (t.cat) return false;
    const text = ruleText(t);
    if (/carte|card/.test(norm(t.kind || ''))) return false;
    const d = defaultCat(text, t.amount);
    if (d && d !== 'interne' && d !== 'rembours') return false;
    return TRANSFERISH.test(text + ' ') || !d;
  };
  const outs = txs.filter((t) => t.amount < 0 && eligible(t)).sort((a, b) => a.date.localeCompare(b.date));
  const ins = txs.filter((t) => t.amount > 0 && eligible(t));
  const byKey = new Map<string, Tx[]>();
  for (const t of ins) { const k = t.currency + '|' + Math.round(t.amount * 100); byKey.set(k, [...(byKey.get(k) || []), t]); }
  for (const o of outs) {
    const cands = (byKey.get(o.currency + '|' + Math.round(-o.amount * 100)) || []).filter((i) => i.accountId !== o.accountId && !pairs.has(i.id) && Math.abs(daysBetween(o.date, i.date)) <= 5);
    if (!cands.length) continue;
    cands.sort((a, b) => Math.abs(daysBetween(o.date, a.date)) - Math.abs(daysBetween(o.date, b.date)));
    pairs.set(o.id, cands[0].id);
    pairs.set(cands[0].id, o.id);
  }
  return pairs;
}

// ------------------------------------------------------------------ opérations enrichies
export interface Row {
  tx: Tx;
  cat: string;
  source: CatSource;
  kind: CatKind | 'uncat';
  ref: number; // montant converti dans la devise de référence (signé)
  estimated: boolean; // taux de change estimé
  pairedWith?: string;
}

export interface Ledger {
  rows: Row[]; // triées de la plus récente à la plus ancienne
  ref: string;
  fx: FxTable;
  pairs: Map<string, string>;
}

export function buildLedger(data: AppData): Ledger {
  const fx = fxTable(data);
  const ref = data.settings.refCurrency;
  const pairs = pairTransfers(data.txs);
  const paired = new Set(pairs.keys());
  const rows: Row[] = data.txs.map((tx) => {
    const { cat, source } = categorize(tx, data.rules, data.settings.ownNames, paired);
    const c = CAT_BY_ID[cat];
    const conv = convert(tx.amount, tx.currency, ref, tx.date, fx, data.settings.fallbackEurUsd);
    return { tx, cat, source, kind: cat === UNCAT || !c ? 'uncat' : c.kind, ref: conv.value, estimated: conv.estimated, pairedWith: pairs.get(tx.id) };
  });
  rows.sort((a, b) => b.tx.date.localeCompare(a.tx.date) || Math.abs(b.tx.amount) - Math.abs(a.tx.amount));
  return { rows, ref, fx, pairs };
}

// ------------------------------------------------------------------ totaux mensuels
export interface MonthStats {
  ym: string;
  income: number; // revenus (catégories de revenus + entrées non classées)
  expenses: number; // dépenses nettes des remboursements (+ sorties non classées)
  invested: number; // argent placé (crypto, PEA…) : ni dépense ni revenu
  savings: number; // revenus − dépenses
  byCat: Record<string, number>; // dépense nette par catégorie (positif = dépensé) ; revenus en positif
  uncatOut: number; // sorties « À classer »
  uncatIn: number; // entrées « À classer »
  uncatCount: number;
  count: number;
  estimated: boolean;
}

export function emptyMonth(ym: string): MonthStats {
  return { ym, income: 0, expenses: 0, invested: 0, savings: 0, byCat: {}, uncatOut: 0, uncatIn: 0, uncatCount: 0, count: 0, estimated: false };
}

export function monthStats(rows: Row[]): Map<string, MonthStats> {
  const out = new Map<string, MonthStats>();
  for (const r of rows) {
    const ym = r.tx.date.slice(0, 7);
    let m = out.get(ym);
    if (!m) out.set(ym, (m = emptyMonth(ym)));
    m.count++;
    if (r.estimated) m.estimated = true;
    switch (r.kind) {
      case 'expense': m.expenses -= r.ref; m.byCat[r.cat] = (m.byCat[r.cat] || 0) - r.ref; break;
      case 'income': m.income += r.ref; m.byCat[r.cat] = (m.byCat[r.cat] || 0) + r.ref; break;
      case 'invest': m.invested -= r.ref; break;
      case 'transfer': break;
      case 'uncat':
        m.uncatCount++;
        if (r.ref < 0) { m.uncatOut -= r.ref; m.expenses -= r.ref; m.byCat[UNCAT] = (m.byCat[UNCAT] || 0) - r.ref; }
        else { m.uncatIn += r.ref; m.income += r.ref; }
        break;
    }
  }
  for (const m of out.values()) {
    m.income = round2(m.income); m.expenses = round2(m.expenses); m.invested = round2(m.invested);
    m.savings = round2(m.income - m.expenses);
    for (const k of Object.keys(m.byCat)) m.byCat[k] = round2(m.byCat[k]);
  }
  return out;
}

export const round2 = (v: number) => Math.round(v * 100) / 100;

// ------------------------------------------------------------------ budgets et objectifs (convertis dans la devise de référence)
export function planValue(data: AppData, v: number, fx: FxTable, date: string): number {
  return convert(v, data.plan.currency, data.settings.refCurrency, date, fx, data.settings.fallbackEurUsd).value;
}

/** Premier mois couvert par un budget daté (fichier Excel, objectif d'un mois) : avant, pas d'objectif par défaut. */
export function planStart(plan: AppData['plan']): string | null {
  const keys = [...Object.keys(plan.goalsByMonth), ...Object.keys(plan.envelopesByMonth), ...Object.keys(plan.incomeByMonth)].sort();
  return keys[0] || null;
}

export function goalFor(data: AppData, ym: string, fx: FxTable): number {
  const start = planStart(data.plan);
  const v = data.plan.goalsByMonth[ym] ?? (start && ym < start ? 0 : data.plan.goal);
  return planValue(data, v || 0, fx, ym + '-15');
}

export function envelopesFor(data: AppData, ym: string, fx: FxTable): Record<string, number> {
  const out: Record<string, number> = {};
  const start = planStart(data.plan);
  if (start && ym < start && !data.plan.envelopesByMonth[ym]) return out;
  const merged = { ...data.plan.envelopes, ...(data.plan.envelopesByMonth[ym] || {}) };
  for (const [k, v] of Object.entries(merged)) if (v > 0) out[k] = planValue(data, v, fx, ym + '-15');
  return out;
}

export function plannedIncome(data: AppData, ym: string, fx: FxTable): number | null {
  const v = data.plan.incomeByMonth[ym];
  return v === undefined ? null : planValue(data, v, fx, ym + '-15');
}

/** Mois couverts par les données (du plus ancien au plus récent), complétés jusqu'au mois courant. */
export function monthRange(rows: Row[], today: string): string[] {
  if (!rows.length) return [today.slice(0, 7)];
  let first = rows[rows.length - 1].tx.date.slice(0, 7);
  const last = [rows[0].tx.date.slice(0, 7), today.slice(0, 7)].sort()[1];
  const out: string[] = [];
  while (first <= last && out.length < 240) {
    out.push(first);
    let y = +first.slice(0, 4), mo = +first.slice(5, 7) + 1;
    if (mo > 12) { mo = 1; y++; }
    first = y + '-' + String(mo).padStart(2, '0');
  }
  return out;
}

/** Solde connu de chaque compte : dernier solde imprimé sur un relevé + opérations postérieures. */
export function accountBalances(data: AppData): Record<string, { balance: number | null; date: string; count: number }> {
  const out: Record<string, { balance: number | null; date: string; count: number }> = {};
  for (const a of data.accounts) {
    const txs = data.txs.filter((t) => t.accountId === a.id);
    const withBal = txs.filter((t) => t.balance !== undefined);
    let balance: number | null = null, date = txs.map((t) => t.date).sort().slice(-1)[0] || '';
    if (withBal.length) {
      // dernière opération dotée d'un solde (ordre du fichier conservé pour un même jour)
      const lastB = withBal.reduce((best, t) => (t.date >= best.date ? t : best), withBal[0]);
      const after = txs.filter((t) => t.date > lastB.date);
      balance = round2(lastB.balance! + after.reduce((s, t) => s + t.amount, 0));
      date = [lastB.date, ...after.map((t) => t.date)].sort().slice(-1)[0];
    }
    out[a.id] = { balance, date, count: txs.length };
  }
  return out;
}
