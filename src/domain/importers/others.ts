// Formats ouverts : OFX / QFX (Quicken, proposé par la plupart des banques), CSV générique et export CSV de BudgetAnalyze.
import type { AccountHint, Bank, ParseResult } from '../types';
import { findCol, norm, parseAmount, parseDate, squash } from '../text';
import { catFromLabel, UNCAT } from '../categories';

// ------------------------------------------------------------------ OFX / QFX
const tag = (block: string, name: string): string => {
  const m = new RegExp('<' + name + '>([^<\\r\\n]*)', 'i').exec(block);
  return m ? squash(m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')) : '';
};

export function parseOfx(text: string): ParseResult | null {
  if (!/<OFX>/i.test(text) || !/<STMTTRN>/i.test(text)) return null;
  const res: ParseResult = { format: 'OFX / QFX', txs: [], unrecognized: [], ignored: [], checks: [], holders: [] };
  const org = tag(text, 'ORG') + ' ' + tag(text, 'BANKID') + ' ' + tag(text, 'FID');
  const bank: Bank = /bank of america|bofa|\bB1\b/i.test(org) ? 'bofa' : /cr[ée]dit agricole|\bCA\b|agrif/i.test(org) ? 'ca' : /revolut/i.test(org) ? 'revolut' : 'other';
  // un fichier peut contenir plusieurs comptes (<STMTRS> ou <CCSTMTRS>)
  const stmts = text.split(/<(?:CC)?STMTRS>/i).slice(1);
  for (const st of stmts) {
    const cur = (tag(st, 'CURDEF') || 'USD').toUpperCase();
    const acct = tag(st, 'ACCTID').replace(/\D/g, '');
    const isCard = /<CCACCTFROM>/i.test(st);
    const names: Record<Bank, string> = { bofa: 'Bank of America', ca: 'Crédit Agricole', revolut: 'Revolut', manual: 'Saisie', other: tag(text, 'ORG') || 'Banque' };
    const account: AccountHint = { bank, currency: cur, number: acct ? acct.slice(-4) : undefined, name: names[bank] + (isCard ? ' · carte de crédit' : '') + (acct ? ' ••' + acct.slice(-4) : ''), product: isCard ? 'carte de crédit' : undefined };
    for (const b of st.split(/<STMTTRN>/i).slice(1)) {
      const date = parseDate(tag(b, 'DTPOSTED'));
      const amount = parseAmount(tag(b, 'TRNAMT'));
      const name = tag(b, 'NAME'), memo = tag(b, 'MEMO');
      if (!date || isNaN(amount)) { res.unrecognized.push(squash(b.replace(/<[^>]+>/g, ' ')).slice(0, 120)); continue; }
      const label = name || memo;
      res.txs.push({ account, date, amount, currency: cur, label, raw: memo && memo !== name ? squash(name + ' ' + memo) : undefined, kind: tag(b, 'TRNTYPE') });
    }
  }
  if (!res.txs.length && !res.unrecognized.length) return null;
  const ds = res.txs.map((t) => t.date).sort();
  if (ds.length) res.period = [ds[0], ds[ds.length - 1]];
  return res;
}

// ------------------------------------------------------------------ export CSV de BudgetAnalyze (aller-retour)
export const EXPORT_HEADER = ['Date', 'Compte', 'Libellé', 'Montant', 'Devise', 'Catégorie', 'Note', 'Libellé brut', 'Banque', 'Catégorie calculée', 'Montant (devise de référence)'];

export function parseOwnCsv(rows: string[][]): ParseResult | null {
  const hi = rows.findIndex((r) => r.length >= 6 && norm(r.slice(0, 6).join('|')) === norm(EXPORT_HEADER.slice(0, 6).join('|')));
  if (hi < 0) return null;
  const res: ParseResult = { format: 'Export BudgetAnalyze (CSV)', txs: [], unrecognized: [], ignored: [], checks: [], holders: [] };
  for (const r of rows.slice(hi + 1)) {
    const date = parseDate(r[0]);
    const amount = parseAmount(r[3]);
    const cur = (r[4] || '').toUpperCase();
    if (!date || isNaN(amount) || !/^[A-Z]{3}$/.test(cur)) { res.unrecognized.push(r.join(', ')); continue; }
    const bank = (['revolut', 'bofa', 'ca', 'manual'].includes(r[8]) ? r[8] : 'other') as Bank;
    const cat = r[5] && norm(r[5]) !== 'a classer' ? catFromLabel(r[5]) || undefined : undefined;
    res.txs.push({ account: { bank, currency: cur, name: r[1] || 'Compte importé' }, date, amount, currency: cur, label: r[2], raw: r[7] || undefined, cat: cat === UNCAT ? undefined : cat, note: r[6] || undefined });
  }
  return res;
}

// ------------------------------------------------------------------ CSV générique (Date + Libellé/Description + Montant)
export function parseGenericCsv(rows: string[][], fileName: string): ParseResult | null {
  const DATE = ['Date', 'Date opération', "Date d'opération", 'Transaction Date', 'Posted Date', 'Posting Date', 'Booking Date', 'Date de valeur'];
  const DESC = ['Description', 'Libellé', 'Libelle', 'Label', 'Payee', 'Merchant', 'Bénéficiaire', 'Memo', 'Name'];
  const AMT = ['Amount', 'Montant', 'Montant (EUR)', 'Montant (USD)', 'Value'];
  const hi = rows.findIndex((r) => findCol(r, DATE) >= 0 && findCol(r, DESC) >= 0 && (findCol(r, AMT) >= 0 || (findCol(r, ['Debit', 'Débit']) >= 0 && findCol(r, ['Credit', 'Crédit']) >= 0)));
  if (hi < 0) return null;
  const h = rows[hi];
  const [cd, cl, ca] = [findCol(h, DATE), findCol(h, DESC), findCol(h, AMT)];
  const [cdeb, ccred] = [findCol(h, ['Debit', 'Débit']), findCol(h, ['Credit', 'Crédit'])];
  const ccur = findCol(h, ['Currency', 'Devise']);
  // ordre jour/mois : on regarde si une date dépasse 12 en première position
  const sample = rows.slice(hi + 1, hi + 60).map((r) => r[cd] || '');
  const order = sample.some((s) => /^(1[3-9]|2\d|3[01])[/.-]/.test(s)) ? 'dmy' : sample.some((s) => /^\d{1,2}[/.-](1[3-9]|2\d|3[01])[/.-]/.test(s)) ? 'mdy' : /[$]|usd/i.test(h.join(' ')) ? 'mdy' : 'dmy';
  const defCur = /usd|\$/i.test(h.join(' ')) ? 'USD' : 'EUR';
  const res: ParseResult = { format: 'CSV générique', txs: [], unrecognized: [], ignored: [], checks: [{ ok: true, text: 'Format générique : vérifie le compte et la devise avant de confirmer' }], holders: [] };
  const name = fileName.replace(/\.[^.]+$/, '');
  for (const r of rows.slice(hi + 1)) {
    const date = parseDate(r[cd] || '', order);
    let amount = ca >= 0 ? parseAmount(r[ca] || '') : NaN;
    if (ca < 0) {
      const deb = parseAmount(r[cdeb] || ''), cred = parseAmount(r[ccred] || '');
      amount = !isNaN(deb) && deb !== 0 ? -Math.abs(deb) : !isNaN(cred) ? Math.abs(cred) : NaN;
    }
    if (!date || isNaN(amount)) { if (r.some((x) => x)) res.unrecognized.push(r.join(', ')); continue; }
    const cur = ((ccur >= 0 && r[ccur]) || defCur).toUpperCase();
    res.txs.push({ account: { bank: 'other', currency: cur, name }, date, amount, currency: cur, label: squash(r[cl] || '') });
  }
  if (!res.txs.length) return null;
  const ds = res.txs.map((t) => t.date).sort();
  res.period = [ds[0], ds[ds.length - 1]];
  return res;
}
