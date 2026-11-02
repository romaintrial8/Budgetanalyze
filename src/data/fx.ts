// Taux de change BCE (via Frankfurter : gratuit, sans clé) pour convertir chaque opération dans la devise de référence.
// Les taux sont stockés dans les données (valeur en USD d'une unité), complétés au besoin à l'ouverture et après un import.
import { getData, update } from './store';

const HOSTS = ['https://api.frankfurter.dev/v1', 'https://api.frankfurter.app'];

function needed(): Map<string, { min: string; max: string }> {
  const d = getData();
  const m = new Map<string, { min: string; max: string }>();
  const today = new Date().toISOString().slice(0, 10);
  const add = (cur: string, day: string) => {
    if (cur === 'USD' || !/^[A-Z]{3}$/.test(cur)) return;
    const e = m.get(cur);
    if (!e) m.set(cur, { min: day, max: day });
    else { if (day < e.min) e.min = day; if (day > e.max) e.max = day; }
  };
  for (const t of d.txs) add(t.currency, t.date);
  // devise de référence et devise du plan : taux du jour nécessaires même sans opération
  add(d.settings.refCurrency, today);
  add(d.plan.currency, today);
  add('EUR', today);
  return m;
}

let running = false;
/** Charge les taux manquants. Renvoie le nombre de devises mises à jour (0 hors ligne). */
export async function ensureFx(): Promise<number> {
  if (running) return 0;
  running = true;
  let n = 0;
  try {
    const d = getData();
    for (const [cur, r] of needed()) {
      const have = d.fx[cur] || {};
      const days = Object.keys(have).sort();
      const today = new Date().toISOString().slice(0, 10);
      // déjà couvert : premier taux ≤ première opération et dernier taux de moins de 3 jours
      const covered = days.length && days[0] <= r.min && days[days.length - 1] >= (r.max < today ? r.max : new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10));
      if (covered) continue;
      const from = new Date(Date.parse(r.min) - 7 * 864e5).toISOString().slice(0, 10);
      for (const host of HOSTS) {
        try {
          const ctl = new AbortController();
          const timer = setTimeout(() => ctl.abort(), 15000);
          const res = await fetch(`${host}/${from}..?base=${cur}&symbols=USD`, { signal: ctl.signal });
          clearTimeout(timer);
          if (!res.ok) continue;
          const j = (await res.json()) as { rates?: Record<string, { USD?: number }> };
          const rates: Record<string, number> = {};
          for (const [day, v] of Object.entries(j.rates || {})) if (v.USD) rates[day] = v.USD;
          if (Object.keys(rates).length) {
            update((x) => { x.fx[cur] = { ...(x.fx[cur] || {}), ...rates }; }, { touch: false });
            n++;
            break;
          }
        } catch { /* hôte suivant */ }
      }
    }
  } finally {
    running = false;
  }
  return n;
}
