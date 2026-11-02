// Revolut : relevé CSV ou Excel (« Relevé » dans l'app), en français ou en anglais.
// Colonnes : Type, Produit, Date de début, Date de fin, Description, Montant, Frais, Devise, État, Solde.
// Constats sur un vrai relevé : EUR et USD mélangés dans le même fichier (un compte par devise), les frais sont à part
// (solde = solde précédent + Montant − Frais), un abonnement Premium apparaît avec Montant 0 et Frais 12,30.
import type { AccountHint, Check, ParsedTx, ParseResult } from '../types';
import { findCol, norm, parseAmount, squash } from '../text';
import { money } from '../format';

const COLS = {
  type: ['Type'],
  product: ['Produit', 'Product'],
  started: ['Date de début', 'Started Date', 'Date de debut'],
  completed: ['Date de fin', 'Completed Date'],
  desc: ['Description'],
  amount: ['Montant', 'Amount'],
  fee: ['Frais', 'Fee'],
  currency: ['Devise', 'Currency'],
  state: ['État', 'State', 'Etat'],
  balance: ['Solde', 'Balance'],
};

const DONE = ['termine', 'completed'];
const PENDING = ['en attente', 'pending'];

export function isRevolut(header: string[]): boolean {
  return findCol(header, COLS.started) >= 0 && findCol(header, COLS.state) >= 0 && findCol(header, COLS.currency) >= 0 && findCol(header, COLS.amount) >= 0;
}

function hintFor(product: string, currency: string): AccountHint {
  const p = norm(product);
  const main = !p || p === 'valeur actuelle' || p === 'current' || p === 'courant';
  return { bank: 'revolut', currency, product: main ? undefined : product, name: 'Revolut ' + currency + (main ? '' : ' · ' + product) };
}

export function parseRevolut(rows: string[][]): ParseResult | null {
  const hi = rows.findIndex((r) => isRevolut(r));
  if (hi < 0) return null;
  const h = rows[hi];
  const c = Object.fromEntries(Object.entries(COLS).map(([k, a]) => [k, findCol(h, a)])) as Record<keyof typeof COLS, number>;
  const res: ParseResult = { format: 'Revolut (relevé)', txs: [], unrecognized: [], ignored: [], checks: [], holders: [] };
  const chains = new Map<string, { prev: number | null; breaks: string[]; last: number; cur: string; n: number }>();
  let min = '', max = '';
  for (const r of rows.slice(hi + 1)) {
    const get = (i: number) => (i >= 0 ? (r[i] ?? '').trim() : '');
    const desc = squash(get(c.desc));
    const date = get(c.started).slice(0, 10) || get(c.completed).slice(0, 10);
    const amount = parseAmount(get(c.amount));
    const fee = c.fee >= 0 ? parseAmount(get(c.fee)) || 0 : 0;
    const cur = get(c.currency).toUpperCase();
    const state = norm(get(c.state));
    const line = [date, desc, get(c.amount), cur].join(' · ');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(amount) || !/^[A-Z]{3}$/.test(cur)) {
      res.unrecognized.push(r.join(', '));
      continue;
    }
    if (PENDING.includes(state)) { res.ignored.push({ text: line, reason: 'en attente : sera importée une fois terminée' }); continue; }
    if (!DONE.includes(state)) { res.ignored.push({ text: line, reason: 'opération ' + (get(c.state).toLowerCase() || 'sans état') + ' (annulée ou refusée)' }); continue; }
    const account = hintFor(get(c.product), cur);
    const balance = c.balance >= 0 ? parseAmount(get(c.balance)) : NaN;
    // contrôle du solde ligne à ligne, compte par compte
    const key = account.name;
    let ch = chains.get(key);
    if (!ch) chains.set(key, (ch = { prev: null, breaks: [], last: 0, cur, n: 0 }));
    if (!isNaN(balance)) {
      if (ch.prev !== null && Math.abs(ch.prev + amount - fee - balance) > 0.005) ch.breaks.push(`${date} ${desc}`);
      ch.prev = balance; ch.last = balance;
    }
    ch.n++;
    const kind = squash(get(c.type));
    const base: Omit<ParsedTx, 'amount' | 'label'> = { account, date, currency: cur, kind, balance: isNaN(balance) ? undefined : balance };
    if (amount !== 0 || fee === 0) res.txs.push({ ...base, amount, label: desc, ...(fee ? { balance: undefined } : {}) });
    if (fee !== 0) res.txs.push({ ...base, amount: -fee, label: amount === 0 ? desc : 'Frais : ' + desc, kind: amount === 0 ? kind : 'Frais' });
    if (!min || date < min) min = date;
    if (!max || date > max) max = date;
  }
  for (const [name, ch] of chains) {
    const check: Check = ch.breaks.length
      ? { ok: false, text: `${name} : le solde ne se recalcule pas après ${ch.breaks.length} ligne(s) (première : ${ch.breaks[0]})` }
      : { ok: true, text: `${name} : solde recalculé ligne à ligne sans écart (${ch.n} lignes, solde final ${money(ch.last, ch.cur)})` };
    res.checks.push(check);
  }
  if (min) res.period = [min, max];
  return res;
}
