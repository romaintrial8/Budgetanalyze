// Journal des opérations : recherche, filtres (mois, compte, catégorie, à classer), recatégorisation d'un geste
// avec règle apprise, saisie manuelle.
import { useMemo, useState } from 'react';
import { AppHeader, CatIcon, ChipGroup, Empty, Fab, Sheet, Switch, showToast } from '../ui/kit';
import { Icon } from '../ui/icons';
import { closeSheet, openSheet, useRoute } from '../ui/router';
import { useBudget } from '../ui/useBudget';
import { useData } from '../data/store';
import { addManualTx, clearCategory, deleteTx, setCategory, setNote } from '../data/actions';
import { CATEGORIES, catOf, matches, ruleText, suggestPattern, UNCAT } from '../domain/categories';
import { dateFr, dayTitle, money, moneySigned, monthTitle, parseNum, plural, todayIso } from '../domain/format';
import { norm } from '../domain/text';
import type { Row } from '../domain/calc';
import { Welcome } from './Summary';

const SOURCE_TEXT: Record<string, string> = {
  manual: 'Catégorie choisie à la main',
  rule: 'Règle que tu as créée',
  pair: 'Virement entre deux de tes comptes (montants qui se répondent)',
  owner: 'Ton nom figure dans le libellé : virement vers ou depuis toi-même',
  default: 'Classement automatique (marchand connu)',
  none: 'Non classée : comptée comme dépense ou revenu tant que tu ne la classes pas',
};

