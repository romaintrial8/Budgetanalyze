import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAmount, parseDate, parseCsv, norm } from '../src/domain/text';
import { parsePdfLines, parseText, parseWorkbook, looksScrambled, buildLines } from '../src/domain/importers';
import { neuterToUnicode } from '../src/data/pdf';
import { BOFA_GOOD, BOFA_LINES, BOFA_SCRAMBLED, CA_LINES, REVOLUT_CSV } from './fixtures';

test('montants FR / US / signes', () => {
  assert.equal(parseAmount('1 234,56'), 1234.56);
  assert.equal(parseAmount('-1,234.56'), -1234.56);
  assert.equal(parseAmount('-$727.16'), -727.16);
  assert.equal(parseAmount('ñ5.00'), -5); // signe moins d'un PDF iOS non corrigé
  assert.equal(parseAmount('(12.30)'), -12.3);
  assert.equal(parseAmount('12,30 €'), 12.3);
  assert.equal(parseAmount('1,234'), 1234);
  assert.ok(isNaN(parseAmount('abc')));
});

test('dates : jj/mm, mm/jj, ISO, OFX, série Excel', () => {
  assert.equal(parseDate('25/09/2026'), '2026-09-25');
  assert.equal(parseDate('09/25/26', 'mdy'), '2026-09-25');
  assert.equal(parseDate('09/11/26', 'mdy'), '2026-09-11');
  assert.equal(parseDate('2026-06-01 00:20:42'), '2026-06-01');
  assert.equal(parseDate('20261005120000[-5:EST]'), '2026-10-05');
  assert.equal(parseDate('46279'), '2026-09-14'); // 14/09/2026 dans Excel
});

test('CSV : séparateur détecté, guillemets, retours à la ligne', () => {
  const rows = parseCsv('Date;Libellé;Débit\n05/09/2026;"VIREMENT\nDe M. X";"1 500,00"\n');
  assert.deepEqual(rows[1], ['05/09/2026', 'VIREMENT\nDe M. X', '1 500,00']);
});

test('Revolut : 2 devises, frais séparés, en attente / annulées écartées, soldes recalculés', () => {
  const r = parseText(REVOLUT_CSV, 'releve.csv')!;
  assert.equal(r.format, 'Revolut (relevé)');
  assert.equal(r.txs.length, 12);
  assert.equal(r.ignored.length, 2);
  assert.equal(r.unrecognized.length, 0);
  assert.ok(r.checks.every((c) => c.ok), JSON.stringify(r.checks));
  const fee = r.txs.find((t) => t.kind === 'Frais')!;
  assert.equal(fee.amount, -2);
  assert.equal(fee.label, 'Frais : Change en USD');
  const premium = r.txs.filter((t) => t.label === "Frais d'abonnement Premium");
  assert.deepEqual(premium.map((t) => t.amount), [-10, -10]);
  assert.deepEqual([...new Set(r.txs.map((t) => t.account.name))], ['Revolut EUR', 'Revolut USD']);
  // solde faussé → contrôle en échec
  const bad = parseText(REVOLUT_CSV.replace('TERMINÉ,98.00', 'TERMINÉ,97.00'), 'x.csv')!;
  assert.equal(bad.checks.filter((c) => !c.ok).length, 1);
});

test('Bank of America PDF : sections, signes, totaux et solde contrôlés', () => {
  const r = parsePdfLines(BOFA_GOOD)!;
  assert.equal(r.format, 'Bank of America (relevé PDF)');
  assert.equal(r.txs.length, 6);
  assert.deepEqual(r.period, ['2026-09-11', '2026-10-06']);
  assert.equal(r.txs[0].account.number, '3344');
  assert.equal(r.txs[1].date, '2026-09-25');
  assert.equal(r.txs[1].label, 'Acme Corp');
  assert.equal(r.txs[2].label, 'Now Internet 8880001111');
  assert.equal(r.txs[3].label, 'Bkofamerica ATM (retrait)');
  assert.equal(r.txs[3].kind, 'Retrait DAB');
  assert.equal(r.txs[4].label, 'WM Supercenter');
  assert.deepEqual(r.holders, ['JEAN PIERRE DUPONT']);
  assert.equal(r.checks.length, 3);
  assert.ok(r.checks.every((c) => c.ok), JSON.stringify(r.checks));
  const bad = parsePdfLines(BOFA_LINES)!;
  assert.equal(bad.checks.filter((c) => !c.ok).length, 1);
});

