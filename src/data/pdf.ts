// Lecture d'un relevé PDF dans le navigateur avec pdf.js (chargé à la demande, ~1,6 Mo mis en cache hors ligne).
// Particularité : un PDF enregistré depuis un iPhone peut avoir une table de caractères faussée (ToUnicode héritée
// du fichier d'origine, codée en EBCDIC chez Bank of America). On relit alors le PDF en neutralisant ces tables :
// pdf.js retombe sur les noms de glyphes de la police (/uni0043 = « C »), qui eux sont justes.
import type { RawItem } from '../domain/importers';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Pdfjs = any;
let lib: Promise<Pdfjs> | null = null;

function load(): Promise<Pdfjs> {
  if (!lib) {
    const base = new URL('./', location.href).href;
    const url = base + 'pdfjs/pdf.min.mjs';
    lib = import(/* @vite-ignore */ url).then((m: Pdfjs) => {
      m.GlobalWorkerOptions.workerSrc = base + 'pdfjs/pdf.worker.min.mjs';
      return m;
    });
    lib.catch(() => { lib = null; });
  }
  return lib;
}

/** Remplace « /ToUnicode » par « /ToUnicodX » (même longueur : la table des positions du PDF reste valide). */
export function neuterToUnicode(bytes: Uint8Array): Uint8Array {
  const out = bytes.slice();
  const pat = [47, 84, 111, 85, 110, 105, 99, 111, 100, 101]; // "/ToUnicode"
  for (let i = 0; i <= out.length - pat.length; i++) {
    if (out[i] !== 47) continue;
    let k = 1;
    while (k < pat.length && out[i + k] === pat[k]) k++;
    if (k === pat.length) out[i + pat.length - 1] = 88; // 'X'
  }
  return out;
}

export async function extractItems(bytes: Uint8Array, pdfjs?: Pdfjs): Promise<RawItem[]> {
  const m = pdfjs || (await load());
  const doc = await m.getDocument({ data: bytes.slice(), verbosity: 0, isEvalSupported: false }).promise;
  const items: RawItem[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    for (const it of tc.items as { str?: string; transform: number[]; width: number }[]) {
      if (!it.str || !it.str.trim()) continue;
      items.push({ page: p, x: it.transform[4], y: it.transform[5], w: it.width, s: it.str });
    }
  }
  await doc.destroy?.();
  return items;
}
