// Actions de l'utilisateur sur les données (toutes passent par store.update, donc persistées et synchronisées).
import type { AppData, ImportRecord, ParseResult, Plan, Rule, Tx } from '../domain/types';
import { planImport, mergeOwnNames } from '../domain/ledger';
import { getData, newId, replaceData, update } from './store';
import { showToast } from '../ui/kit';
import { ensureFx } from './fx';
import { norm } from '../domain/text';

/** Garde une copie avant une action destructrice : « Annuler » dans le toast la restaure. */
let lastUndo: (() => void) | null = null;
function withUndo(text: string, fn: () => void): void {
  const before = structuredClone(getData());
  fn();
  lastUndo = () => replaceData(before);
  if (text) showToast(text, { undo: lastUndo });
}

export interface ImportItem { file: string; results: ParseResult[]; withPlan: boolean; withTxs: boolean }

/** Ajoute en une fois plusieurs fichiers (une seule annulation possible pour l'ensemble). */
export function commitImports(items: ImportItem[], accountOverride: Record<string, string>): { added: number; duplicates: number } {
  let added = 0, duplicates = 0;
  withUndo('', () => {
    for (const it of items) {
      const id = newId('imp');
      const d = getData();
      const usable = it.results.map((r) => ({ ...r, txs: it.withTxs ? r.txs : [] }));
      const plan = planImport(d, usable, id, accountOverride);
      added += plan.txs.length; duplicates += plan.duplicates;
      const rec: ImportRecord = {
        id, at: new Date().toISOString(), file: it.file, format: it.results.map((r) => r.format).join(' + '),
        accountIds: Object.keys(plan.byAccount), added: plan.txs.length, skipped: plan.duplicates,
        period: it.results[0]?.period, check: it.results.flatMap((r) => r.checks).every((c) => c.ok) ? 'ok' : 'écart',
      };
      update((x) => {
        x.accounts.push(...plan.accounts);
        x.txs.push(...plan.txs);
        x.imports.unshift(rec);
        x.settings.ownNames = mergeOwnNames(x.settings.ownNames, it.results.flatMap((r) => r.holders));
        if (it.withPlan) for (const r of it.results) if (r.plan) mergePlan(x, r.plan);
      });
    }
  });
  showToast(`${added} opération${added > 1 ? 's' : ''} importée${added > 1 ? 's' : ''}${duplicates ? ` · ${duplicates} doublon${duplicates > 1 ? 's' : ''} ignoré${duplicates > 1 ? 's' : ''}` : ''}`, { undo: lastUndo || undefined });
  setTimeout(() => void ensureFx(), 300);
  return { added, duplicates };
}

function mergePlan(x: AppData, p: Partial<Plan>): void {
  if (p.currency && !Object.keys(x.plan.envelopes).length && !x.plan.goal) x.plan.currency = p.currency;
  const same = !p.currency || p.currency === x.plan.currency;
  if (!same) return; // budget dans une autre devise que le plan actuel : on ne mélange pas
  Object.assign(x.plan.envelopes, p.envelopes || {});
  for (const [m, v] of Object.entries(p.envelopesByMonth || {})) x.plan.envelopesByMonth[m] = { ...(x.plan.envelopesByMonth[m] || {}), ...v };
  Object.assign(x.plan.goalsByMonth, p.goalsByMonth || {});
  Object.assign(x.plan.incomeByMonth, p.incomeByMonth || {});
  if (p.goal !== undefined && !x.plan.goal) x.plan.goal = p.goal;
}

/**
 * Change la catégorie d'une opération. Avec `pattern`, crée (ou remplace) une règle : toutes les opérations
 * dont le libellé contient ce texte prennent cette catégorie, y compris celles des prochains imports.
 */
export function setCategory(t: Tx, cat: string, pattern?: string, sign?: 'in' | 'out'): void {
  update((x) => {
    const tx = x.txs.find((y) => y.id === t.id);
    if (!tx) return;
    if (pattern && norm(pattern)) {
      const p = norm(pattern);
      x.rules = x.rules.filter((r) => !(r.pattern === p && (r.sign || '') === (sign || '')));
      const rule: Rule = { id: newId('rule'), pattern: p, cat, created: new Date().toISOString(), ...(sign ? { sign } : {}) };
      x.rules.push(rule);
      delete tx.cat; // la règle suffit
      // les choix manuels précédents sur ce même libellé cèdent la place à la règle
    } else tx.cat = cat;
  });
}