test('PDF ré-encodé par iOS : reconnu comme brouillé, et la neutralisation des tables ToUnicode garde la longueur du fichier', () => {
  assert.equal(parsePdfLines(BOFA_SCRAMBLED), null);
  assert.equal(looksScrambled(BOFA_SCRAMBLED), true);
  assert.equal(looksScrambled(BOFA_GOOD), false);
  const pdf = new TextEncoder().encode('1 0 obj << /ToUnicode 5 0 R /Encoding 6 0 R >> /ToUnicode');
  const out = new TextDecoder().decode(neuterToUnicode(pdf));
  assert.equal(out.length, pdf.length);
  assert.equal(out, '1 0 obj << /ToUnicodX 5 0 R /Encoding 6 0 R >> /ToUnicodX');
});

test('Crédit Agricole PDF : sens lu à la position, année déduite, lignes de complément, totaux', () => {
  const r = parsePdfLines(CA_LINES)!;
  assert.equal(r.format, 'Crédit Agricole (relevé PDF)');
  assert.equal(r.txs.length, 6);
  const [vir, revo, pret, netflix, ysi, free] = r.txs;
  assert.equal(vir.amount, 1500);
  assert.equal(revo.amount, -1000);
  assert.equal(pret.label, 'Ech Prêt Intérêts');
  assert.equal(netflix.label, 'Netflix.com Amsterda');
  assert.equal(netflix.date, '2026-12-07');
  assert.deepEqual(ysi.orig, { amount: -153, currency: 'USD' });
  assert.equal(free.date, '2027-01-02');
  assert.equal(free.label, 'Free Mobile');
  assert.match(free.detail!, /FM-0000-1/);
  assert.equal(r.txs[0].account.number, '8901');
  assert.deepEqual(r.holders, ['Dupont Jean']);
  assert.ok(r.checks.length === 2 && r.checks.every((c) => c.ok), JSON.stringify(r.checks));
});

test('lignes PDF : regroupement par hauteur, cases à cocher retirées', () => {
  const lines = buildLines([
    { page: 1, x: 518, y: 347, w: 26, s: '133,44' },
    { page: 1, x: 206, y: 346, w: 168, s: 'Ancien solde créditeur au 04.09.2026' },
    { page: 1, x: 551, y: 346, w: 9, s: '¨' },
    { page: 1, x: 19, y: 330, w: 22, s: '05.09' },
  ]);
  assert.equal(lines.length, 2);
  assert.equal(lines[0].text, 'Ancien solde créditeur au 04.09.2026 133,44');
});

