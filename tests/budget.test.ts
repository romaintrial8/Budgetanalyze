import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyData } from '../src/data/store';
import { planImport, mergeOwnNames, resolveAccount } from '../src/domain/ledger';
import { buildLedger, convert, goalFor, impliedRates, monthStats, pairTransfers, envelopesFor } from '../src/domain/calc';
import { categorize, suggestPattern, mentionsOwner, ruleText } from '../src/domain/categories';
import { detectSubscriptions } from '../src/domain/recurring';
import { exportCsv } from '../src/domain/exporters';
import { parsePdfLines, parseText } from '../src/domain/importers';
import type { AppData, Tx } from '../src/domain/types';
import { CA_LINES, REVOLUT_CSV } from './fixtures';

const tx = (p: Partial<Tx> & Pick<Tx, 'accountId' | 'date' | 'amount' | 'label'>): Tx => ({ id: p.accountId + p.date + p.amount + p.label, fp: '', currency: 'EUR', source: 't', ...p });

function load(...results: Parameters<typeof planImport>[1]): AppData {
  const d = emptyData();
  for (const r of results) {
    const pl = planImport(d, [r], 'imp');
    d.accounts.push(...pl.accounts);
    d.txs.push(...pl.txs);
    d.settings.ownNames = mergeOwnNames(d.settings.ownNames, r.holders);
  }
  return d;
}

test('import : comptes créés, réimport sans doublon, lignes identiques gardées grâce au rang', () => {
  const r = parseText(REVOLUT_CSV, 'r.csv')!;
  const d = load(r);
  assert.deepEqual(d.accounts.map((a) => a.id), ['revolut-EUR', 'revolut-USD']);
  assert.equal(d.txs.length, 12);
  // deux Walmart identiques le même jour : #1 et #2
  assert.deepEqual(d.txs.filter((t) => t.label === 'Walmart').map((t) => t.fp), ['revolut-USD|2026-09-06|-4000|1', 'revolut-USD|2026-09-06|-4000|2']);
  const again = planImport(d, [r], 'imp2');
  assert.equal(again.txs.length, 0);
  assert.equal(again.duplicates, 12);
});

test('compte sans numéro (CSV BofA) rattaché au compte BofA existant', () => {
  const accounts = [{ id: 'bofa-3344', bank: 'bofa' as const, name: 'Bank of America ••3344', currency: 'USD', number: '3344' }];
  assert.equal(resolveAccount({ bank: 'bofa', currency: 'USD', name: 'Bank of America' }, accounts).id, 'bofa-3344');
  assert.equal(resolveAccount({ bank: 'bofa', currency: 'USD', name: 'BofA carte', product: 'carte de crédit' }, accounts).id, 'bofa-carte-de-credit-USD');
});

test('titulaires : prénom + nom, sans doublon, ordre indifférent', () => {
  assert.deepEqual(mergeOwnNames([], ['JEAN PIERRE DUPONT', 'Dupont Jean']), ['JEAN DUPONT']);
  assert.ok(mentionsOwner('paiement envoye par m. dupont jean', ['JEAN DUPONT']));
  assert.ok(!mentionsOwner('virement a : marie dupont', ['JEAN DUPONT']));
  // le nom du bénéficiaire d'un salaire (INDN:) ne fait pas du salaire un virement interne
  assert.ok(!mentionsOwner(ruleText({ label: 'Acme', raw: 'ACME CORP DES:PAYROLL ID:1 INDN:Dupont Jean CO ID:9 PPD' }), ['JEAN DUPONT']));
});

test('virements internes : CA → Revolut apparié, change EUR/USD neutre, investissement à part', () => {
  const d = load(parsePdfLines(CA_LINES)!, parseText(REVOLUT_CSV.replace('2026-09-02 10:00:00,2026-09-02 10:00:01,Paiement envoyé par M. DUPONT JEAN,500.00', '2026-12-05 10:00:00,2026-12-05 10:00:01,Paiement envoyé par M. DUPONT JEAN,1000.00').replace('TERMINÉ,510.00', 'TERMINÉ,1010.00'), 'r.csv')!);
  const led = buildLedger(d);
  const cat = (label: string, amount?: number) => led.rows.find((r) => r.tx.label === label && (amount === undefined || r.tx.amount === amount))!;
  // CA « Vir Inst vers Jean Revolut » −1 000 le 05/12 ↔ Revolut +1 000 le 05/12
  assert.equal(cat('Vir Inst vers Jean Revolut').cat, 'interne');
  assert.equal(cat('Vir Inst vers Jean Revolut').source, 'pair');
  assert.equal(cat('De M. Dupont Jean').cat, 'interne'); // nom du titulaire
  assert.equal(cat('Change en USD', -400).cat, 'interne');
  assert.equal(cat('Change en USD', 440).cat, 'interne');
  assert.equal(cat('Frais : Change en USD').cat, 'frais');
  assert.equal(cat('To Jean Binance').cat, 'invest');
  assert.equal(cat('Bitstack').cat, 'invest');
  assert.equal(cat('Walmart').cat, 'courses');
  assert.equal(cat('Progressive').cat, 'assu_auto');
  assert.equal(cat("Frais d'abonnement Premium").cat, 'abonnements');
  assert.equal(cat('Ech Prêt Intérêts').cat, 'credits');
  assert.equal(cat('Netflix.com Amsterda').cat, 'abonnements');
});