export function clearCategory(t: Tx): void {
  update((x) => { const tx = x.txs.find((y) => y.id === t.id); if (tx) delete tx.cat; });
}

export function setNote(t: Tx, note: string): void {
  update((x) => { const tx = x.txs.find((y) => y.id === t.id); if (tx) { if (note.trim()) tx.note = note.trim(); else delete tx.note; } });
}

export function deleteTx(t: Tx): void {
  withUndo('Opération supprimée', () => update((x) => { x.txs = x.txs.filter((y) => y.id !== t.id); }));
}

export function addManualTx(p: { date: string; amount: number; currency: string; label: string; cat: string; accountId?: string }): void {
  update((x) => {
    let accountId = p.accountId;
    if (!accountId) {
      accountId = 'manual-' + p.currency;
      if (!x.accounts.some((a) => a.id === accountId)) x.accounts.push({ id: accountId, bank: 'manual', name: 'Saisie manuelle' + (p.currency !== 'USD' ? ' ' + p.currency : ''), currency: p.currency });
    }
    const id = newId('man');
    x.txs.push({ id, fp: id, accountId, date: p.date, amount: p.amount, currency: p.currency, label: p.label, cat: p.cat, source: 'manual', kind: 'Saisie' });
  });
  showToast('Opération ajoutée');
}

export function deleteRule(r: Rule): void {
  withUndo('Règle supprimée', () => update((x) => { x.rules = x.rules.filter((y) => y.id !== r.id); }));
}

export function deleteImport(id: string): void {
  withUndo('Import supprimé avec ses opérations', () => update((x) => {
    x.txs = x.txs.filter((t) => t.source !== id);
    x.imports = x.imports.filter((i) => i.id !== id);
    const used = new Set(x.txs.map((t) => t.accountId));
    x.accounts = x.accounts.filter((a) => used.has(a.id));
  }));
}

export function renameAccount(id: string, name: string): void {
  update((x) => { const a = x.accounts.find((y) => y.id === id); if (a && name.trim()) a.name = name.trim(); });
}

export function setPlan(fn: (p: Plan) => void): void {
  update((x) => fn(x.plan));
}

export function setSettings(fn: (s: AppData['settings']) => void): void {
  update((x) => fn(x.settings));
  if (getData().settings.refCurrency !== 'USD') setTimeout(() => void ensureFx(), 100);
}

/** Change la devise des budgets et objectifs en convertissant les montants au taux du jour (arrondis). */
export function convertPlan(to: string, rate: number): void {
  update((x) => {
    if (x.plan.currency === to) return;
    const k = rate;
    const r = (v: number) => Math.round(v * k);
    for (const c of Object.keys(x.plan.envelopes)) x.plan.envelopes[c] = r(x.plan.envelopes[c]);
    for (const m of Object.keys(x.plan.envelopesByMonth)) for (const c of Object.keys(x.plan.envelopesByMonth[m])) x.plan.envelopesByMonth[m][c] = r(x.plan.envelopesByMonth[m][c]);
    for (const m of Object.keys(x.plan.goalsByMonth)) x.plan.goalsByMonth[m] = r(x.plan.goalsByMonth[m]);
    for (const m of Object.keys(x.plan.incomeByMonth)) x.plan.incomeByMonth[m] = r(x.plan.incomeByMonth[m]);
    x.plan.goal = r(x.plan.goal);
    x.plan.currency = to;
  });
}

export function resetAll(): void {
  withUndo('Toutes les données ont été effacées', () => update((x) => {
    x.accounts = []; x.txs = []; x.rules = []; x.imports = [];
    x.plan = { currency: x.settings.refCurrency, envelopes: {}, envelopesByMonth: {}, goal: 0, goalsByMonth: {}, incomeByMonth: {} };
  }));
}
