// Lecture d'un classeur Excel (.xlsx) sans bibliothèque lourde : JSZip + lecture directe du XML des feuilles.
// Renvoie chaque feuille avec son nom (le fichier Budget se reconnaît à ses onglets).
import type { Sheet } from '../domain/importers';

function decodeXml(s: string): string {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&amp;/g, '&');
}

function colIndex(ref: string): number {
  const letters = /^[A-Z]+/.exec(ref)?.[0] || 'A';
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export async function readXlsx(buf: ArrayBuffer | Uint8Array): Promise<Sheet[]> {
  const JSZip = (await import('jszip')).default; // chargé à la demande : le démarrage reste léger
  const zip = await JSZip.loadAsync(buf);
  const ssXml = await zip.file('xl/sharedStrings.xml')?.async('string');
  const shared: string[] = [];
  if (ssXml) {
    for (const si of ssXml.match(/<si>[\s\S]*?<\/si>/g) || []) {
      shared.push(decodeXml((si.match(/<t[^>]*>([\s\S]*?)<\/t>/g) || []).map((t) => t.replace(/<[^>]+>/g, '')).join('')));
    }
  }
  // noms des onglets : workbook.xml (name, r:id) + workbook.xml.rels (Id → fichier)
  const wb = (await zip.file('xl/workbook.xml')?.async('string')) || '';
  const rels = (await zip.file('xl/_rels/workbook.xml.rels')?.async('string')) || '';
  const target: Record<string, string> = {};
  for (const r of rels.match(/<Relationship\b[^>]*>/g) || []) {
    const id = /\bId="([^"]+)"/.exec(r)?.[1], t = /\bTarget="([^"]+)"/.exec(r)?.[1];
    if (id && t) target[id] = 'xl/' + t.replace(/^\/?xl\//, '').replace(/^\//, '');
  }
  const order: { name: string; file: string }[] = [];
  for (const s of wb.match(/<sheet\b[^>]*>/g) || []) {
    const name = decodeXml(/\bname="([^"]*)"/.exec(s)?.[1] || '');
    const rid = /\br:id="([^"]+)"/.exec(s)?.[1] || '';
    if (target[rid]) order.push({ name, file: target[rid] });
  }
  if (!order.length) {
    for (const f of Object.keys(zip.files).filter((f) => /^xl\/worksheets\/sheet\d+\.xml$/.test(f)).sort((a, b) => parseInt(a.replace(/\D/g, '')) - parseInt(b.replace(/\D/g, '')))) order.push({ name: f, file: f });
  }
  const out: Sheet[] = [];
  for (const { name, file } of order) {
    const xml = await zip.file(file)?.async('string');
    if (!xml) continue;
    const rows: string[][] = [];
    for (const r of xml.match(/<row[^>]*>[\s\S]*?<\/row>/g) || []) {
      const row: string[] = [];
      for (const c of r.match(/<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g) || []) {
        const ref = /\br="([A-Z]+\d+)"/.exec(c)?.[1] || '';
        const type = /\bt="(\w+)"/.exec(c)?.[1] || 'n';
        let v = '';
        if (type === 'inlineStr') v = decodeXml((c.match(/<t[^>]*>([\s\S]*?)<\/t>/g) || []).map((t) => t.replace(/<[^>]+>/g, '')).join(''));
        else {
          const raw = /<v>([\s\S]*?)<\/v>/.exec(c)?.[1];
          if (raw !== undefined) v = type === 's' ? shared[+raw] ?? '' : decodeXml(raw);
        }
        const i = ref ? colIndex(ref) : row.length;
        while (row.length < i) row.push('');
        row[i] = v.trim();
      }
      if (row.some((x) => x !== '')) rows.push(row);
    }
    out.push({ name, rows });
  }
  return out;
}
