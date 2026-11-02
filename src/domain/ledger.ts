// Fusion d'un import dans les données : rattachement aux comptes, empreintes, dédoublonnage.
// Fonction pure : l'écran d'import affiche ce plan (nouvelles opérations, doublons) avant toute écriture.
import type { Account, AccountHint, AppData, ParseResult, Tx } from './types';
import { norm } from './text';

/** Identifiant stable d'un compte d'après ce que le relevé en dit. */
export function accountIdFor(h: AccountHint): string {
  const slug = (s: string) => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (h.bank === 'manual') return 'manual-' + h.currency;
  if (h.bank === 'revolut') return 'revolut-' + (h.product ? slug(h.product) + '-' : '') + h.currency;
  if (h.number) return h.bank + '-' + h.number;
  if (h.bank === 'other') return 'other-' + slug(h.name) + '-' + h.currency;
  return h.bank + (h.product ? '-' + slug(h.product) : '') + '-' + h.currency;
}

/**
 * Compte existant correspondant à un indice de relevé, sinon nouveau compte.
 * Un fichier sans numéro de compte (CSV Bank of America) va sur l'unique compte de la même banque et devise s'il existe.
 */
export function resolveAccount(h: AccountHint, accounts: Account[]): Account {
  const id = accountIdFor(h);
  const exact = accounts.find((a) => a.id === id);
  if (exact) return exact;
  if (h.number) {
    const byNum = accounts.find((a) => a.bank === h.bank && a.number === h.number);
    if (byNum) return byNum;
  } else if (h.bank !== 'other' && h.bank !== 'manual') {
    const same = accounts.filter((a) => a.bank === h.bank && a.currency === h.currency);
    const prod = same.filter((a) => (h.product ? norm(a.name).includes(norm(h.product)) : !/carte de credit/.test(norm(a.name))));
    if (prod.length === 1) return prod[0];
  } else {
    const byName = accounts.find((a) => norm(a.name) === norm(h.name) && a.currency === h.currency);
    if (byName) return byName;
  }
  return { id, bank: h.bank, name: h.name, currency: h.currency, number: h.number };
}

const cents = (v: number) => Math.round(v * 100);

export interface ImportPlan {
  accounts: Account[]; // comptes à créer
  txs: Tx[]; // nouvelles opérations
  duplicates: number;
  byAccount: Record<string, { added: number; duplicates: number }>;
}

/**
 * Empreinte = compte + date + montant + rang d'occurrence (#1, #2…) parmi les lignes identiques du même fichier.
 * Le libellé n'en fait pas partie : un même relevé importé en PDF puis en CSV n'est pas compté deux fois.
 */
export function planImport(data: Pick<AppData, 'accounts' | 'txs'>, results: ParseResult[], source: string, accountOverride: Record<string, string> = {}): ImportPlan {
  const accounts = [...data.accounts];
  const created: Account[] = [];
  const existing = new Set(data.txs.map((t) => t.fp));
  const plan: ImportPlan = { accounts: created, txs: [], duplicates: 0, byAccount: {} };
  const seen = new Map<string, number>();
  for (const r of results) {
    for (const p of r.txs) {
      const hintId = accountIdFor(p.account);
      let acc: Account;
      const forced = accountOverride[hintId] && accounts.find((a) => a.id === accountOverride[hintId]);
      if (forced) acc = forced;
      else {
        acc = resolveAccount(p.account, accounts);
        if (!accounts.some((a) => a.id === acc.id)) { accounts.push(acc); created.push(acc); }
      }
      const key = acc.id + '|' + p.date + '|' + cents(p.amount);
      const rank = (seen.get(key) || 0) + 1;
      seen.set(key, rank);
      const fp = key + '|' + rank;
      const st = (plan.byAccount[acc.id] ||= { added: 0, duplicates: 0 });
      if (existing.has(fp)) { plan.duplicates++; st.duplicates++; continue; }
      existing.add(fp);
      st.added++;
      plan.txs.push({
        id: fp, fp, accountId: acc.id, date: p.date, amount: p.amount, currency: p.currency, label: p.label,
        ...(p.raw && p.raw !== p.label ? { raw: p.raw } : {}),
        ...(p.detail ? { detail: p.detail } : {}),
        ...(p.orig ? { orig: p.orig } : {}),
        ...(p.balance !== undefined ? { balance: p.balance } : {}),
        ...(p.kind ? { kind: p.kind } : {}),
        ...(p.cat ? { cat: p.cat } : {}),
        ...(p.note ? { note: p.note } : {}),
        source,
      });
    }
  }
  return plan;
}

/** Titulaires lus sur les relevés → noms propres utilisés pour reconnaître les virements à soi-même (prénom + nom). */
export function mergeOwnNames(current: string[], holders: string[]): string[] {
  const out = [...current];
  for (const h of holders) {
    const parts = norm(h).split(' ').filter((p) => p.length >= 2);
    if (parts.length < 2) continue;
    // « jean pierre dupont » → prénom + nom : on garde le premier et le dernier mot
    const key = parts[0] + ' ' + parts[parts.length - 1];
    const rev = parts[parts.length - 1] + ' ' + parts[0];
    if (out.some((o) => { const n = norm(o); return n === key || n === rev; })) continue;
    out.push(h.split(' ').filter(Boolean).length > 2 ? [h.split(' ')[0], h.split(' ').slice(-1)[0]].join(' ') : h);
  }
  return out;
}
