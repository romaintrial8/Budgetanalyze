// Bank of America : relevé PDF mensuel (compte courant) et téléchargement CSV (« Microsoft Excel Format »).
// Constats sur un vrai relevé :
//  - un PDF enregistré depuis l'iPhone (iOS « Quartz PDFContext ») a une table de caractères faussée : le texte sort en
//    « CHEC&CAR( … LITTLE ROC& ». La lecture du PDF (data/pdf.ts) recommence alors sans cette table : voir PdfOptions ;
//  - les débits sont imprimés avec un signe moins, les crédits sans signe ;
//  - le relevé donne ses propres totaux par section et les soldes de début et de fin : on les recalcule.
import type { AccountHint, Check, ParsedTx, ParseResult } from '../types';
import { cleanHolder, findCol, norm, parseAmount, parseDate, parseWordDate, squash } from '../text';
import { money } from '../format';
import type { PdfLine } from './pdflines';

const ACRONYMS = new Set(['ATM', 'DMV', 'CVS', 'USA', 'BBQ', 'KFC', 'IHOP', 'TJ', 'AT&T', 'UPS', 'USPS']);
const titleWord = (w: string) => (/[\d#*&]/.test(w) || w.length <= 2 || ACRONYMS.has(w) ? w : w.charAt(0) + w.slice(1).toLowerCase());
const title = (s: string) => squash(s).split(' ').map(titleWord).join(' ');

/** Libellé lisible d'une ligne de relevé BofA (le libellé brut reste stocké pour les règles). */
export function cleanBofa(raw: string): string {
  let s = squash(raw);
  let m = /^CHECKCARD \d{4} (.+)$/i.exec(s);
  if (m) return title(m[1].replace(/\s+\d{10,}$/, '').replace(/\s+[A-Z]{2}$/, ''));
  m = /^(.+?) \d{2}\/\d{2} #?\d+ (PURCHASE|WITHDRWL|DEPOSIT|PMNT SENT|PMNT RCVD)\b(.*)$/i.exec(s);
  if (m) {
    const what = m[2].toUpperCase() === 'WITHDRWL' ? ' (retrait)' : m[2].toUpperCase() === 'DEPOSIT' ? ' (dépôt)' : '';
    return title(m[1]) + what;
  }
  m = /^(.+?) DES:/.exec(s);
  if (m) return title(m[1]);
  s = s.replace(/\s+Conf#\s*\S+$/i, '').replace(/;$/, '');
  return s;
}

function accountHint(number: string | undefined): AccountHint {
  return { bank: 'bofa', currency: 'USD', number, name: 'Bank of America' + (number ? ' ••' + number : '') };
}

// ------------------------------------------------------------------ PDF
type Section = 'deposits' | 'atm' | 'other' | 'checks' | 'fees' | 'none';
const HEADINGS: [RegExp, Section][] = [
  [/^Deposits and other additions( - continued)?$/i, 'deposits'],
  [/^ATM and debit card subtractions( - continued)?$/i, 'atm'],
  [/^Other subtractions( - continued)?$/i, 'other'],
  [/^Checks( - continued)?$/i, 'checks'],
  [/^Service fees( - continued)?$/i, 'fees'],
  [/^Daily ledger balances/i, 'none'],
  [/^Withdrawals and other subtractions( - continued)?$/i, 'none'],
];

export function isBofaPdf(text: string): boolean {
  return /bank of america|bankofamerica\.com/i.test(text) && /^Date Description Amount$/m.test(text);
}

export function parseBofaPdf(lines: PdfLine[]): ParseResult | null {
  const text = lines.map((l) => l.text).join('\n');
  if (!isBofaPdf(text)) return null;
  const res: ParseResult = { format: 'Bank of America (relevé PDF)', txs: [], unrecognized: [], ignored: [], checks: [], holders: [] };
  const num = /Account number:\s*([\d ]{8,})/i.exec(text)?.[1].replace(/\D/g, '');
  const hint = accountHint(num ? num.slice(-4) : undefined);
  const per = /for ([A-Za-z]+ \d{1,2},? \d{4}) to ([A-Za-z]+ \d{1,2},? \d{4})/.exec(text);
  if (per) res.period = [parseWordDate(per[1]), parseWordDate(per[2])];
  const holder = lines.map((l) => /^(.+?) \| Account #/.exec(l.text)?.[1]).find(Boolean);
  if (holder) res.holders.push(cleanHolder(holder));

  // résumé du compte (page 1)
  const summary = (re: RegExp) => { const m = lines.map((l) => re.exec(l.text)).find(Boolean); return m ? parseAmount(m[m.length - 1]) : NaN; };
  const begin = summary(/^Beginning balance on .+? (-?\$?[\d,]+\.\d\d)$/i);
  const end = summary(/^Ending balance on .+? (-?\$?[\d,]+\.\d\d)$/i);

  let section: Section = 'none';
  let descX = 0;
  const totals: Partial<Record<Section, number>> = {};
  const sums: Record<Section, number> = { deposits: 0, atm: 0, other: 0, checks: 0, fees: 0, none: 0 };
  let last: ParsedTx | null = null;
  for (const l of lines) {
    const t = l.text;
    const head = HEADINGS.find(([re]) => re.test(t));
    if (head) { section = head[1]; last = null; continue; }
    if (/^Date Description Amount$/i.test(t)) { descX = l.items.find((i) => /^Description$/i.test(i.s))?.x ?? l.items[1]?.x ?? 0; last = null; continue; }
    const tot = /^Total (deposits and other additions|ATM and debit card subtractions|other subtractions|checks|service fees)\s+(-?\$?[\d,]+\.\d\d)$/i.exec(t);
    if (tot) {
      const key = norm(tot[1]);
      const sec: Section = key.startsWith('deposits') ? 'deposits' : key.startsWith('atm') ? 'atm' : key.startsWith('other') ? 'other' : key.startsWith('checks') ? 'checks' : 'fees';
      totals[sec] = parseAmount(tot[2]);
      last = null;
      continue;
    }
    if (section === 'none') continue;
    const m = /^(\d{2}\/\d{2}\/\d{2})\s+(.+?)\s+(-?\$?[\d,]+\.\d{2})$/.exec(t);
    if (m) {
      let amount = parseAmount(m[3]);
      if (section !== 'deposits' && amount > 0) amount = -amount;
      const raw = squash(m[2]);
      last = { account: hint, date: parseDate(m[1], 'mdy'), amount, currency: 'USD', label: cleanBofa(raw), raw, kind: section === 'deposits' ? 'Crédit' : section === 'atm' ? (/WITHDRWL/i.test(raw) ? 'Retrait DAB' : 'Carte') : section === 'fees' ? 'Frais' : section === 'checks' ? 'Chèque' : 'Débit' };
      res.txs.push(last);
      sums[section] += amount;
      continue;
    }
    // suite d'un libellé sur la ligne suivante (alignée sur la colonne Description)
    if (last && descX && Math.abs(l.items[0].x - descX) < 12 && !/continued on the next page|^Page \d+ of \d+/i.test(t)) {
      last.raw = squash(last.raw + ' ' + t);
      last.label = cleanBofa(last.raw);
      continue;
    }
    if (/^\d{2}\/\d{2}\/\d{2}\b/.test(t)) res.unrecognized.push(t);
  }
  // contrôles
  const checks: Check[] = [];
  const names: Record<string, string> = { deposits: 'crédits', atm: 'carte et DAB', other: 'autres débits', checks: 'chèques', fees: 'frais' };
  for (const [sec, total] of Object.entries(totals) as [Section, number][]) {
    const ok = Math.abs(total - sums[sec]) < 0.005;
    checks.push({ ok, text: ok ? `Total ${names[sec]} conforme au relevé : ${money(total, 'USD')}` : `Total ${names[sec]} : relevé ${money(total, 'USD')}, lu ${money(sums[sec], 'USD')}` });
  }
  if (!isNaN(begin) && !isNaN(end)) {
    const all = res.txs.reduce((s, x) => s + x.amount, 0);
    const ok = Math.abs(begin + all - end) < 0.005;
    checks.push({ ok, text: ok ? `Solde de fin retrouvé : ${money(begin, 'USD')} + opérations = ${money(end, 'USD')}` : `Solde de fin : relevé ${money(end, 'USD')}, recalculé ${money(begin + all, 'USD')}` });
  }
  res.checks = checks;
  return res;
}

// ------------------------------------------------------------------ CSV (téléchargement du site)
export function parseBofaCsv(rows: string[][]): ParseResult | null {
  // compte courant : Date, Description, Amount, Running Bal.
  let hi = rows.findIndex((r) => findCol(r, ['Running Bal.', 'Running Bal']) >= 0 && findCol(r, ['Date']) >= 0 && findCol(r, ['Amount']) >= 0);
  if (hi >= 0) {
    const h = rows[hi];
    const [cd, cdesc, ca, cb] = [findCol(h, ['Date']), findCol(h, ['Description']), findCol(h, ['Amount']), findCol(h, ['Running Bal.', 'Running Bal'])];
    const res: ParseResult = { format: 'Bank of America (CSV)', txs: [], unrecognized: [], ignored: [], checks: [], holders: [] };
    const hint = accountHint(undefined);
    const sumRow = (re: RegExp) => { const r = rows.slice(0, hi).find((x) => re.test(x[0] || '')); return r ? parseAmount(r[r.length - 1]) : NaN; };
    const begin = sumRow(/^Beginning balance/i), end = sumRow(/^Ending balance/i);
    for (const r of rows.slice(hi + 1)) {
      const date = parseDate(r[cd] || '', 'mdy');
      const amount = parseAmount(r[ca] || '');
      const desc = squash(r[cdesc] || '');
      if (/^Beginning balance/i.test(desc) && isNaN(amount)) continue;
      if (!date || isNaN(amount)) { res.unrecognized.push(r.join(', ')); continue; }
      const bal = parseAmount(r[cb] || '');
      res.txs.push({ account: hint, date, amount, currency: 'USD', label: cleanBofa(desc), raw: desc, balance: isNaN(bal) ? undefined : bal });
    }
    if (res.txs.length) {
      res.period = [res.txs.map((t) => t.date).sort()[0], res.txs.map((t) => t.date).sort().slice(-1)[0]];
      if (!isNaN(begin) && !isNaN(end)) {
        const s = res.txs.reduce((a, t) => a + t.amount, 0);
        const ok = Math.abs(begin + s - end) < 0.005;
        res.checks.push({ ok, text: ok ? `Solde de fin retrouvé : ${money(end, 'USD')}` : `Solde de fin : fichier ${money(end, 'USD')}, recalculé ${money(begin + s, 'USD')}` });
      }
    }
    return res;
  }
  // carte de crédit : Posted Date, Reference Number, Payee, Address, Amount
  hi = rows.findIndex((r) => findCol(r, ['Posted Date']) >= 0 && findCol(r, ['Payee']) >= 0 && findCol(r, ['Amount']) >= 0);
  if (hi < 0) return null;
  const h = rows[hi];
  const [cd, cp, ca] = [findCol(h, ['Posted Date']), findCol(h, ['Payee']), findCol(h, ['Amount'])];
  const res: ParseResult = { format: 'Bank of America carte de crédit (CSV)', txs: [], unrecognized: [], ignored: [], checks: [], holders: [] };
  const hint: AccountHint = { bank: 'bofa', currency: 'USD', name: 'Bank of America · carte de crédit', product: 'carte de crédit' };
  for (const r of rows.slice(hi + 1)) {
    const date = parseDate(r[cd] || '', 'mdy');
    const amount = parseAmount(r[ca] || '');
    if (!date || isNaN(amount)) { res.unrecognized.push(r.join(', ')); continue; }
    const desc = squash(r[cp] || '');
    res.txs.push({ account: hint, date, amount, currency: 'USD', label: cleanBofa(desc), raw: desc });
  }
  return res;
}
