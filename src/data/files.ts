// Lecture des fichiers déposés : PDF (pdf.js), Excel (.xlsx), CSV / OFX / QFX (texte, UTF-8 ou Windows-1252).
// Le format est détecté d'après le contenu ; le nom du fichier est transmis aux lecteurs (indices de banque, de devise).
import type { ParseResult } from '../domain/types';
import { buildLines, looksScrambled, parsePdfLines, parseText, parseWorkbook } from '../domain/importers';
import { extractItems, neuterToUnicode } from './pdf';
import { readXlsx } from './xlsx';

export interface FileResult {
  name: string;
  results: ParseResult[];
  error?: string;
  note?: string;
}

/** Texte d'un fichier : UTF-8 si valide, sinon Windows-1252 (exports des banques françaises). */
export function decodeText(buf: ArrayBuffer | Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('windows-1252').decode(buf);
  }
}

async function readPdf(bytes: Uint8Array): Promise<{ result: ParseResult | null; note?: string }> {
  const lines = buildLines(await extractItems(bytes));
  const first = parsePdfLines(lines);
  const ok = first && first.checks.every((c) => c.ok);
  if (ok && !looksScrambled(lines)) return { result: first };
  // police ré-encodée (PDF enregistré depuis un iPhone) : on relit sans les tables ToUnicode
  const retry = parsePdfLines(buildLines(await extractItems(neuterToUnicode(bytes))));
  if (retry && (!first || retry.checks.filter((c) => c.ok).length >= first.checks.filter((c) => c.ok).length)) {
    return { result: retry, note: first ? undefined : 'PDF ré-enregistré par iOS : texte reconstitué depuis les polices' };
  }
  return { result: first };
}

export async function readImportFile(file: File): Promise<FileResult> {
  try {
    const buf = new Uint8Array(await file.arrayBuffer());
    const lower = file.name.toLowerCase();
    const head = String.fromCharCode(...buf.slice(0, 5));
    if (head === '%PDF-' || lower.endsWith('.pdf')) {
      const { result, note } = await readPdf(buf);
      if (!result) return { name: file.name, results: [], error: "Relevé PDF non reconnu. Formats PDF lus : Bank of America (compte courant) et Crédit Agricole (relevé de comptes). Pour une autre banque, exporte plutôt en CSV ou OFX." };
      return { name: file.name, results: [result], note };
    }
    if (head.startsWith('PK') || lower.endsWith('.xlsx')) {
      const sheets = await readXlsx(buf);
      const results = parseWorkbook(sheets, file.name);
      if (!results.length) return { name: file.name, results, error: 'Classeur Excel non reconnu (ni relevé Revolut, ni fichier Budget, ni tableau Date / Libellé / Montant).' };
      return { name: file.name, results };
    }
    if (lower.endsWith('.xls') && buf[0] === 0xd0 && buf[1] === 0xcf) {
      return { name: file.name, results: [], error: 'Ancien format Excel (.xls) : ouvre-le et enregistre-le en .xlsx ou .csv, ou choisis CSV à l\'export.' };
    }
    const r = parseText(decodeText(buf), file.name);
    if (!r) return { name: file.name, results: [], error: 'Format non reconnu. Formats acceptés : Revolut (CSV/Excel), Bank of America (PDF, CSV, QFX), Crédit Agricole (PDF, CSV), OFX/QFX, fichier Budget Excel, export BudgetAnalyze, ou tout CSV avec Date / Libellé / Montant.' };
    return { name: file.name, results: [r] };
  } catch (e) {
    return { name: file.name, results: [], error: 'Lecture impossible : ' + ((e as Error).message || 'erreur inconnue') };
  }
}
