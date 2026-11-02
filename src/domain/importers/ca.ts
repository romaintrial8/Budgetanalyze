// Crédit Agricole : relevé de comptes PDF (« RELEVE DE COMPTES EN EUROS ») et export CSV / Excel du site.
// Constats sur un vrai relevé :
//  - colonnes Date opé. / Date valeur / Libellé / Débit / Crédit, dates sans l'année (« 05.09 ») ;
//  - le sens d'un montant n'est donné que par sa colonne : on le lit à sa position horizontale ;
//  - un libellé peut continuer sur 1 à 3 lignes (référence SEPA, « Mt initial : 153,00 USD-taux de change… ») ;
//  - le relevé donne l'ancien solde, le nouveau et le total des débits et des crédits : on les recalcule.
import type { AccountHint, Check, ParsedTx, ParseResult } from '../types';
import { cleanHolder, findCol, parseAmount, parseDate, squash } from '../text';
import { money } from '../format';
import type { PdfLine } from './pdflines';

const AMOUNT = /^\d{1,3}(?:[   ]\d{3})*,\d{2}$/;

export function isCaPdf(text: string): boolean {
  return /cr[ée]dit agricole/i.test(text) && /Libell[ée] des op[ée]rations/i.test(text);
}

function hint(name: string, number: string): AccountHint {
  const n = number.replace(/\D/g, '').slice(-4);
  return { bank: 'ca', currency: 'EUR', number: n, name: 'Crédit Agricole · ' + squash(name) + ' ••' + n, product: squash(name) };
}

/** « Carte » + « X1728 Oak Berry Paris 05/09 » → « Oak Berry Paris ». */
export function cleanCa(kind: string, rest: string): string {
  let s = squash(rest).replace(/^X\d{4}\s+/, '').replace(/\s+\d{2}\/\d{2}$/, '').replace(/^\*\*\s*/, '');
  const k = squash(kind);
  if (/^carte$/i.test(k)) return s.replace(/\s+[A-Z0-9]*\d{5,}$/, '') || k;
  if (/^virement$/i.test(k)) return /^\d+$/.test(s) ? 'Virement vers ' + s : s || k;
  if (/^(prlv|pr[ée]l[èe]vement|x)$/i.test(k)) return s || k;
  // autres types (« Ech Prêt », « Versement Sur Pea »…) : le type fait partie du libellé, sans références ni dates
  s = s.replace(/\b\d{6,}\b/g, '').replace(/\b\d{2}\/\d{2}\/\d{2,4}\b/g, '');
  return squash(k + ' ' + s);
}

