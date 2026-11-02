// Calculs partagés par les écrans, refaits seulement quand les données changent.
import { useMemo } from 'react';
import { useData } from '../data/store';
import { buildLedger, emptyMonth, envelopesFor, goalFor, monthRange, monthStats, plannedIncome, type Ledger, type MonthStats } from '../domain/calc';
import { detectSubscriptions, type Subscription } from '../domain/recurring';
import { todayIso } from '../domain/format';
import type { AppData } from '../domain/types';

export interface Budget {
  data: AppData;
  ledger: Ledger;
  ref: string;
  today: string;
  months: string[]; // mois couverts, du plus ancien au plus récent
  stats: Map<string, MonthStats>;
  month: (ym: string) => MonthStats;
  goal: (ym: string) => number;
  envelopes: (ym: string) => Record<string, number>;
  income: (ym: string) => number | null;
  subs: Subscription[];
}

export function useBudget(): Budget {
  const data = useData();
  return useMemo(() => {
    const today = todayIso();
    const ledger = buildLedger(data);
    const stats = monthStats(ledger.rows);
    const months = monthRange(ledger.rows, today);
    const subs = detectSubscriptions(ledger.rows, today).filter((s) => !data.settings.subsIgnored.includes(s.key));
    return {
      data, ledger, ref: ledger.ref, today, months, stats,
      month: (ym) => stats.get(ym) || emptyMonth(ym),
      goal: (ym) => goalFor(data, ym, ledger.fx),
      envelopes: (ym) => envelopesFor(data, ym, ledger.fx),
      income: (ym) => plannedIncome(data, ym, ledger.fx),
      subs,
    };
  }, [data]);
}
