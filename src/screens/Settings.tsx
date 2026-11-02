// Paramètres : devise de référence, comptes, titulaires, règles apprises, apparence, sauvegarde.
import { useRef, useState } from 'react';
import { CatIcon, download, Segmented, showToast, SubHeader } from '../ui/kit';
import { Icon, Logo } from '../ui/icons';
import { navigate } from '../ui/router';
import { useBudget } from '../ui/useBudget';
import { useData, normalize, replaceData, setPrefs } from '../data/store';
import { convertPlan, deleteRule, renameAccount, resetAll, setSettings } from '../data/actions';
import { signIn, signOut, useSync } from '../data/sync';
import { setThemePref, themePref, type ThemePref } from '../theme';
import { accountBalances, convert } from '../domain/calc';
import { catOf } from '../domain/categories';
import { exportCsv, exportJson } from '../domain/exporters';
import { dateFr, money, parseNum, plural, symbol, toInput, todayIso } from '../domain/format';

const BANK: Record<string, string> = { revolut: 'Revolut', bofa: 'Bank of America', ca: 'Crédit Agricole', manual: 'Saisie', other: 'Autre' };

export function SettingsScreen() {
  const data = useData();
  const b = useBudget();
  const sync = useSync();
  const [theme, setTheme] = useState<ThemePref>(themePref());
  const [name, setName] = useState('');
  const [fallback, setFallback] = useState(toInput(data.settings.fallbackEurUsd, 4));
  const restore = useRef<HTMLInputElement>(null);
  const bal = accountBalances(data);
  const ref = data.settings.refCurrency;
  const pc = data.plan.currency;
  const rateToRef = convert(1, pc, ref, todayIso(), b.ledger.fx, data.settings.fallbackEurUsd);

  return (
    <div className="screen screen-white" data-screen="parametres">
      <SubHeader title="Paramètres" fallback="/synthese" bordered />
      <main className="content form-narrow" style={{ gap: 'var(--space-24)' }}>
        <section className="stack-8" aria-labelledby="set-cur">
          <h2 id="set-cur" className="t-h3">Devise de référence</h2>
          <Segmented label="Devise de référence" value={ref} onChange={(v) => setSettings((s) => { s.refCurrency = v; })} options={[['USD', 'Dollar ($)'], ['EUR', 'Euro (€)']]} />
          <p className="t-caption c-neutral">Totaux, objectifs et graphiques s'affichent dans cette devise, au taux BCE du jour de chaque opération. Chaque opération garde sa devise d'origine.</p>
          {pc !== ref && (
            <div className="note">
              <Icon name="info" size={20} />
              <span className="stack-8">
                <span>Tes budgets et objectifs sont saisis en {symbol(pc)}. Les convertir en {symbol(ref)} (1 {symbol(pc)} = {toInput(rateToRef.value, 4)} {symbol(ref)}{rateToRef.estimated ? ', taux estimé' : ''}) ?</span>
                <button type="button" className="link-btn" onClick={() => { convertPlan(ref, rateToRef.value); showToast('Budgets et objectifs convertis en ' + symbol(ref)); }}>Convertir en {symbol(ref)}</button>
              </span>
            </div>
          )}
        </section>

        <section className="stack-8" aria-labelledby="set-acc">
          <h2 id="set-acc" className="t-h3">Comptes</h2>
          {!data.accounts.length && <p className="t-caption c-neutral">Les comptes se créent tout seuls à l'import des relevés.</p>}
          <ul className="divided">
            {data.accounts.map((a) => (
              <li key={a.id} className="stack-4" style={{ padding: 'var(--space-10) 0' }}>
                <input className="input-plain t-strong" defaultValue={a.name} aria-label={'Nom du compte ' + a.name} onBlur={(e) => { if (e.target.value.trim() !== a.name) renameAccount(a.id, e.target.value); }} />
                <span className="t-caption c-moderate">{BANK[a.bank]} · {a.currency} · {plural(bal[a.id]?.count || 0, 'opération', 'opérations')}{bal[a.id]?.balance !== null && bal[a.id]?.balance !== undefined ? ` · solde ${money(bal[a.id].balance!, a.currency)} au ${dateFr(bal[a.id].date)}` : ''}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="stack-8" aria-labelledby="set-own">
          <h2 id="set-own" className="t-h3">Titulaires</h2>
          <p className="t-caption c-neutral">Un virement dont le libellé contient ton prénom ET ton nom est un virement entre tes comptes : ni dépense ni revenu. Lus automatiquement sur tes relevés.</p>
          <div className="row wrap" style={{ gap: 'var(--space-6)' }}>
            {data.settings.ownNames.map((n) => (
              <button key={n} type="button" className="chip" onClick={() => setSettings((s) => { s.ownNames = s.ownNames.filter((x) => x !== n); })} aria-label={'Retirer ' + n}>{n}<Icon name="close" size={14} /></button>
            ))}
          </div>
          <div className="row">
            <input className="input grow" value={name} onChange={(e) => setName(e.target.value)} placeholder="Prénom Nom" aria-label="Ajouter un titulaire" />
            <button type="button" className="btn btn-secondary" disabled={name.trim().split(/\s+/).length < 2} onClick={() => { setSettings((s) => { s.ownNames = [...s.ownNames, name.trim()]; }); setName(''); }}>Ajouter</button>
          </div>
        </section>

        <section className="stack-8" aria-labelledby="set-rules">
          <h2 id="set-rules" className="t-h3">Règles de classement</h2>
          <p className="t-caption c-neutral">Créées quand tu classes une opération avec « Appliquer aux opérations similaires ». Elles s'appliquent aussi aux prochains imports.</p>
          {!data.rules.length ? <p className="t-caption c-moderate">Aucune règle pour l'instant.</p> : (
            <ul className="divided">
              {[...data.rules].sort((x, y) => x.pattern.localeCompare(y.pattern)).map((r) => (
                <li key={r.id} className="rule-row">
                  <CatIcon id={r.cat} size={28} />
                  <span className="grow t-caption" style={{ minWidth: 0 }}><span className="t-caption-strong">« {r.pattern} »</span> → {catOf(r.cat).label}{r.sign === 'in' ? ' (entrées)' : ''}</span>
                  <button type="button" className="icon-btn neutral" aria-label={'Supprimer la règle ' + r.pattern} onClick={() => deleteRule(r)}><Icon name="trash" size={18} /></button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="stack-8" aria-labelledby="set-fx">
          <h2 id="set-fx" className="t-h3">Taux de secours</h2>
          <p className="t-caption c-neutral">Utilisé seulement tant que les taux BCE ne sont pas chargés (hors ligne) et en l'absence de change Revolut le même jour.</p>
          <div className="row">
            <span className="t-caption grow">1 € =</span>
            <input className="input num" style={{ width: 110 }} inputMode="decimal" value={fallback} onChange={(e) => setFallback(e.target.value)} onBlur={() => { const n = parseNum(fallback); if (n > 0.5 && n < 2) setSettings((s) => { s.fallbackEurUsd = n; }); }} aria-label="Taux de secours euro dollar" />
            <span className="t-caption">$</span>
          </div>
        </section>

        <section className="stack-8" aria-labelledby="set-theme">
          <h2 id="set-theme" className="t-h3">Apparence</h2>
          <Segmented label="Thème" value={theme} onChange={(v) => { setTheme(v); setThemePref(v); }} options={[['system', 'Système'], ['light', 'Clair'], ['dark', 'Sombre']]} />
        </section>

        {sync.configured && (
          <section className="stack-8" aria-labelledby="set-sync">
            <h2 id="set-sync" className="t-h3">Synchronisation</h2>
            {sync.user ? (
              <><p className="t-caption c-neutral">Connecté : {sync.user.email} · {sync.state === 'ok' ? 'à jour' : sync.state === 'syncing' ? 'envoi…' : sync.error}</p>
                <button type="button" className="btn btn-secondary" onClick={() => void signOut()}><Icon name="logout" size={18} />Se déconnecter</button></>
            ) : <button type="button" className="btn btn-secondary" onClick={() => signIn().catch((e) => showToast('Connexion impossible : ' + (e as Error).message, { error: true }))}><Icon name="cloud" size={18} />Se connecter avec Google</button>}
          </section>
        )}

        <section className="stack-8" aria-labelledby="set-data">
          <h2 id="set-data" className="t-h3">Données</h2>
          <p className="t-caption c-neutral">Tout est stocké sur cet appareil{sync.user ? ' et dans ton espace privé' : ''}. Fais une sauvegarde complète de temps en temps.</p>
          <div className="grid-2 btns">
            <button type="button" className="btn btn-secondary" disabled={!data.txs.length} onClick={() => download(`budgetanalyze-operations-${todayIso()}.csv`, '﻿' + exportCsv(data))}><Icon name="download" size={18} />Export CSV</button>
            <button type="button" className="btn btn-secondary" onClick={() => download(`budgetanalyze-sauvegarde-${todayIso()}.json`, exportJson(data), 'application/json')}><Icon name="download" size={18} />Sauvegarde complète</button>
            <button type="button" className="btn btn-secondary" onClick={() => restore.current?.click()}><Icon name="upload" size={18} />Restaurer</button>
            <button type="button" className="btn btn-secondary" style={{ color: 'var(--critical-text)', borderColor: 'var(--critical-text)' }} disabled={!data.txs.length} onClick={() => resetAll()}><Icon name="trash" size={18} />Tout effacer</button>
          </div>
          <input ref={restore} type="file" accept=".json,application/json" className="sr-only" onChange={async (e) => {
            const f = e.target.files?.[0]; e.target.value = '';
            if (!f) return;
            try {
              const j = JSON.parse(await f.text());
              if (j.app !== 'BudgetAnalyze' || !Array.isArray(j.txs)) throw new Error('ce n\'est pas une sauvegarde BudgetAnalyze');
              const before = structuredClone(data);
              replaceData(normalize(j));
              showToast(`Sauvegarde restaurée : ${j.txs.length} opérations`, { undo: () => replaceData(before) });
              navigate('/synthese');
            } catch (err) { showToast('Restauration impossible : ' + (err as Error).message, { error: true }); }
          }} />
        </section>

        <section className="stack-8 center" aria-label="À propos" style={{ paddingTop: 'var(--space-16)' }}>
          <Logo size={18} />
          <p className="t-caption c-moderate">Un import par mois et 10 minutes de revue suffisent : classe les « À classer », vérifie l'objectif, regarde les abonnements. Le reste est automatique.</p>
        </section>
      </main>
    </div>
  );
}

export function LoginScreen({ onSkip }: { onSkip: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <main className="login">
      <span className="art"><Icon name="wallet" size={64} strokeWidth={2.2} /></span>
      <div className="stack-8">
        <h1 className="t-h1"><Logo size={26} /></h1>
        <p className="t-body c-neutral">Tous tes comptes, un seul budget.</p>
      </div>
      <div className="stack-12" style={{ width: '100%', maxWidth: 360 }}>
        <button type="button" className="btn btn-secondary block" disabled={busy} style={{ height: 48 }}
          onClick={async () => { setBusy(true); try { await signIn(); } catch (e) { showToast('Connexion impossible : ' + (e as Error).message, { error: true }); } finally { setBusy(false); } }}>
          {busy ? 'Connexion…' : 'Continuer avec Google'}
        </button>
        <button type="button" className="btn btn-tertiary" style={{ alignSelf: 'center' }} onClick={() => { setPrefs({ skipLogin: true }); onSkip(); }}>
          Utiliser sans compte (données sur cet appareil uniquement)
        </button>
      </div>
    </main>
  );
}

export function LoadingScreen() {
  return <div className="screen" aria-busy="true" aria-label="Chargement" />;
}