export function parseCaPdf(lines: PdfLine[]): ParseResult | null {
  const text = lines.map((l) => l.text).join('\n');
  if (!isCaPdf(text)) return null;
  const res: ParseResult = { format: 'Crédit Agricole (relevé PDF)', txs: [], unrecognized: [], ignored: [], checks: [], holders: [] };
  // période : « Ancien solde … au 04.09.2026 » … « Nouveau solde … au 06.10.2026 »
  const dates = [...text.matchAll(/(Ancien|Nouveau) solde (cr[ée]diteur|d[ée]biteur) au (\d{2}\.\d{2}\.\d{4})/gi)];
  const endIso = dates.length ? parseDate(dates[dates.length - 1][3]) : '';
  const startIso = dates.length ? parseDate(dates[0][3]) : '';
  if (!endIso) return { ...res, unrecognized: ['Période du relevé introuvable (ligne « Nouveau solde … au jj.mm.aaaa »)'] };
  res.period = [startIso, endIso];
  const yearOf = (dd: string, mm: string) => {
    const ey = +endIso.slice(0, 4), em = +endIso.slice(5, 7);
    return (+mm > em ? ey - 1 : ey) + '-' + mm + '-' + dd;
  };

  interface Acc { hint: AccountHint; old?: number; neu?: number; deb?: number; cred?: number; sumDeb: number; sumCred: number }
  const accs: Acc[] = [];
  let acc: Acc | null = null;
  let debitX2 = 0, creditX2 = 0, libX = 0;
  let inTable = false;
  let last: ParsedTx | null = null;
  const side = (x2: number) => (Math.abs(x2 - debitX2) <= Math.abs(x2 - creditX2) ? 'debit' : 'credit');
  const amountOf = (l: PdfLine) => l.items.filter((i) => AMOUNT.test(i.s));

  for (const l of lines) {
    const t = l.text;
    // en-tête de section : « M. Dupont Jean - Compte Chèque n° 12345678901 »
    const sec = /^(.+?) - (.+?) n° ?(\d{6,})( \(suite\))?$/.exec(t);
    if (sec) {
      const h = hint(sec[2], sec[3]);
      acc = accs.find((a) => a.hint.number === h.number) || null;
      if (!acc) { accs.push((acc = { hint: h, sumDeb: 0, sumCred: 0 })); res.holders.push(cleanHolder(sec[1])); }
      last = null;
      continue;
    }
    const d = l.items.find((i) => /^D[ée]bit$/i.test(i.s)), c = l.items.find((i) => /^Cr[ée]dit$/i.test(i.s)), lib = l.items.find((i) => /^Libell[ée] des op[ée]rations$/i.test(i.s));
    if (d && c && lib) { debitX2 = d.x2; creditX2 = c.x2; libX = lib.x; inTable = true; last = null; continue; }
    if (!acc) continue;
    const sol = /^(Ancien|Nouveau) solde (cr[ée]diteur|d[ée]biteur) au/i.exec(t);
    if (sol) {
      const a = amountOf(l).pop();
      if (a) {
        const v = parseAmount(a.s) * (/d[ée]biteur/i.test(sol[2]) ? -1 : 1);
        if (/ancien/i.test(sol[1])) acc.old = v; else { acc.neu = v; inTable = false; }
      }
      last = null;
      continue;
    }
    if (/^Total des op[ée]rations/i.test(t)) {
      for (const a of amountOf(l)) { if (side(a.x2) === 'debit') acc.deb = parseAmount(a.s); else acc.cred = parseAmount(a.s); }
      last = null;
      continue;
    }
    if (!inTable) continue;
    if (/^Page \d+ \/|R\.C\.S\.|^RELEVE DE COMPTES|^Date d'arr[êe]t[ée]|^Date( Date)?$|^op[ée]\.|^valeur$/i.test(t)) { last = null; if (/^Page \d+ \/|R\.C\.S\./i.test(t)) inTable = false; continue; }
    const m = /^(\d{2})\.(\d{2})\s+(\d{2})\.(\d{2})\s+(.*)$/.exec(t);
    if (m) {
      const amounts = amountOf(l);
      const a = amounts[amounts.length - 1];
      if (!a) { res.unrecognized.push(t); last = null; continue; }
      const value = parseAmount(a.s);
      const debit = side(a.x2) === 'debit';
      // type = 1er fragment après les deux dates ; libellé = le reste, sans le montant
      const body = l.items.filter((i) => i !== a && i.x > (l.items[1]?.x2 ?? 0) + 1);
      const kind = body[0]?.s || '';
      const rest = body.slice(1).map((i) => i.s).join(' ');
      const raw = squash(kind + ' ' + rest);
      last = { account: acc.hint, date: yearOf(m[1], m[2]), amount: debit ? -value : value, currency: 'EUR', label: cleanCa(kind, rest), raw, kind };
      res.txs.push(last);
      if (debit) acc.sumDeb += value; else acc.sumCred += value;
      continue;
    }
    // ligne de complément d'un libellé
    if (last && libX && l.items[0].x >= libX - 6 && l.items[0].x < debitX2 - 60 && !amountOf(l).length) {
      last.detail = squash((last.detail ? last.detail + ' · ' : '') + t);
      const fx = /Mt initial\s*:\s*([\d\s ]+,\d{2})\s*([A-Z]{3})/.exec(t);
      if (fx) last.orig = { amount: (last.amount < 0 ? -1 : 1) * parseAmount(fx[1]), currency: fx[2] };
      if (/^\*\*|^Prlv|^Pr[ée]l[èe]vement/i.test(last.label) || last.label === last.kind) last.label = squash(t);
      continue;
    }
    if (/^\d{2}\.\d{2}\b/.test(t)) res.unrecognized.push(t);
  }
  for (const a of accs) {
    const checks: Check[] = [];
    if (a.deb !== undefined) {
      const ok = Math.abs(a.deb - a.sumDeb) < 0.005 && Math.abs((a.cred ?? 0) - a.sumCred) < 0.005;
      checks.push({ ok, text: ok ? `Totaux conformes au relevé : ${money(a.sumDeb, 'EUR')} de débits, ${money(a.sumCred, 'EUR')} de crédits` : `Totaux : relevé ${money(a.deb, 'EUR')} / ${money(a.cred ?? 0, 'EUR')}, lus ${money(a.sumDeb, 'EUR')} / ${money(a.sumCred, 'EUR')}` });
    }
    if (a.old !== undefined && a.neu !== undefined) {
      const calc = a.old - a.sumDeb + a.sumCred;
      const ok = Math.abs(calc - a.neu) < 0.005;
      checks.push({ ok, text: ok ? `Nouveau solde retrouvé : ${money(a.old, 'EUR')} → ${money(a.neu, 'EUR')}` : `Nouveau solde : relevé ${money(a.neu, 'EUR')}, recalculé ${money(calc, 'EUR')}` });
    }
    res.checks.push(...checks.map((c) => (accs.length > 1 ? { ...c, text: a.hint.name + ' : ' + c.text } : c)));
  }
  return res;
}

// ------------------------------------------------------------------ export CSV / Excel du site (format à confirmer sur un vrai fichier)
export function parseCaRows(rows: string[][], fileName: string): ParseResult | null {
  const hi = rows.findIndex((r) => findCol(r, ['Date', "Date d'opération", 'Date opération']) >= 0 && findCol(r, ['Libellé', 'Libelle']) >= 0 && (findCol(r, ['Débit Euros', 'Débit', 'Debit']) >= 0 || findCol(r, ['Montant']) >= 0));
  if (hi < 0) return null;
  const head = rows.slice(0, hi).map((r) => r.join(' ')).join('\n');
  const isCa = /cr[ée]dit agricole|compte de d[ée]p[ôo]t|ca-|^CA\d/i.test(head + ' ' + fileName);
  const h = rows[hi];
  const cd = findCol(h, ['Date', "Date d'opération", 'Date opération']);
  const cl = findCol(h, ['Libellé', 'Libelle']);
  const cdeb = findCol(h, ['Débit Euros', 'Débit', 'Debit']);
  const ccred = findCol(h, ['Crédit Euros', 'Crédit', 'Credit']);
  const cm = findCol(h, ['Montant', 'Montant (EUR)']);
  const number = /n°\s*(\d{6,})/.exec(head)?.[1] || '';
  const account: AccountHint = isCa && number ? hint(/(Compte[^;\n]*?|Livret[^;\n]*?)\s*n°/i.exec(head)?.[1] || 'Compte', number) : { bank: isCa ? 'ca' : 'other', currency: 'EUR', name: isCa ? 'Crédit Agricole' : fileName.replace(/\.[^.]+$/, '') };
  const res: ParseResult = { format: isCa ? 'Crédit Agricole (export du site)' : 'Relevé bancaire (Date / Libellé / Débit / Crédit)', txs: [], unrecognized: [], ignored: [], checks: [], holders: [] };
  for (const r of rows.slice(hi + 1)) {
    const date = parseDate(r[cd] || '');
    let amount = NaN;
    if (cm >= 0) amount = parseAmount(r[cm] || '');
    else {
      const deb = parseAmount(r[cdeb] || ''), cred = parseAmount(r[ccred] || '');
      if (!isNaN(deb) && deb !== 0) amount = -Math.abs(deb);
      else if (!isNaN(cred)) amount = Math.abs(cred);
    }
    if (!date || isNaN(amount)) { if (r.some((x) => x)) res.unrecognized.push(r.join(' ; ')); continue; }
    const lines = String(r[cl] || '').split(/\r?\n/).map(squash).filter(Boolean);
    const kind = lines.length > 1 ? lines[0] : '';
    const label = lines.length > 1 ? lines.slice(1).join(' ') : lines[0] || '';
    res.txs.push({ account, date, amount, currency: 'EUR', label: cleanCa(kind || 'x', label), raw: lines.join(' '), kind: kind ? kind.replace(/^(VIREMENT|PAIEMENT PAR CARTE|PRELEVEMENT).*/i, (x) => x.charAt(0) + x.slice(1).toLowerCase()) : undefined });
  }
  if (res.txs.length) {
    const ds = res.txs.map((t) => t.date).sort();
    res.period = [ds[0], ds[ds.length - 1]];
    if (!isCa) res.checks.push({ ok: true, text: 'Format générique : vérifie le compte de destination' });
  }
  return res;
}
