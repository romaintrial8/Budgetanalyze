// Analyse : répartition par catégorie, tendances mois par mois, abonnements récurrents détectés.
import { useState } from 'react';
import { AppHeader, CatIcon, catColor, ChipGroup, Empty, MonthNav, SubNav, showToast, useMonth } from '../ui/kit';
import { Icon } from '../ui/icons';
import { navigate } from '../ui/router';
import { useBudget } from '../ui/useBudget';
import { Donut, MonthBars } from '../ui/charts';
import { setSettings } from '../data/actions';
import { catOf, GROUPS, UNCAT } from '../domain/categories';
import { addMonths, dateFr, money, monthShort, pct, plural } from '../domain/format';
import { Welcome } from './Summary';

const NAV = [{ to: '/analyse', label: 'Catégories' }, { to: '/analyse/tendances', label: 'Tendances' }, { to: '/analyse/abonnements', label: 'Abonnements' }];
type Period = 'month' | '3' | '6' | 'all';

export function CategoriesScreen() {
  const b = useBudget();
  const [ym] = useMonth();
  const [period, setPeriod] = useState<Period>('month');
  const { ref } = b;
  if (!b.data.txs.length) return <div className="screen"><AppHeader title="Analyse" /><main className="content"><Welcome /></main></div>;
  const months = period === 'month' ? [ym] : period === 'all' ? b.months : Array.from({ length: +period }, (_, i) => addMonths(ym, i - +period + 1));
  const n = months.length;
  const byCat: Record<string, number> = {};
  let expenses = 0, income = 0;
  for (const x of months) {
    const m = b.month(x);
    expenses += m.expenses; income += m.income;
    for (const [c, v] of Object.entries(m.byCat)) byCat[c] = (byCat[c] || 0) + v;
  }
  const exp = Object.entries(byCat).filter(([c, v]) => (c === UNCAT || catOf(c).kind === 'expense') && v > 0.5).sort((a, c) => c[1] - a[1]);
  const inc = Object.entries(byCat).filter(([c, v]) => catOf(c).kind === 'income' && v > 0.5).sort((a, c) => c[1] - a[1]);
  const groups = GROUPS.map((g) => ({ g, v: exp.filter(([c]) => (c === UNCAT ? 'autres' : catOf(c).group) === g.id).reduce((s, [, v]) => s + v, 0) })).filter((x) => x.v > 0.5).sort((a, c) => c.v - a.v);
  const top = exp[0]?.[1] || 1;
  const go = (c: string) => navigate(`/operations?cat=${c}${period === 'month' ? '&mois=' + ym : ''}`);
  return (
    <div className="screen" data-screen="analyse">
      <AppHeader title="Analyse" />
      <SubNav label="Sections de l'analyse" items={NAV}>
        <ChipGroup label="Période" value={period} onChange={setPeriod} className="seg" options={[['month', 'Mois'], ['3', '3 mois'], ['6', '6 mois'], ['all', 'Tout']]} />
        {period !== 'all' && <MonthNav />}
      </SubNav>
      <main className="content">
        <section className="card g12" aria-labelledby="an-donut">
          <h2 id="an-donut">Dépenses {period === 'month' ? 'du mois' : n > 1 ? `de ${monthShort(months[0])} à ${monthShort(months[n - 1])}` : ''}</h2>
          {groups.length ? (
            <div className="donut-row">
              <Donut slices={groups.map((x) => ({ value: x.v, color: x.g.slot ? `var(--cat-${x.g.slot})` : 'var(--cat-0)' }))} size={150} label="Répartition des dépenses par famille">
                <span className="t-caption c-moderate">{n > 1 ? 'Total' : 'Dépenses'}</span>
                <span className="t-amount-m">{money(expenses, ref, 0)}</span>
                {n > 1 && <span className="t-caption c-moderate">{money(expenses / n, ref, 0)}/mois</span>}
              </Donut>
              <ul className="grow">
                {groups.map((x) => (
                  <li key={x.g.id} className="legend-row t-caption">
                    <span className="dot s10" style={{ background: x.g.slot ? `var(--cat-${x.g.slot})` : 'var(--cat-0)' }} />
                    <span className="ellipsis">{x.g.label}</span>
                    <span className="t-caption-strong nowrap">{pct(x.v / Math.max(1, expenses))}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : <p className="c-moderate t-caption">Aucune dépense sur la période.</p>}
        </section>

        {exp.length > 0 && (
          <section className="stack-8" aria-labelledby="an-cats">
            <h2 id="an-cats" className="t-h3">Par catégorie{n > 1 ? ' · moyenne mensuelle' : ''}</h2>
            <ul className="tile-list divided">
              {exp.map(([c, v]) => (
                <li key={c}>
                  <button type="button" className="cat-line" onClick={() => go(c)}>
                    <CatIcon id={c} size={32} />
                    <span className="stack-4 grow" style={{ minWidth: 0 }}>
                      <span className="between"><span className="t-strong ellipsis">{catOf(c).label}</span><span className="t-amount-s nowrap">{money(v / n, ref, 0)}</span></span>
                      <span className="hbar"><span style={{ width: Math.max(2, (v / top) * 100) + '%', background: catColor(c) }} /></span>
                      <span className="t-caption c-moderate">{pct(v / Math.max(1, expenses))} des dépenses{n > 1 ? ` · ${money(v, ref, 0)} au total` : ''}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {inc.length > 0 && (
          <section className="stack-8" aria-labelledby="an-inc">
            <h2 id="an-inc" className="t-h3">Revenus</h2>
            <ul className="tile-list divided">
              {inc.map(([c, v]) => (
                <li key={c}><button type="button" className="cat-line" onClick={() => go(c)}><CatIcon id={c} size={32} /><span className="between grow"><span className="t-strong">{catOf(c).label}</span><span className="t-amount-s c-success">{money(v / n, ref, 0)}{n > 1 ? '/mois' : ''}</span></span></button></li>
              ))}
            </ul>
            {months.some((x) => b.month(x).uncatIn > 0) && <p className="t-caption c-moderate">Les entrées « À classer » ({money(months.reduce((s, x) => s + b.month(x).uncatIn, 0), ref, 0)}) comptent aussi comme revenus : classe-les dans Opérations.</p>}
          </section>
        )}
      </main>
    </div>
  );
}

export function TrendsScreen() {
  const b = useBudget();
  const { ref } = b;
  const months = b.months.slice(-12);
  if (!b.data.txs.length) return <div className="screen"><AppHeader title="Analyse" /><main className="content"><Welcome /></main></div>;
  const tot = months.reduce((a, x) => { const m = b.month(x); return { i: a.i + m.income, e: a.e + m.expenses, s: a.s + m.savings, v: a.v + m.invested }; }, { i: 0, e: 0, s: 0, v: 0 });
  return (
    <div className="screen" data-screen="tendances">
      <AppHeader title="Analyse" />
      <SubNav label="Sections de l'analyse" items={NAV} />
      <main className="content">
        <section className="card g12" aria-labelledby="tr-chart">
          <h2 id="tr-chart">Revenus et dépenses</h2>
          <MonthBars months={months} cur={ref} label="Revenus et dépenses par mois" series={[
            { name: 'Revenus', color: 'var(--series-income)', values: months.map((x) => b.month(x).income) },
            { name: 'Dépenses', color: 'var(--series-expense)', values: months.map((x) => b.month(x).expenses) },
          ]} />
        </section>
        <section className="table-wrap" aria-label="Tableau mensuel">
          <table>
            <thead><tr><th scope="col">Mois</th><th scope="col">Revenus</th><th scope="col">Dépenses</th><th scope="col">Épargne</th><th scope="col">Investi</th></tr></thead>
            <tbody>
              {[...months].reverse().map((x) => { const m = b.month(x); return (
                <tr key={x}><th scope="row" className="nowrap">{monthShort(x)}</th><td>{money(m.income, ref, 0)}</td><td>{money(m.expenses, ref, 0)}</td><td className={m.savings < 0 ? 'c-critical' : 'c-success'}>{money(m.savings, ref, 0)}</td><td>{money(m.invested, ref, 0)}</td></tr>
              ); })}
              <tr className="total-row"><th scope="row">Total</th><td>{money(tot.i, ref, 0)}</td><td>{money(tot.e, ref, 0)}</td><td className={tot.s < 0 ? 'c-critical' : 'c-success'}>{money(tot.s, ref, 0)}</td><td>{money(tot.v, ref, 0)}</td></tr>
            </tbody>
          </table>
        </section>
        <p className="t-caption c-moderate">Épargne = revenus − dépenses. « Investi » = argent placé (crypto, PEA, Bitstack) : il sort de tes comptes sans être une dépense. Les virements entre tes comptes n'apparaissent nulle part.</p>
      </main>
    </div>
  );
}

const PERIOD_TEXT = { weekly: 'Hebdomadaire', monthly: 'Mensuel', yearly: 'Annuel' } as const;

export function SubscriptionsScreen() {
  const b = useBudget();
  const { ref } = b;
  const subs = b.subs;
  const confirmed = subs.filter((s) => s.status === 'confirmed');
  const probable = subs.filter((s) => s.status === 'probable');
  const monthly = subs.reduce((s, x) => s + x.monthly, 0);
  const accounts = Object.fromEntries(b.data.accounts.map((a) => [a.id, a.name]));
  const ignore = (key: string, label: string) => { setSettings((s) => { s.subsIgnored = [...s.subsIgnored, key]; }); showToast(`« ${label} » n'est plus compté comme abonnement`, { undo: () => setSettings((s) => { s.subsIgnored = s.subsIgnored.filter((k) => k !== key); }) }); };
  const list = (items: typeof subs) => (
    <ul className="tile-list divided">
      {items.map((s) => (
        <li key={s.key} className="sub-row">
          <CatIcon id={s.cat} size={36} />
          <span className="stack grow" style={{ minWidth: 0 }}>
            <span className="t-strong ellipsis">{s.label}</span>
            <span className="t-caption c-moderate ellipsis">{PERIOD_TEXT[s.period]} · {s.count > 1 ? `${s.count} passages` : '1 passage'} · prochain vers le {dateFr(s.next).slice(0, 5)}</span>
            <span className="t-caption c-moderate ellipsis">{catOf(s.cat).label} · {accounts[s.accountId] || ''}</span>
          </span>
          <span className="stack right" style={{ gap: 2 }}>
            <span className="t-amount-s nowrap">{money(s.monthly, ref)}<span className="t-caption c-moderate">/mois</span></span>
            <button type="button" className="link-btn t-caption" aria-label={`Ne pas compter ${s.label} comme abonnement`} onClick={() => ignore(s.key, s.label)}>Ignorer</button>
          </span>
        </li>
      ))}
    </ul>
  );
  return (
    <div className="screen" data-screen="abonnements">
      <AppHeader title="Analyse" />
      <SubNav label="Sections de l'analyse" items={NAV} />
      <main className="content">
        {!subs.length ? <Empty icon="repeat" title="Aucun abonnement détecté" text="Les abonnements apparaissent dès qu'un même marchand revient chaque mois (ou chaque semaine) pour un montant stable. Importe au moins deux mois de relevés." /> : (
          <>
            <section className="hero" aria-label="Coût des abonnements">
              <span className="overline">Abonnements et prélèvements récurrents</span>
              <span className="t-display">{money(monthly, ref, 0)}<span className="t-h3"> /mois</span></span>
              <span className="t-caption c-reverse-muted">Soit {money(monthly * 12, ref, 0)} par an · {plural(subs.length, 'ligne', 'lignes')}</span>
            </section>
            {confirmed.length > 0 && <section className="stack-8" aria-labelledby="sub-c"><h2 id="sub-c" className="t-h3">Confirmés</h2><p className="t-caption c-moderate">Même marchand, montant stable, à intervalle régulier.</p>{list(confirmed)}</section>}
            {probable.length > 0 && <section className="stack-8" aria-labelledby="sub-p"><h2 id="sub-p" className="t-h3">Probables</h2><p className="t-caption c-moderate">Vus une seule fois (prélèvement, service connu) ou montant variable : à confirmer avec le prochain relevé.</p>{list(probable)}</section>}
            <p className="t-caption c-moderate row" style={{ alignItems: 'flex-start' }}><Icon name="info" size={16} />Astuce : passe la liste en revue une fois par trimestre et résilie ce que tu n'utilises plus.</p>
          </>
        )}
        {b.data.settings.subsIgnored.length > 0 && <button type="button" className="btn btn-tertiary" onClick={() => setSettings((s) => { s.subsIgnored = []; })}>Réafficher les {b.data.settings.subsIgnored.length} écartés</button>}
      </main>
    </div>
  );
}

