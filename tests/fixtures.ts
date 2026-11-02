// Relevés de test ANONYMISÉS : même structure que les vrais fichiers (colonnes, positions, pièges),
// noms, numéros et montants inventés. Les totaux imprimés sont cohérents avec les lignes.
import type { PdfLine } from '../src/domain/importers';

const L = (page: number, y: number, parts: [number, number, string][]): PdfLine => ({
  page, y, items: parts.map(([x, x2, s]) => ({ x, x2, s })), text: parts.map((p) => p[2]).join(' ').replace(/\s+/g, ' ').trim(),
});

// ------------------------------------------------------------------ Revolut (CSV en français, EUR + USD dans le même fichier)
export const REVOLUT_CSV = `Type,Produit,Date de début,Date de fin,Description,Montant,Frais,Devise,État,Solde
Ajout de fonds,Valeur actuelle,2026-09-02 10:00:00,2026-09-02 10:00:01,Paiement envoyé par M. DUPONT JEAN,500.00,0.00,EUR,TERMINÉ,510.00
Paiement par carte,Valeur actuelle,2026-09-01 12:00:00,2026-09-02 12:00:00,Bitstack,-10.00,0.00,EUR,TERMINÉ,500.00
Changes,Valeur actuelle,2026-09-03 09:00:00,2026-09-03 09:00:00,Change en USD,-400.00,2.00,EUR,TERMINÉ,98.00
Virement,Valeur actuelle,2026-09-04 08:00:00,2026-09-04 08:00:02,To Jean Binance,-50.00,0.00,EUR,TERMINÉ,48.00
Paiement par carte,Valeur actuelle,2026-09-05 08:00:00,,Lidl,-8.00,0.00,EUR,EN ATTENTE,
Paiement par carte,Valeur actuelle,2026-09-05 09:00:00,2026-09-05 09:00:00,Annulé SA,-3.00,0.00,EUR,ANNULÉ,
Changes,Valeur actuelle,2026-09-03 09:00:00,2026-09-03 09:00:00,Change en USD,440.00,0.00,USD,TERMINÉ,440.00
Paiement par carte,Valeur actuelle,2026-09-06 18:00:00,2026-09-07 06:00:00,Walmart,-40.00,0.00,USD,TERMINÉ,400.00
Paiement par carte,Valeur actuelle,2026-09-06 18:05:00,2026-09-07 06:00:00,Walmart,-40.00,0.00,USD,TERMINÉ,360.00
Paiement par carte,Valeur actuelle,2026-09-08 07:00:00,2026-09-09 07:00:00,Progressive,-150.00,0.00,USD,TERMINÉ,210.00
Valider le paiement,Valeur actuelle,2026-09-30 19:00:00,2026-09-30 19:00:00,Frais d'abonnement Premium,0.00,10.00,USD,TERMINÉ,200.00
Paiement par carte,Valeur actuelle,2026-10-08 07:00:00,2026-10-09 07:00:00,Progressive,-152.00,0.00,USD,TERMINÉ,48.00
Valider le paiement,Valeur actuelle,2026-10-31 19:00:00,2026-10-31 19:00:00,Frais d'abonnement Premium,0.00,10.00,USD,TERMINÉ,38.00
`;
// Calcul à la main (soldes dans l'ordre du fichier, solde = précédent + Montant − Frais) :
// EUR : 510 ; 510 − 10 = 500 ; change : 500 − 400 − 2 (frais) = 98 ; Binance : 98 − 50 = 48.
// USD : 440 ; −40 → 400 ; −40 → 360 ; −150 → 210 ; frais Premium −10 → 200 ; −152 → 48 ; −10 → 38.
// Opérations importées : EUR 4 lignes + 1 ligne de frais de change = 5 ; USD 7 → 12 au total ; 2 lignes écartées.