test('un achat par carte ne peut jamais être pris pour un virement interne', () => {
  const txs = [tx({ accountId: 'a', date: '2026-09-01', amount: -50, label: 'Walmart', kind: 'Paiement par carte' }), tx({ accountId: 'b', date: '2026-09-01', amount: 50, label: 'Zelle payment from X' })];
  assert.equal(pairTransfers(txs).size, 0);
});

test('priorité : choix manuel > règle apprise > virement détecté > règle par défaut', () => {
  const t = tx({ accountId: 'a', date: '2026-09-01', amount: -30, label: 'Walmart', kind: 'Paiement par carte' });
  assert.equal(categorize(t, [], [], new Set()).cat, 'courses');
  const rules = [{ id: 'r', pattern: 'walmart', cat: 'shopping', created: '' }];
  assert.equal(categorize(t, rules, [], new Set()).cat, 'shopping');
  assert.equal(categorize({ ...t, cat: 'cadeaux' }, rules, [], new Set()).cat, 'cadeaux');
  assert.equal(suggestPattern('CHECKCARD 0927 NOW INTERNET 8889364968 PA 554328'), 'now internet');
  assert.equal(suggestPattern('WM SUPERCENTER 09/26 #000661881 PURCHASE 2700 S X'), 'wm supercenter');
});

test('conversion : taux du jour, taux précédent, secours ; taux implicites des changes Revolut', () => {
  const fx = { EUR: { '2026-09-01': 1.1, '2026-09-04': 1.2 } };
  assert.ok(Math.abs(convert(100, 'EUR', 'USD', '2026-09-01', fx, 1.05).value - 110) < 1e-9);
  assert.ok(Math.abs(convert(100, 'EUR', 'USD', '2026-09-03', fx, 1.05).value - 110) < 1e-9); // dernier taux connu
  assert.ok(Math.abs(convert(120, 'USD', 'EUR', '2026-09-04', fx, 1.05).value - 100) < 1e-9);
  assert.deepEqual(convert(100, 'EUR', 'USD', '2026-09-01', {}, 1.05), { value: 105, estimated: true });
  const imp = impliedRates([tx({ accountId: 'revolut-EUR', date: '2026-09-03', amount: -400, label: 'Change en USD' }), tx({ accountId: 'revolut-USD', date: '2026-09-03', amount: 440, currency: 'USD', label: 'Change en USD' })]);
  assert.deepEqual(imp, { EUR: { '2026-09-03': 1.1 } });
});

test('totaux mensuels en USD : revenus, dépenses nettes, épargne, investissement, à classer', () => {
  const d = emptyData();
  d.fx = { EUR: { '2026-09-01': 1.1 } };
  d.accounts = [{ id: 'a', bank: 'bofa', name: 'A', currency: 'USD' }, { id: 'e', bank: 'ca', name: 'E', currency: 'EUR' }];
  d.txs = [
    tx({ accountId: 'a', date: '2026-09-25', amount: 2000, currency: 'USD', label: 'Payroll ACME', kind: 'Crédit' }),
    tx({ accountId: 'a', date: '2026-09-05', amount: -100, currency: 'USD', label: 'Walmart', kind: 'Carte' }),
    tx({ accountId: 'a', date: '2026-09-06', amount: 20, currency: 'USD', label: 'Walmart', kind: 'Carte' }), // remboursement
    tx({ accountId: 'e', date: '2026-09-01', amount: -100, label: 'Netflix.com', kind: 'Carte' }), // 110 $
    tx({ accountId: 'e', date: '2026-09-02', amount: -200, label: 'To X Binance', kind: 'Virement' }), // investi 220 $
    tx({ accountId: 'a', date: '2026-09-07', amount: -50, currency: 'USD', label: 'Inconnu SARL', kind: 'Carte' }),
  ];
  const m = monthStats(buildLedger(d).rows).get('2026-09')!;
  // revenus 2 000 ; dépenses 100 − 20 + 110 + 50 = 240 ; épargne 1 760 ; investi 220
  assert.equal(m.income, 2000);
  assert.equal(m.expenses, 240);
  assert.equal(m.savings, 1760);
  assert.equal(m.invested, 220);
  assert.equal(m.byCat.courses, 80);
  assert.equal(m.byCat.abonnements, 110);
  assert.equal(m.uncatCount, 1);
  assert.equal(m.uncatOut, 50);
});

