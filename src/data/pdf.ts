// Lecture d'un relevé PDF dans le navigateur avec pdf.js (chargé à la demande, ~1,6 Mo mis en cache hors ligne).
// Particularité : un PDF enregistré depuis un iPhone peut avoir une table de caractères faussée (ToUnicode héritée
// du fichier d'origine, codée en EBCDIC chez Bank of America). On relit alors le PDF en neutralisant ces tables :
// pdf.js retombe sur les noms de glyphes de la police (/uni0043 = « C »), qui eux sont justes.
import type { RawItem } from '../domain/importers';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Pdfjs = any;
let lib: Promise<Pdfjs> | null = null;

/**
 * Safari (iPhone compris) ne sait pas parcourir un ReadableStream avec « for await », ce que pdf.js utilise pour
 * extraire le texte (erreur « undefined is not a function »). On ajoute ce parcours s'il manque, avant de charger pdf.js.
 */
export function polyfillStreamIteration(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const RS = (globalThis as any).ReadableStream;
  if (!RS || typeof RS.prototype[Symbol.asyncIterator] === 'function') return;
  const values = function (this: ReadableStream, opts: { preventCancel?: boolean } = {}) {
    const reader = this.getReader();
    return {
      async next() {
        try {
          const r = await reader.read();
          if (r.done) reader.releaseLock();
          return r;
        } catch (e) { reader.releaseLock(); throw e; }
      },
      async return(value?: unknown) {
        if (!opts.preventCancel) { const p = reader.cancel(value); reader.releaseLock(); await p; } else reader.releaseLock();
        return { done: true, value };
      },
      [Symbol.asyncIterator]() { return this; },
    };
  };
  if (typeof RS.prototype.values !== 'function') Object.defineProperty(RS.prototype, 'values', { value: values, writable: true, configurable: true });
  Object.defineProperty(RS.prototype, Symbol.asyncIterator, { value: RS.prototype.values, writable: true, configurable: true });
}

function load(): Promise<Pdfjs> {
  if (!lib) {
    polyfillStreamIteration();
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
    for (const it of await textItems(page)) {
      if (!it.str || !it.str.trim()) continue;
      items.push({ page: p, x: it.transform[4], y: it.transform[5], w: it.width, s: it.str });
    }
  }
  await doc.destroy?.();
  return items;
}

type TextItem = { str?: string; transform: number[]; width: number };

/** Texte d'une page lu morceau par morceau (lecteur explicite : ne dépend pas de « for await », absent de Safari). */
async function textItems(page: Pdfjs): Promise<TextItem[]> {
  if (typeof page.streamTextContent !== 'function') return (await page.getTextContent()).items as TextItem[];
  const reader = page.streamTextContent().getReader();
  const out: TextItem[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out.push(...(value.items as TextItem[]));
  }
  return out;
}