test('fichier Budget Excel : enveloppes, revenus prévus, objectifs = revenus − dépenses, journal', () => {
  const sheets = [
    { name: 'Prévisionnel', rows: [
      ['PRÉVISIONNEL MENSUEL (montants en $)'],
      ['Catégorie', 'Sept. 2026', 'Oct. 2026', 'Total 6 mois'],
      ['REVENUS'],
      ['Salaire net', '1000', '2000', ''],
      ['Stipend (net)', '500', '0', ''],
      ['Total revenus', '', '', ''],
      ['DÉPENSES'],
      ['Loyer', '800', '800', ''],
      ['Courses', '200', '250', ''],
      ['Total dépenses', '', '', ''],
    ] },
    { name: 'Journal', rows: [['Date', 'Catégorie', 'Description', 'Montant ($)'], ['46279', 'Revenu - Stipend', 'Prime', '500'], ['46280', 'Courses', 'Walmart', '85.5']] },
  ];
  const [r] = parseWorkbook(sheets, 'Budget.xlsx');
  assert.equal(r.format, 'Fichier Budget (Excel)');
  assert.equal(r.plan!.currency, 'USD');
  assert.deepEqual(r.plan!.envelopes, { loyer: 800 });
  assert.deepEqual(r.plan!.envelopesByMonth, { '2026-09': { courses: 200 }, '2026-10': { courses: 250 } });
  assert.deepEqual(r.plan!.incomeByMonth, { '2026-09': 1500, '2026-10': 2000 });
  // 1 500 − 1 000 = 500 ; 2 000 − 1 050 = 950 ; moyenne 725
  assert.deepEqual(r.plan!.goalsByMonth, { '2026-09': 500, '2026-10': 950 });
  assert.equal(r.plan!.goal, 725);
  assert.deepEqual(r.txs.map((t) => [t.date, t.amount, t.cat]), [['2026-09-14', 500, 'primes'], ['2026-09-15', -85.5, 'courses']]);
});

test('OFX : montants signés, compte, devise', () => {
  const ofx = `OFXHEADER:100\n<OFX><SIGNONMSGSRSV1><SONRS><FI><ORG>Bank of America</FI></SONRS></SIGNONMSGSRSV1><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>USD<BANKACCTFROM><ACCTID>000011112222</BANKACCTFROM><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261005120000<TRNAMT>-15.84<FITID>1<NAME>KROGER #644</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261006<TRNAMT>100.00<FITID>2<NAME>DEPOSIT</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
  const r = parseText(ofx, 'x.qfx')!;
  assert.equal(r.format, 'OFX / QFX');
  assert.deepEqual(r.txs.map((t) => [t.date, t.amount, t.account.bank, t.account.number]), [['2026-10-05', -15.84, 'bofa', '2222'], ['2026-10-06', 100, 'bofa', '2222']]);
});

test('CSV Bank of America (téléchargement du site) : résumé contrôlé', () => {
  const csv = `Description,,Summary Amt.\nBeginning balance as of 09/11/2026,,"0.00"\nTotal credits,,"100.00"\nTotal debits,,"-30.00"\nEnding balance as of 10/06/2026,,"70.00"\n\nDate,Description,Amount,Running Bal.\n09/11/2026,Beginning balance as of 09/11/2026,,"0.00"\n09/11/2026,"BOFA FIN CTR 09/11 #000007309 DEPOSIT","100.00","100.00"\n09/18/2026,"CHECKCARD 0917 NOW INTERNET 888 PA 22303806260003894149027","-30.00","70.00"\n`;
  const r = parseText(csv, 'stmt.csv')!;
  assert.equal(r.format, 'Bank of America (CSV)');
  assert.equal(r.txs.length, 2);
  assert.ok(r.checks[0].ok);
  assert.equal(norm(r.txs[1].label), 'now internet 888');
});

test('Safari : ReadableStream rendu parcourable avec « for await » quand le navigateur ne le permet pas', async () => {
  const { polyfillStreamIteration } = await import('../src/data/pdf');
  const RS = ReadableStream.prototype as unknown as Record<string | symbol, unknown>;
  const saved = { it: RS[Symbol.asyncIterator], values: RS.values };
  delete RS[Symbol.asyncIterator];
  delete RS.values;
  try {
    polyfillStreamIteration();
    const stream = new ReadableStream({ start(c) { c.enqueue(1); c.enqueue(2); c.close(); } });
    const got: number[] = [];
    for await (const v of stream as unknown as AsyncIterable<number>) got.push(v);
    assert.deepEqual(got, [1, 2]);
  } finally {
    Object.defineProperty(ReadableStream.prototype, Symbol.asyncIterator, { value: saved.it, writable: true, configurable: true });
    Object.defineProperty(ReadableStream.prototype, 'values', { value: saved.values, writable: true, configurable: true });
  }
});