// ------------------------------------------------------------------ Bank of America (PDF, texte déjà « dé-brouillé »)
export const BOFA_LINES: PdfLine[] = [
  L(1, 760, [[400, 470, 'bankofamerica.com']]),
  L(1, 640, [[40, 200, 'Your Adv Plus Banking']]),
  L(1, 620, [[40, 300, 'for September 11, 2026 to October 6, 2026'], [380, 560, 'Account number: 1111 2222 3344']]),
  L(1, 580, [[40, 300, 'Beginning balance on September 11, 2026'], [500, 540, '$0.00']]),
  L(1, 560, [[40, 260, 'Deposits and other additions'], [500, 540, '1,250.00']]),
  L(1, 540, [[40, 260, 'ATM and debit card subtractions'], [500, 540, '-180.50']]),
  L(1, 520, [[40, 260, 'Ending balance on October 6, 2026'], [500, 540, '$1,049.50']]),
  L(3, 709, [[40, 400, 'JEAN PIERRE DUPONT | Account # 1111 2222 3344 | September 11, 2026 to October 6, 2026']]),
  L(3, 660, [[40, 260, 'Deposits and other additions']]),
  L(3, 648, [[40, 60, 'Date'], [100, 160, 'Description'], [540, 570, 'Amount']]),
  L(3, 631, [[40, 80, '09/11/26'], [100, 400, 'BOFA FIN CTR 09/11 #000001111 DEPOSIT 11 MAIN ST Little Rock AR'], [540, 570, '250.00']]),
  L(3, 613, [[40, 80, '09/25/26'], [100, 450, 'ACME CORP DES:PAYROLL ID:123 INDN:Dupont Jean CO ID:999 PPD'], [530, 570, '1,000.00']]),
  L(3, 594, [[300, 450, 'Total deposits and other additions'], [520, 570, '$1,250.00']]),
  L(3, 553, [[40, 260, 'Withdrawals and other subtractions']]),
  L(3, 523, [[40, 260, 'ATM and debit card subtractions']]),
  L(3, 505, [[40, 60, 'Date'], [100, 160, 'Description'], [540, 570, 'Amount']]),
  L(3, 487, [[40, 80, '09/18/26'], [100, 460, 'CHECKCARD 0917 NOW INTERNET 8880001111 PA 22303806260003894149027'], [540, 570, '-30.00']]),
  L(3, 469, [[40, 80, '09/21/26'], [100, 460, 'BKOFAMERICA ATM 09/20 #000006339 WITHDRWL MAIN ST LITTLE ROCK AR'], [540, 570, '-20.00']]),
  L(3, 451, [[40, 80, '09/28/26'], [100, 460, 'WM SUPERCENTER 09/26 #000661881 PURCHASE 2700 S MAIN LITTLE ROCK AR'], [540, 570, '-100.50']]),
  L(3, 201, [[300, 420, 'continued on the next page']]),
  L(4, 683, [[40, 300, 'ATM and debit card subtractions - continued']]),
  L(4, 666, [[40, 60, 'Date'], [100, 160, 'Description'], [540, 570, 'Amount']]),
  L(4, 648, [[40, 80, '10/05/26'], [100, 460, 'CHECKCARD 1004 SQ *BLUE LINE ICE Malvern AR 55432866277209329483761'], [540, 570, '-30.00']]),
  L(4, 574, [[300, 460, 'Total ATM and debit card subtractions'], [520, 570, '-$180.50']]),
];
// Calcul à la main : crédits 250 + 1 000 = 1 250 ; débits 30 + 20 + 100,50 + 30 = 180,50 ; solde de fin juste = 0 + 1 250 − 180,50 = 1 069,50.
// BOFA_LINES imprime volontairement un solde de fin FAUX (1 049,50) : le contrôle doit le signaler. BOFA_GOOD imprime le bon.
export const BOFA_GOOD = BOFA_LINES.map((l) => (l.text.startsWith('Ending balance') ? L(1, 520, [[40, 260, 'Ending balance on October 6, 2026'], [500, 540, '$1,069.50']]) : l));

