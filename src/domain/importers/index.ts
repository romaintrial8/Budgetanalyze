// Détection automatique du format d'après le contenu (et non l'extension), puis lecture.
import type { ParseResult } from '../types';
import { parseCsv } from '../text';
import { parseRevolut } from './revolut';
import { parseBofaCsv, parseBofaPdf } from './bofa';
import { parseCaPdf, parseCaRows } from './ca';
import { parseGenericCsv, parseOfx, parseOwnCsv } from './others';
import { parseBudgetWorkbook, type Sheet } from './budgetfile';
import type { PdfLine } from './pdflines';

export type { Sheet } from './budgetfile';
export type { PdfLine, RawItem } from './pdflines';
export { buildLines } from './pdflines';

/** Tableau (CSV ou feuille Excel) → lecteur spécialisé, dans l'ordre du plus précis au plus générique. */
export function parseTable(rows: string[][], fileName: string): ParseResult | null {
  return parseOwnCsv(rows) || parseRevolut(rows) || parseBofaCsv(rows) || parseCaRows(rows, fileName) || parseGenericCsv(rows, fileName);
}

/** Classeur Excel : fichier Budget, sinon chaque feuille comme un tableau. */
export function parseWorkbook(sheets: Sheet[], fileName: string): ParseResult[] {
  const b = parseBudgetWorkbook(sheets);
  if (b) return [b];
  return sheets.map((s) => parseTable(s.rows, fileName)).filter((r): r is ParseResult => !!r);
}

/** Fichier texte : OFX/QFX ou CSV. */
export function parseText(text: string, fileName: string): ParseResult | null {
  return parseOfx(text) || parseTable(parseCsv(text), fileName);
}

/** Relevé PDF déjà découpé en lignes. */
export function parsePdfLines(lines: PdfLine[]): ParseResult | null {
  return parseBofaPdf(lines) || parseCaPdf(lines);
}

export function looksScrambled(lines: PdfLine[]): boolean {
  // police ré-encodée (PDF enregistré depuis iOS) : « (ate (escri-tion Amount », « Se-tember »
  const t = lines.slice(0, 200).map((l) => l.text).join('\n');
  return /\(escri-tion|\(ate\b|Se-tember|AT\. and debit/.test(t);
}
