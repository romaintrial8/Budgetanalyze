// Export CSV relisible par l'import (aller-retour testé) et sauvegarde JSON complète.
import type { AppData } from './types';
import { buildLedger } from './calc';
import { catOf } from './categories';
import { EXPORT_HEADER } from './importers/others';

const q = (s: string) => (/[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s);

export function exportCsv(data: AppData): string {
  const led = buildLedger(data);
  const acc = Object.fromEntries(data.accounts.map((a) => [a.id, a]));
  const lines = [EXPORT_HEADER.join(',')];
  for (const r of [...led.rows].reverse()) {
    const t = r.tx;
    const a = acc[t.accountId];
    lines.push([t.date, a?.name || t.accountId, t.label, t.amount.toFixed(2), t.currency, t.cat ? catOf(t.cat).label : '', t.note || '', t.raw || '', a?.bank || 'other', catOf(r.cat).label, r.ref.toFixed(2) + ' ' + led.ref].map((x) => q(String(x))).join(','));
  }
  return lines.join('\n') + '\n';
}

export function exportJson(data: AppData): string {
  return JSON.stringify({ app: 'BudgetAnalyze', ...data, fx: {} }, null, 1);
}