/** Même début de relevé, tel que le sort un PDF ré-enregistré par iOS (table de caractères faussée). */
export const BOFA_SCRAMBLED: PdfLine[] = [
  L(1, 760, [[400, 470, 'bankofamerica.com']]),
  L(1, 620, [[40, 300, 'for Se-tember 11 2026 to October 6 2026']]),
  L(3, 648, [[40, 60, '(ate'], [100, 160, '(escri-tion'], [540, 570, 'Amount']]),
  L(3, 487, [[40, 80, '09/18/26'], [100, 460, 'CHEC&CAR( 0917 NO$ INTERNET 8880001111 PA'], [540, 570, 'ñ30.00']]),
];

// ------------------------------------------------------------------ Crédit Agricole (PDF) : positions réelles des colonnes
const H = (page: number, y: number) => L(page, y, [[79, 172, 'Libellé des opérations'], [437, 459, 'Débit'], [519, 545, 'Crédit']]);
export const CA_LINES: PdfLine[] = [
  L(1, 832, [[300, 500, 'RELEVE DE COMPTES EN EUROS N° 010']]),
  L(1, 830, [[300, 400, 'CREDIT AGRICOLE']]),
  L(1, 399, [[50, 300, 'M. Dupont Jean - Compte Chèque n° 12345678901']]),
  H(1, 368),
  L(1, 346, [[206, 374, 'Ancien solde créditeur au 04.12.2026'], [518, 544, '100,00']]),
  L(1, 330, [[19, 41, '05.12'], [50, 72, '05.12'], [79, 117, 'Virement'], [123, 148, 'De M.'], [169, 222, 'Dupont Jean'], [510, 544, '1 500,00']]),
  L(1, 317, [[19, 41, '05.12'], [50, 72, '05.12'], [79, 117, 'Virement'], [123, 244, 'Vir Inst vers Jean Revolut'], [425, 459, '1 000,00']]),
  L(1, 305, [[19, 41, '06.12'], [50, 72, '06.12'], [79, 113, 'Ech Prêt'], [120, 246, '00006866398 05/12/26 Intérêts'], [438, 460, '28,33']]),
  L(1, 293, [[19, 41, '07.12'], [50, 72, '07.12'], [79, 102, 'Carte'], [117, 272, 'X1234 Netflix.com Amsterda 06/12'], [442, 459, '7,99']]),
  L(1, 40, [[300, 330, 'Page 1 /']]),
  L(2, 753, [[50, 300, 'M. Dupont Jean - Compte Chèque n° 12345678901 (suite)']]),
  H(2, 736),
  L(2, 719, [[19, 41, '29.12'], [50, 72, '29.12'], [79, 102, 'Carte'], [117, 249, 'X1234 Ysi*beacon Hill Litt 28/12'], [433, 459, '132,00']]),
  L(2, 708, [[115, 367, 'Mt initial : 153,00 USD-taux de change : 1 USD=0,86274 Eur']]),
  L(2, 683, [[19, 41, '02.01'], [50, 72, '05.01'], [79, 95, 'Prlv'], [114, 196, 'Free Mobile'], [438, 460, '19,99']]),
  L(2, 671, [[79, 192, 'FM-0000-1 FR00ZZZ000000 Core']]),
  L(2, 353, [[289, 374, 'Total des opérations'], [415, 459, '1 188,31'], [510, 544, '1 500,00']]),
  L(2, 335, [[198, 374, 'Nouveau solde créditeur au 06.01.2027'], [518, 544, '411,69']]),
];
// Calcul à la main : débits 1 000 + 28,33 + 7,99 + 132 + 19,99 = 1 188,31 ; crédits 1 500 ;
// 100 − 1 188,31 + 1 500 = 411,69. Les opérations de décembre sont en 2026, celle de janvier en 2027.
