// Import des relevés : dépôt de fichiers, aperçu (format reconnu, compte, période, nouveautés, doublons,
// contrôles des totaux, lignes écartées ou non reconnues listées), puis confirmation.
import { useMemo, useRef, useState } from 'react';
import { SubHeader, Switch } from '../ui/kit';
import { Icon } from '../ui/icons';
import { navigate } from '../ui/router';
import { readImportFile } from '../data/files';
import { commitImports, deleteImport } from '../data/actions';
import { useData } from '../data/store';
import { accountIdFor, planImport, resolveAccount } from '../domain/ledger';
import { dateFr, plural } from '../domain/format';
import type { AccountHint, ParseResult } from '../domain/types';

interface Item { key: number; file: string; results: ParseResult[]; note?: string; withPlan: boolean; withTxs: boolean }
let seq = 0;

export function ImportScreen() {
  const data = useData();
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [override, setOverride] = useState<Record<string, string>>({});
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const onFiles = async (files: FileList | File[]) => {
    setBusy(true);
    const next = [...items];
    const errs: string[] = [];
    for (const f of Array.from(files)) {
      const r = await readImportFile(f);
      if (r.error) errs.push(`${f.name} : ${r.error}`);
      else next.push({ key: ++seq, file: f.name, results: r.results, note: r.note, withPlan: true, withTxs: true });
    }
    setItems(next);
    setErrors(errs);
    setBusy(false);
  };

  // aperçu cumulé : chaque fichier est comparé aux données ET aux fichiers précédents de la liste
  const previews = useMemo(() => {
    let acc = { accounts: [...data.accounts], txs: [...data.txs] };
    return items.map((it) => {
      const usable = it.results.map((r) => ({ ...r, txs: it.withTxs ? r.txs : [] }));
      const p = planImport(acc, usable, 'preview', override);
      acc = { accounts: [...acc.accounts, ...p.accounts], txs: [...acc.txs, ...p.txs] };
      return p;
    });
  }, [items, data, override]);
  const total = previews.reduce((s, p) => s + p.txs.length, 0);
  const hasPlan = items.some((it) => it.withPlan && it.results.some((r) => r.plan));

  const confirm = () => {
    commitImports(items.map((it) => ({ file: it.file, results: it.results, withPlan: it.withPlan, withTxs: it.withTxs })), override);
    setItems([]);
    navigate('/synthese');
  };

  return (
    <div className="screen screen-white" data-screen="import">
      <SubHeader title="Importer des relevés" fallback="/synthese" bordered />
      <main className="content form-narrow" style={{ paddingBottom: 'calc(var(--safe-bottom) + 120px)' }}>
        <label className={'dropzone' + (drag ? ' over' : '')}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files.length) void onFiles(e.dataTransfer.files); }}>
          <span className="empty-icon" style={{ width: 64, height: 64 }}><Icon name={busy ? 'refresh' : 'fileUp'} size={30} /></span>
          <span className="t-amount-m">{busy ? 'Lecture des fichiers…' : 'Choisir des fichiers'}</span>
          <span className="t-caption c-neutral">PDF, CSV, Excel ou OFX/QFX · plusieurs à la fois · Revolut, Bank of America, Crédit Agricole, fichier Budget</span>
          <input ref={input} type="file" multiple accept=".pdf,.csv,.xlsx,.xls,.ofx,.qfx,.txt,application/pdf,text/csv" className="sr-only" onChange={(e) => { if (e.target.files?.length) void onFiles(e.target.files); e.target.value = ''; }} />
        </label>

        {errors.map((e) => <div key={e} role="alert" className="note" style={{ background: 'var(--critical-bg)', color: 'var(--critical-text)' }}><Icon name="alert" size={20} /><span>{e}</span></div>)}

        {items.map((it, i) => {
          const p = previews[i];
          const hints = [...new Map(it.results.flatMap((r) => r.txs.map((t) => [accountIdFor(t.account), t.account] as [string, AccountHint]))).entries()];
          const checks = it.results.flatMap((r) => r.checks);
          const ignored = it.results.flatMap((r) => r.ignored);
          const unrec = it.results.flatMap((r) => r.unrecognized);
          const notes = it.results.flatMap((r) => r.notes || []);
          const period = it.results.find((r) => r.period)?.period;
          const plan = it.results.find((r) => r.plan)?.plan;
          const nTx = it.results.reduce((s, r) => s + r.txs.length, 0);
          return (
            <section key={it.key} className="card g8 import-card" aria-label={it.file}>
              <div className="between" style={{ alignItems: 'flex-start' }}>
                <span className="stack" style={{ minWidth: 0 }}>
                  <span className="t-amount-m">{it.results.map((r) => r.format).join(' + ')}</span>
                  <span className="t-caption c-moderate ellipsis">{it.file}</span>
                </span>
                <button type="button" className="icon-btn neutral" aria-label="Retirer ce fichier" onClick={() => setItems(items.filter((x) => x.key !== it.key))}><Icon name="close" size={20} /></button>
              </div>
              {it.note && <p className="t-caption c-neutral row"><Icon name="info" size={16} />{it.note}</p>}
              {hints.map(([hid, h]) => {
                const resolved = resolveAccount(h, data.accounts);
                const exists = data.accounts.some((a) => a.id === resolved.id);
                const choices = data.accounts.filter((a) => a.currency === h.currency);
                return (
                  <label key={hid} className="field">
                    <span className="lbl">Compte{hints.length > 1 ? ' · ' + h.currency : ''}</span>
                    <select className="input" value={override[hid] || ''} onChange={(e) => setOverride({ ...override, [hid]: e.target.value })}>
                      <option value="">{exists ? resolved.name : 'Nouveau : ' + resolved.name}</option>
                      {choices.filter((a) => a.id !== resolved.id).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </label>
                );
              })}
              <dl className="dl t-caption">
                {period && <><dt>Période</dt><dd>{dateFr(period[0])} → {dateFr(period[1])}</dd></>}
                {nTx > 0 && <><dt>Opérations lues</dt><dd>{nTx}</dd></>}
                {nTx > 0 && <><dt>Nouvelles</dt><dd className="c-success">{p.txs.length}</dd></>}
                {p.duplicates > 0 && <><dt>Déjà importées (ignorées)</dt><dd>{p.duplicates}</dd></>}
              </dl>
              {checks.length > 0 && (
                <ul className="stack-4 t-caption checks" aria-label="Contrôles">
                  {checks.map((c, k) => <li key={k} className={c.ok ? 'c-success' : 'c-critical'}><span aria-hidden="true">{c.ok ? '✓ ' : '⚠ '}</span>{c.text}</li>)}
                </ul>
              )}
              {plan && (
                <div className="between"><span id={'pl' + it.key} className="t-caption-strong">Importer le prévisionnel (budgets, objectifs)</span><Switch checked={it.withPlan} onChange={(v) => setItems(items.map((x) => (x.key === it.key ? { ...x, withPlan: v } : x)))} labelledBy={'pl' + it.key} /></div>
              )}
              {plan && nTx > 0 && (
                <div className="between"><span id={'tx' + it.key} className="t-caption-strong">Importer le journal ({plural(nTx, 'opération', 'opérations')})</span><Switch checked={it.withTxs} onChange={(v) => setItems(items.map((x) => (x.key === it.key ? { ...x, withTxs: v } : x)))} labelledBy={'tx' + it.key} /></div>
              )}
              {notes.map((n, k) => <p key={k} className="t-caption c-neutral row" style={{ alignItems: 'flex-start' }}><Icon name="info" size={16} />{n}</p>)}
              {ignored.length > 0 && (
                <details className="t-caption c-neutral"><summary style={{ cursor: 'pointer', minHeight: 32 }}>{plural(ignored.length, 'ligne écartée', 'lignes écartées')}</summary>
                  <ul className="stack-4" style={{ paddingTop: 'var(--space-6)' }}>{ignored.map((g, k) => <li key={k}>• {g.text} — {g.reason}</li>)}</ul>
                </details>
              )}
              {unrec.length > 0 && (
                <div className="note" style={{ background: 'var(--warning-bg)', color: 'var(--warning-text)' }}>
                  <Icon name="alert" size={20} />
                  <span>{plural(unrec.length, 'ligne non reconnue, non importée', 'lignes non reconnues, non importées')} : {unrec.slice(0, 5).join(' | ')}{unrec.length > 5 ? '…' : ''}</span>
                </div>
              )}
            </section>
          );
        })}

        {items.length > 0 && (
          <button type="button" className="btn btn-primary block" disabled={!total && !hasPlan} onClick={confirm} style={{ minHeight: 48 }}>
            {total ? `Importer ${plural(total, 'opération', 'opérations')}${hasPlan ? ' et le prévisionnel' : ''}` : hasPlan ? 'Importer le prévisionnel' : 'Rien de nouveau à importer'}
          </button>
        )}

        <section className="stack-8" aria-labelledby="imp-how">
          <h2 id="imp-how" className="t-h3">Où trouver mes relevés ?</h2>
          <details className="faq" open={!data.txs.length}>
            <summary>Bank of America<Icon name="down" size={20} /></summary>
            <div className="faq-a">
              <p><strong>Le plus simple – PDF mensuel :</strong> app ou site › ton compte › <strong>Statements &amp; Documents</strong> › choisis le mois › partage ou enregistre le PDF. Un PDF enregistré depuis l'iPhone est accepté : l'app répare son texte.</p>
              <p><strong>En cours de mois – CSV :</strong> site bankofamerica.com › ton compte › lien <strong>Download</strong> au-dessus des opérations › période › <em>File type</em> : <strong>Microsoft Excel Format</strong>.</p>
            </div>
          </details>
          <details className="faq">
            <summary>Revolut<Icon name="down" size={20} /></summary>
            <div className="faq-a">
              <p>App › Accueil › touche le compte › <strong>⋯</strong> › <strong>Relevé</strong> › format <strong>Excel</strong> (CSV) › période › Générer. EUR et USD arrivent dans le même fichier : l'app crée un compte par devise et reconnaît les changes.</p>
            </div>
          </details>
          <details className="faq">
            <summary>Crédit Agricole<Icon name="down" size={20} /></summary>
            <div className="faq-a">
              <p><strong>PDF :</strong> Ma Banque › Mes documents › <strong>Relevés de compte</strong> › le mois voulu. Débit, crédit et soldes sont contrôlés à la lecture.</p>
              <p><strong>CSV :</strong> site de ta caisse › ton compte › <strong>Télécharger / exporter les opérations</strong> › CSV. (Format à confirmer avec un premier fichier : envoie-le si l'aperçu signale des lignes non reconnues.)</p>
            </div>
          </details>
          <details className="faq">
            <summary>Fichier Budget Excel<Icon name="down" size={20} /></summary>
            <div className="faq-a">
              <p>Dépose ton classeur « Budget » : le <strong>Prévisionnel</strong> devient tes enveloppes mensuelles et tes objectifs d'épargne (revenus − dépenses prévus) ; le <strong>Journal</strong> est importé comme saisie manuelle.</p>
            </div>
          </details>
          <p className="t-legal c-moderate row" style={{ alignItems: 'flex-start' }}><Icon name="shield" size={14} />Les fichiers sont lus sur ton appareil ; rien n'est envoyé ailleurs. L'app ne demande jamais d'identifiant ni de mot de passe bancaire.</p>
        </section>

        {data.imports.length > 0 && (
          <section className="stack-8" aria-labelledby="imp-hist">
            <h2 id="imp-hist" className="t-h3">Imports précédents</h2>
            <ul className="divided t-caption">
              {data.imports.slice(0, 12).map((i) => (
                <li key={i.id} className="between" style={{ padding: 'var(--space-8) 0' }}>
                  <span className="stack" style={{ minWidth: 0 }}>
                    <span className="t-caption-strong ellipsis">{i.file}</span>
                    <span className="c-moderate">{i.format} · {dateFr(i.at.slice(0, 10))} · +{i.added}{i.skipped ? ` · ${i.skipped} doublons` : ''}{i.check === 'écart' ? ' · ⚠ écart' : ''}</span>
                  </span>
                  <button type="button" className="icon-btn neutral" aria-label={'Supprimer l\'import ' + i.file + ' et ses opérations'} onClick={() => deleteImport(i.id)}><Icon name="trash" size={18} /></button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