export function OperationsScreen() {
  const b = useBudget();
  const route = useRoute();
  const [q, setQ] = useState('');
  const [monthF, setMonthF] = useState<string>(route.query.get('mois') || 'all');
  const [acc, setAcc] = useState<string>(route.query.get('compte') || 'all');
  const [cat, setCat] = useState<string>(route.query.get('cat') || 'all');
  const [onlyUncat, setOnlyUncat] = useState(route.query.get('filtre') === 'aclasser');
  const [hideInternal, setHideInternal] = useState(false);
  const [limit, setLimit] = useState(150);
  const { ref } = b;
  const accounts = Object.fromEntries(b.data.accounts.map((a) => [a.id, a]));

  const rows = useMemo(() => {
    const nq = norm(q);
    return b.ledger.rows.filter((r) => {
      if (monthF !== 'all' && !r.tx.date.startsWith(monthF)) return false;
      if (acc !== 'all' && r.tx.accountId !== acc) return false;
      if (cat !== 'all' && r.cat !== cat) return false;
      if (onlyUncat && r.cat !== UNCAT) return false;
      if (hideInternal && (r.kind === 'transfer' || r.kind === 'invest')) return false;
      if (nq && !norm(r.tx.label + ' ' + (r.tx.raw || '') + ' ' + (r.tx.note || '') + ' ' + catOf(r.cat).label).includes(nq)) return false;
      return true;
    });
  }, [b, q, monthF, acc, cat, onlyUncat, hideInternal]);

  if (!b.data.txs.length) {
    return <div className="screen" data-screen="operations"><AppHeader title="Opérations" /><main className="content"><Welcome /></main></div>;
  }
  const shown = rows.slice(0, limit);
  const groups: { ym: string; rows: Row[]; net: number }[] = [];
  for (const r of shown) {
    const ym = r.tx.date.slice(0, 7);
    let g = groups[groups.length - 1];
    if (!g || g.ym !== ym) groups.push((g = { ym, rows: [], net: 0 }));
    g.rows.push(r);
    if (r.kind !== 'transfer' && r.kind !== 'invest') g.net += r.ref;
  }
  const usedCats = [...new Set(b.ledger.rows.map((r) => r.cat))];

  return (
    <div className="screen" data-screen="operations">
      <AppHeader title="Opérations" />
      <div className="subnav stack-8">
        <label className="search">
          <Icon name="search" size={20} />
          <input type="search" placeholder="Rechercher un libellé, une note…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher" />
        </label>
        <div className="chips g6" role="group" aria-label="Filtres">
          <label className="chip chip-select"><select value={monthF} onChange={(e) => setMonthF(e.target.value)} aria-label="Mois">
            <option value="all">Tous les mois</option>
            {[...b.months].reverse().map((m) => <option key={m} value={m}>{monthTitle(m)}</option>)}
          </select><Icon name="down" size={16} /></label>
          <label className="chip chip-select"><select value={acc} onChange={(e) => setAcc(e.target.value)} aria-label="Compte">
            <option value="all">Tous les comptes</option>
            {b.data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select><Icon name="down" size={16} /></label>
          <label className="chip chip-select"><select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Catégorie">
            <option value="all">Toutes catégories</option>
            {[UNCAT, ...CATEGORIES.map((c) => c.id)].filter((c) => usedCats.includes(c)).map((c) => <option key={c} value={c}>{catOf(c).label}</option>)}
          </select><Icon name="down" size={16} /></label>
          <button type="button" className="chip" aria-pressed={onlyUncat} onClick={() => setOnlyUncat(!onlyUncat)}>À classer</button>
          <button type="button" className="chip" aria-pressed={hideInternal} onClick={() => setHideInternal(!hideInternal)}>Sans virements internes</button>
        </div>
      </div>
      <main className="content flush-top with-fab" style={{ paddingLeft: 0, paddingRight: 0, gap: 0 }}>
        <p className="t-caption c-moderate" style={{ padding: 'var(--space-8) var(--screen-margin)' }} aria-live="polite">{plural(rows.length, 'opération', 'opérations')}</p>
        {!rows.length && <Empty icon="search" title="Aucune opération" text="Aucune opération ne correspond à ces filtres." />}
        {groups.map((g) => (
          <section key={g.ym} aria-label={monthTitle(g.ym)}>
            <h2 className="month-header"><span>{monthTitle(g.ym)}</span><span className="total" style={{ color: g.net < 0 ? 'var(--critical-text)' : 'var(--success-text)' }}>{moneySigned(g.net, ref, 0)}</span></h2>
            <ul className="op-list">
              {g.rows.map((r) => <OpRow key={r.tx.id} r={r} accountName={accounts[r.tx.accountId]?.name || ''} refCur={ref} />)}
            </ul>
          </section>
        ))}
        {rows.length > limit && <button type="button" className="btn btn-secondary" style={{ margin: 'var(--space-16) auto' }} onClick={() => setLimit(limit + 300)}>Afficher plus ({rows.length - limit} restantes)</button>}
      </main>
      <Fab onClick={() => openSheet('ajouter')} />
    </div>
  );
}

function OpRow({ r, accountName, refCur }: { r: Row; accountName: string; refCur: string }) {
  const t = r.tx;
  const neutral = r.kind === 'transfer' || r.kind === 'invest';
  return (
    <li className="op-item">
      <button type="button" className="op-row" onClick={() => openSheet('op:' + t.id)} aria-label={`${t.label}, ${money(t.amount, t.currency)}, ${catOf(r.cat).label}`}>
        <CatIcon id={r.cat} />
        <span className="stack" style={{ minWidth: 0 }}>
          <span className="t-strong ellipsis">{t.label}</span>
          <span className="t-caption c-moderate ellipsis">{dateFr(t.date).slice(0, 5)} · {r.cat === UNCAT ? <span className="warn-text">À classer</span> : catOf(r.cat).label} · {accountName}</span>
        </span>
        <span className="stack right">
          <span className={'t-amount-s nowrap' + (neutral ? ' c-moderate' : t.amount > 0 ? ' c-success' : '')}>{moneySigned(t.amount, t.currency)}</span>
          {t.currency !== refCur && <span className="t-caption c-moderate nowrap">≈ {money(r.ref, refCur)}</span>}
        </span>
      </button>
    </li>
  );
}

// ------------------------------------------------------------------ fiche d'une opération
export function TxSheet({ id }: { id: string }) {
  const b = useBudget();
  const row = b.ledger.rows.find((r) => r.tx.id === id);
  if (!row) return null;
  return <TxSheetInner key={id} row={row} />;
}

function TxSheetInner({ row }: { row: Row }) {
  const b = useBudget();
  const data = useData();
  const t = row.tx;
  const [sel, setSel] = useState(row.cat);
  const [pattern, setPattern] = useState(suggestPattern(t.label));
  const [applyAll, setApplyAll] = useState(row.source !== 'manual' && !!suggestPattern(t.label));
  const [note, setNoteV] = useState(t.note || '');
  const acc = data.accounts.find((a) => a.id === t.accountId);
  const pairedTx = row.pairedWith ? data.txs.find((x) => x.id === row.pairedWith) : undefined;
  const p = norm(pattern);
  const matching = applyAll && p ? data.txs.filter((x) => matches(ruleText(x), p)).length : 0;
  const ruleText0 = row.source === 'rule' ? data.rules.find((r) => r.cat === row.cat && matches(ruleText(t), r.pattern))?.pattern : '';
  const changed = sel !== row.cat || (note.trim() !== (t.note || ''));

  const save = () => {
    if (sel !== row.cat || (applyAll && p)) {
      const kind = catOf(sel).kind;
      setCategory(t, sel, applyAll && p ? p : undefined, kind === 'income' ? 'in' : undefined);
    }
    if (note.trim() !== (t.note || '')) setNote(t, note);
    showToast(applyAll && p && sel !== row.cat ? `Règle « ${p} » → ${catOf(sel).label} (${plural(matching, 'opération', 'opérations')})` : 'Opération mise à jour');
    closeSheet();
  };

  const groups: [string, typeof CATEGORIES][] = [
    ['Dépenses', CATEGORIES.filter((c) => c.kind === 'expense')],
    ['Revenus', CATEGORIES.filter((c) => c.kind === 'income')],
    ['Ni dépense ni revenu', CATEGORIES.filter((c) => c.kind === 'transfer' || c.kind === 'invest')],
  ];
  return (
    <Sheet title="Opération" full footer={
      <div className="stack-8">
        <button type="button" className="btn btn-primary block" onClick={save} disabled={!changed && !(applyAll && p && sel !== row.cat)}>Enregistrer</button>
      </div>
    }>
      <div className="stack-16" style={{ paddingBottom: 'var(--space-16)' }}>
        <div className="stack-4 center">
          <span className={'t-h1' + (t.amount > 0 ? ' c-success' : '')}>{moneySigned(t.amount, t.currency)}</span>
          {t.currency !== b.ref && <span className="t-caption c-moderate">≈ {money(row.ref, b.ref)}{row.estimated ? ' (taux estimé)' : ''}</span>}
          <span className="t-strong">{t.label}</span>
          <span className="t-caption c-neutral">{dayTitle(t.date)} {t.date.slice(0, 4)} · {acc?.name}</span>
        </div>

        <div className="note" style={row.cat === UNCAT ? { background: 'var(--warning-bg)', color: 'var(--warning-text)' } : undefined}>
          <Icon name={row.cat === UNCAT ? 'alert' : 'info'} size={20} />
          <span>
            <strong>{catOf(row.cat).label}</strong> — {SOURCE_TEXT[row.source]}{ruleText0 ? ` : « ${ruleText0} »` : ''}
            {pairedTx && <> : {money(pairedTx.amount, pairedTx.currency)} le {dateFr(pairedTx.date)} sur {data.accounts.find((a) => a.id === pairedTx.accountId)?.name}</>}.
            {row.source === 'manual' && <> <button type="button" className="link-btn" onClick={() => { clearCategory(t); closeSheet(); }}>Revenir au classement automatique</button></>}
          </span>
        </div>

        {groups.map(([title, cats]) => (
          <fieldset key={title} className="stack-8 bare">
            <legend className="overline c-neutral">{title}</legend>
            <div className="cat-grid">
              {cats.map((c) => (
                <button key={c.id} type="button" className="cat-choice" aria-pressed={sel === c.id} onClick={() => setSel(c.id)}>
                  <CatIcon id={c.id} size={32} /><span>{c.label}</span>
                </button>
              ))}
            </div>
          </fieldset>
        ))}

        <div className="card g8" style={{ boxShadow: 'none', border: '1px solid var(--border-minimal)' }}>
          <div className="between">
            <span id="apply-all" className="t-strong">Appliquer aux opérations similaires</span>
            <Switch checked={applyAll} onChange={setApplyAll} labelledBy="apply-all" />
          </div>
          {applyAll && (
            <>
              <label className="field">
                <span className="hint">Toutes les opérations (passées et futures) dont le libellé contient :</span>
                <input className="input" value={pattern} onChange={(e) => setPattern(e.target.value)} aria-label="Texte recherché dans le libellé" />
              </label>
              <span className="t-caption c-moderate">{p ? plural(matching, 'opération concernée aujourd’hui', 'opérations concernées aujourd’hui') : 'Saisis un mot du libellé'}</span>
            </>
          )}
        </div>

        <label className="field">
          <span className="lbl">Note</span>
          <input className="input" value={note} onChange={(e) => setNoteV(e.target.value)} placeholder="Ex. : cadeau d'anniversaire" />
        </label>

        <details className="t-caption c-neutral">
          <summary style={{ cursor: 'pointer', minHeight: 32 }}>Détails du relevé</summary>
          <dl className="dl" style={{ paddingTop: 'var(--space-8)' }}>
            {t.raw && <><dt>Libellé brut</dt><dd style={{ wordBreak: 'break-word', fontWeight: 400 }}>{t.raw}</dd></>}
            {t.detail && <><dt>Complément</dt><dd style={{ wordBreak: 'break-word', fontWeight: 400 }}>{t.detail}</dd></>}
            {t.kind && <><dt>Type</dt><dd>{t.kind}</dd></>}
            {t.orig && <><dt>Montant d'origine</dt><dd>{money(t.orig.amount, t.orig.currency)}</dd></>}
            {t.balance !== undefined && <><dt>Solde après</dt><dd>{money(t.balance, t.currency)}</dd></>}
            <dt>Source</dt><dd>{t.source === 'manual' ? 'Saisie' : data.imports.find((i) => i.id === t.source)?.file || 'Import'}</dd>
          </dl>
        </details>
        <button type="button" className="btn btn-tertiary" style={{ color: 'var(--critical-text)', alignSelf: 'center' }} onClick={() => { deleteTx(t); closeSheet(); }}>
          <Icon name="trash" size={18} />Supprimer cette opération
        </button>
      </div>
    </Sheet>
  );
}

// ------------------------------------------------------------------ saisie manuelle (espèces, opération oubliée)
export function AddSheet() {
  const data = useData();
  const [type, setType] = useState<'out' | 'in'>('out');
  const [amount, setAmount] = useState('');
  const [cur, setCur] = useState(data.settings.refCurrency);
  const [label, setLabel] = useState('');
  const [date, setDate] = useState(todayIso());
  const [cat, setCatV] = useState('courses');
  const v = parseNum(amount);
  const ok = v > 0 && label.trim() && /^\d{4}-\d{2}-\d{2}$/.test(date);
  const cats = CATEGORIES.filter((c) => (type === 'out' ? c.kind !== 'income' : c.kind === 'income' || c.kind === 'transfer'));
  return (
    <Sheet title="Ajouter une opération" footer={<button type="button" className="btn btn-primary block" disabled={!ok} onClick={() => { addManualTx({ date, amount: type === 'out' ? -v : v, currency: cur, label: label.trim(), cat }); closeSheet(); }}>Ajouter</button>}>
      <div className="stack-16" style={{ paddingBottom: 'var(--space-16)' }}>
        <ChipGroup label="Sens" value={type} onChange={(x) => { setType(x); setCatV(x === 'out' ? 'courses' : 'salaire'); }} options={[['out', 'Dépense'], ['in', 'Revenu']]} />
        <div className="grid-2">
          <label className="field"><span className="lbl">Montant</span><input className="input num" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" /></label>
          <label className="field"><span className="lbl">Devise</span><select className="input" value={cur} onChange={(e) => setCur(e.target.value)}><option value="USD">USD ($)</option><option value="EUR">EUR (€)</option></select></label>
        </div>
        <label className="field"><span className="lbl">Libellé</span><input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex. : marché du samedi (espèces)" /></label>
        <div className="grid-2">
          <label className="field"><span className="lbl">Date</span><input className="input" type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} /></label>
          <label className="field"><span className="lbl">Catégorie</span><select className="input" value={cat} onChange={(e) => setCatV(e.target.value)}>{cats.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
        </div>
        <p className="t-caption c-moderate">À réserver aux dépenses absentes des relevés (espèces) : une opération déjà sur un relevé serait comptée deux fois.</p>
      </div>
    </Sheet>
  );
}

export function useOpSheet(): string | null {
  const route = useRoute();
  const s = route.query.get('sheet') || '';
  return s.startsWith('op:') ? s.slice(3) : null;
}

