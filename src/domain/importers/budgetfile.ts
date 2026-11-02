// Fichier Excel « Budget » de l'utilisateur (onglets Prévisionnel, Journal, Frais arrivée…).
// - Prévisionnel → enveloppes mensuelles par catégorie, revenus prévus et objectifs d'épargne (revenus − dépenses prévus) ;
// - Journal → opérations saisies à la main (compte « Saisie manuelle »), avec leur catégorie.
import type { AccountHint, Plan, ParseResult } from '../types';
import { catFromLabel } from '../categories';
import { money } from '../format';
import { monthNumber, norm, parseAmount, parseDate, squash } from '../text';

export interface Sheet { name: string; rows: string[][] }

const MANUAL: AccountHint = { bank: 'manual', currency: 'USD', name: 'Saisie manuelle' };

/** « Sept. 2026 » → '2026-09' */
function monthOf(label: string): string {
  const m = /([A-Za-zéûÉ]+)\.?\s+(\d{4})/.exec(label);
  if (!m || !monthNumber(m[1])) return '';
  return m[2] + '-' + String(monthNumber(m[1])).padStart(2, '0');
}

export function isBudgetWorkbook(sheets: Sheet[]): boolean {
  return sheets.some((s) => /pr[ée]visionnel/i.test(s.name)) || sheets.some((s) => /journal/i.test(s.name) && s.rows.some((r) => norm(r[1] || '') === 'categorie' && norm(r[0] || '') === 'date'));
}

export function parseBudgetWorkbook(sheets: Sheet[]): ParseResult | null {
  if (!isBudgetWorkbook(sheets)) return null;
  const res: ParseResult = { format: 'Fichier Budget (Excel)', txs: [], unrecognized: [], ignored: [], checks: [], holders: [], notes: [] };
  // devise : « (montants en $ …) » dans le titre du prévisionnel, « Montant ($) » dans le journal
  const all = sheets.map((s) => s.rows.slice(0, 4).map((r) => r.join(' ')).join(' ')).join(' ');
  const currency = /€|eur/i.test(all) && !/\$/.test(all) ? 'EUR' : 'USD';

  // ---------------------------------------------------------------- Prévisionnel
  const prev = sheets.find((s) => /pr[ée]visionnel/i.test(s.name));
  if (prev) {
    const hi = prev.rows.findIndex((r) => norm(r[0] || '') === 'categorie' && r.slice(1).some((c) => monthOf(c)));
    if (hi >= 0) {
      const cols = prev.rows[hi].map((c, i) => [i, monthOf(c)] as const).filter(([i, m]) => i > 0 && m);
      const plan: Partial<Plan> = { currency, envelopes: {}, envelopesByMonth: {}, goalsByMonth: {}, incomeByMonth: {} };
      const expByMonth: Record<string, number> = {};
      let section: 'income' | 'expense' | '' = '';
      for (const r of prev.rows.slice(hi + 1)) {
        const label = squash(r[0] || '');
        const n = norm(label);
        if (!label) continue;
        if (n === 'revenus') { section = 'income'; continue; }
        if (n === 'depenses') { section = 'expense'; continue; }
        if (/^(total|solde)/.test(n) || !section) continue;
        const vals = cols.map(([i, m]) => [m, parseAmount(r[i] || '')] as const).filter(([, v]) => !isNaN(v));
        if (!vals.length) continue;
        if (section === 'income') {
          for (const [m, v] of vals) plan.incomeByMonth![m] = (plan.incomeByMonth![m] || 0) + v;
          continue;
        }
        let cat = catFromLabel(label);
        if (!cat) { cat = 'divers'; res.notes!.push(`Catégorie « ${label} » inconnue : budget ajouté à « Divers »`); }
        for (const [m, v] of vals) expByMonth[m] = (expByMonth[m] || 0) + v;
        const same = vals.every(([, v]) => v === vals[0][1]);
        if (same) plan.envelopes![cat] = (plan.envelopes![cat] || 0) + vals[0][1];
        else for (const [m, v] of vals) { (plan.envelopesByMonth![m] ||= {})[cat] = ((plan.envelopesByMonth![m] || {})[cat] || 0) + v; }
      }
      const goals: number[] = [];
      for (const [, m] of cols) {
        if (plan.incomeByMonth![m] === undefined) continue;
        const g = Math.round(plan.incomeByMonth![m] - (expByMonth[m] || 0));
        plan.goalsByMonth![m] = Math.max(0, g);
        goals.push(Math.max(0, g));
      }
      if (goals.length) plan.goal = Math.round(goals.reduce((a, b) => a + b, 0) / goals.length);
      res.plan = plan;
      const nEnv = Object.keys(plan.envelopes!).length + new Set(Object.values(plan.envelopesByMonth!).flatMap((x) => Object.keys(x))).size;
      res.checks.push({ ok: true, text: `Prévisionnel : ${nEnv} enveloppes mensuelles, revenus prévus sur ${Object.keys(plan.incomeByMonth!).length} mois` });
      if (goals.length) res.checks.push({ ok: true, text: `Objectifs d'épargne pré-remplis (revenus − dépenses prévus) : ${cols.filter(([, m]) => plan.goalsByMonth![m] !== undefined).map(([, m]) => money(plan.goalsByMonth![m], currency, 0)).join(' · ')}` });
    }
  }

  // ---------------------------------------------------------------- Journal
  const jr = sheets.find((s) => /journal/i.test(s.name));
  if (jr) {
    const hi = jr.rows.findIndex((r) => norm(r[0] || '') === 'date' && norm(r[1] || '') === 'categorie');
    if (hi >= 0) {
      const h = jr.rows[hi].map(norm);
      const cd = h.indexOf('description'), ca = h.findIndex((x) => x.startsWith('montant'));
      for (const r of jr.rows.slice(hi + 1)) {
        if (!r[0] && !r[1] && !r[ca]) continue;
        const date = parseDate(r[0] || '');
        const v = parseAmount(r[ca] || '');
        const catLabel = squash(r[1] || '');
        if (!date || isNaN(v) || !catLabel) { if (r[0] || r[ca]) res.unrecognized.push(r.slice(0, 4).join(' · ')); continue; }
        const income = /^revenu/i.test(catLabel);
        const cat = catFromLabel(catLabel) || (income ? 'autres_rev' : 'divers');
        res.txs.push({ account: MANUAL, date, amount: income ? Math.abs(v) : -Math.abs(v), currency, label: squash(r[cd] || catLabel), cat, kind: 'Saisie' });
      }
      if (res.txs.length) {
        const ds = res.txs.map((t) => t.date).sort();
        res.period = [ds[0], ds[ds.length - 1]];
        res.notes!.push(`Journal : ${res.txs.length} opération(s) saisie(s) à la main, rangées dans le compte « Saisie manuelle ». Si elles figurent aussi sur un relevé importé, elles compteront deux fois : supprime-les alors de l'app.`);
      }
    }
  }
  const fa = sheets.find((s) => /frais arriv/i.test(s.name));
  if (fa) res.notes!.push("Onglet « Frais arrivée » non importé : c'est un budget ponctuel, pas mensuel. Ces dépenses apparaîtront dans tes relevés.");
  if (!res.plan && !res.txs.length) return null;
  return res;
}
