// Lignes d'un relevé PDF reconstruites à partir des fragments de texte positionnés (pdf.js) :
// les lecteurs travaillent sur des lignes (texte + position x de chaque fragment) et restent des fonctions pures, testables sans PDF.
import { squash } from '../text';

export interface PdfItem { x: number; x2: number; s: string }
export interface PdfLine { page: number; y: number; items: PdfItem[]; text: string }
export interface RawItem { page: number; x: number; y: number; w: number; s: string }

const GLYPHS = /^[¨þ■□▪•]$/; // cases à cocher et puces décoratives des relevés

/** Regroupe les fragments par ligne (tolérance verticale de 2,5 pt), de haut en bas puis de gauche à droite. */
export function buildLines(items: RawItem[]): PdfLine[] {
  const pages = new Map<number, RawItem[]>();
  for (const it of items) {
    const s = squash(it.s);
    if (!s || GLYPHS.test(s)) continue;
    if (!pages.has(it.page)) pages.set(it.page, []);
    pages.get(it.page)!.push({ ...it, s });
  }
  const out: PdfLine[] = [];
  for (const page of [...pages.keys()].sort((a, b) => a - b)) {
    const its = pages.get(page)!.sort((a, b) => b.y - a.y || a.x - b.x);
    const groups: RawItem[][] = [];
    for (const it of its) {
      const g = groups[groups.length - 1];
      if (g && Math.abs(g[0].y - it.y) <= 2.5) g.push(it);
      else groups.push([it]);
    }
    for (const g of groups) {
      g.sort((a, b) => a.x - b.x);
      const items2 = g.map((i) => ({ x: Math.round(i.x * 10) / 10, x2: Math.round((i.x + i.w) * 10) / 10, s: i.s }));
      out.push({ page, y: Math.round(g[0].y * 10) / 10, items: items2, text: squash(items2.map((i) => i.s).join(' ')) });
    }
  }
  return out;
}

/** Texte brut complet (détection du format). */
export const fullText = (lines: PdfLine[]): string => lines.map((l) => l.text).join('\n');