test('objectifs et enveloppes : valeur du mois sinon défaut, convertis si la devise de référence change', () => {
  const d = emptyData();
  d.plan = { ...d.plan, currency: 'USD', goal: 500, goalsByMonth: { '2026-09': 860 }, envelopes: { loyer: 1000, courses: 300 }, envelopesByMonth: { '2026-10': { courses: 400 } } };
  const fx = { EUR: { '2026-09-15': 1.25, '2026-10-15': 1.25 } };
  assert.equal(goalFor(d, '2026-09', fx), 860);
  assert.equal(goalFor(d, '2026-10', fx), 500);
  // avant le premier mois du plan (septembre) : ni objectif par défaut, ni enveloppes
  assert.equal(goalFor(d, '2026-08', fx), 0);
  assert.deepEqual(envelopesFor(d, '2026-08', fx), {});
  assert.deepEqual(envelopesFor(d, '2026-10', fx), { loyer: 1000, courses: 400 });
  d.settings.refCurrency = 'EUR';
  assert.equal(goalFor(d, '2026-09', fx), 688); // 860 / 1,25
});

test('abonnements : mensuel stable confirmé, prorata regroupé, achats du quotidien exclus, arrêtés ignorés', () => {
  const d = emptyData();
  d.accounts = [{ id: 'u', bank: 'revolut', name: 'U', currency: 'USD' }];
  const c = (date: string, amount: number, label: string) => tx({ accountId: 'u', date, amount, currency: 'USD', label, kind: 'Paiement par carte' });
  d.txs = [
    c('2026-08-08', -150, 'Progressive'), c('2026-09-08', -150, 'Progressive'), c('2026-10-08', -152, 'Progressive'),
    c('2026-09-15', -11.42, 'Lemonade'), c('2026-09-16', -2.08, 'Lemonade'), c('2026-10-19', -13.5, 'Lemonade'), // prorata + mois plein
    c('2026-09-02', -40, 'Walmart'), c('2026-10-02', -41, 'Walmart'), // courses : jamais un abonnement
    c('2026-05-01', -9.99, 'Vieux Service'), c('2026-06-01', -9.99, 'Vieux Service'), // arrêté depuis juin
    c('2026-10-20', -12.14, 'Spotify'), // un seul passage d'un marchand d'abonnement → probable
  ];
  const subs = detectSubscriptions(buildLedger(d).rows, '2026-11-01');
  const by = Object.fromEntries(subs.map((s) => [s.label, s]));
  assert.deepEqual(Object.keys(by).sort(), ['Lemonade', 'Progressive', 'Spotify']);
  assert.equal(by.Progressive.status, 'confirmed');
  assert.equal(by.Progressive.monthly, 150);
  assert.equal(by.Progressive.next, '2026-11-08');
  assert.equal(by.Lemonade.status, 'confirmed');
  assert.equal(by.Lemonade.monthly, 13.5);
  assert.equal(by.Spotify.status, 'probable');
});

test('export CSV relu par l\'import : même nombre d\'opérations, catégories manuelles conservées', () => {
  const d = load(parseText(REVOLUT_CSV, 'r.csv')!);
  d.txs[0].cat = 'cadeaux';
  d.txs[0].note = 'anniv, "surprise"';
  const csv = exportCsv(d);
  const back = parseText(csv, 'export.csv')!;
  assert.equal(back.format, 'Export BudgetAnalyze (CSV)');
  assert.equal(back.txs.length, d.txs.length);
  const first = back.txs.find((t) => t.cat === 'cadeaux')!;
  assert.equal(first.note, 'anniv, "surprise"');
  // réimport dans les mêmes comptes : tout est reconnu comme doublon
  const pl = planImport(d, [back], 'x');
  assert.equal(pl.txs.length, 0);
});
