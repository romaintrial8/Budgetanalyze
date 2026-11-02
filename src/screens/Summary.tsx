// Synthèse du mois : épargne réalisée face à l'objectif, enveloppes les plus entamées, tendance, répartition.
import { AppHeader, CatIcon, catColor, Empty, Gauge, Hero, KpiGrid, MonthNav, useMonth } from '../ui/kit';
import { Icon } from '../ui/icons';
import { navigate } from '../ui/router';
import { useBudget } from '../ui/useBudget';
import { Donut, MonthBars } from '../ui/charts';
import { addMonths, daysInMonth, money, moneySigned, monthTitle, pct, plural } from '../domain/format';
import { CATEGORIES, catOf, GROUPS, UNCAT } from '../domain/categories';

export function Welcome() {
  return (
    <Empty icon="wallet" title="Bienvenue dans BudgetAnalyze"
      text="Importe tes relevés Revolut, Bank of America et Crédit Agricole (PDF, CSV ou Excel) et ton fichier Budget : l'app classe les dépenses, écarte les virements entre tes comptes et suit ton objectif d'épargne."
      action={<button type="button" className="btn btn-primary" onClick={() => navigate('/import')}><Icon name="upload" size={20} />Importer mes relevés</button>} />
  );
}

export function SummaryScreen() {
  const b = useBudget();
  const [ym, setYm] = useMonth();
  const { ref } = b;
  if (!b.data.txs.length) {
    return (
      <div className="screen" data-screen="synthese">
        <AppHeader title="Synthèse" />
        <main className="content"><Welcome /></main>
      </div>
    );
  }
  const m = b.month(ym);
  const goal = b.goal(ym);
  const env = b.envelopes(ym);
  const envTotal = Object.values(env).reduce((s, v) => s + v, 0);
  const envSpent = Object.keys(env).reduce((s, c) => s + Math.max(0, m.byCat[c] || 0), 0);
  const ratio = goal > 0 ? m.savings / goal : NaN;
  const isCurrent = ym === b.today.slice(0, 7);
  const dayCount = isCurrent ? +b.today.slice(8, 10) : daysInMonth(ym);
  const subsMonthly = b.subs.reduce((s, x) => s + x.monthly, 0);
  const last6 = Array.from({ length: 6 }, (_, i) => addMonths(ym, i - 5));
  // répartition des dépenses par famille (8 couleurs au plus), « Autres » en gris
  const byGroup = GROUPS.map((g) => ({ g, v: CATEGORIES.filter((c) => c.kind === 'expense' && c.group === g.id).reduce((s, c) => s + Math.max(0, m.byCat[c.id] || 0), 0) + (g.id === 'autres' ? Math.max(0, m.byCat[UNCAT] || 0) : 0) }))
    .filter((x) => x.v > 0.5).sort((a, b2) => b2.v - a.v);
  const envRows = Object.entries(env).map(([c, v]) => ({ c, v, s: m.byCat[c] || 0 })).sort((a, b2) => b2.s / b2.v - a.s / a.v).slice(0, 5);

  return (
    <div className="screen" data-screen="synthese">
      <AppHeader title="Synthèse" />
      <div className="subnav"><MonthNav /></div>
      <main className="content">
        <Hero label={'Épargne · ' + monthTitle(ym).toLowerCase()} value={moneySigned(m.savings, ref, 0)}>
          {goal > 0 ? (
            <div className="stack-8">
              <div className="hero-gauge" role="meter" aria-label="Progression vers l'objectif d'épargne" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.max(0, Math.round(ratio * 100))}>
                <span style={{ width: Math.min(100, Math.max(0, ratio * 100)) + '%' }} />
              </div>
              <span className="t-caption c-reverse-muted">
                {m.savings >= goal ? <>✓ Objectif de {money(goal, ref, 0)} atteint{m.savings > goal ? ` (+${money(m.savings - goal, ref, 0)})` : ''}</>
                  : <>Objectif {money(goal, ref, 0)} · {ratio > 0 ? pct(ratio) + ' atteint' : 'pas encore entamé'} · il manque {money(goal - m.savings, ref, 0)}</>}
              </span>
            </div>
          ) : (
            <button type="button" className="hero-link" onClick={() => navigate('/budget/objectifs')}>Fixer un objectif d'épargne mensuel ›</button>
          )}
          <div className="foot">
            <span>Revenus<br /><strong>{money(m.income, ref, 0)}</strong></span>
            <span>Dépenses<br /><strong>{money(m.expenses, ref, 0)}</strong></span>
            <span>Investi<br /><strong>{money(m.invested, ref, 0)}</strong></span>
          </div>
        </Hero>

        {m.uncatCount > 0 && (
          <button type="button" className="card highlight row action-card" onClick={() => navigate('/operations?filtre=aclasser&mois=' + ym)}>
            <CatIcon id={UNCAT} />
            <span className="stack grow" style={{ textAlign: 'left' }}>
              <span className="t-strong">{plural(m.uncatCount, 'opération à classer', 'opérations à classer')}</span>
              <span className="t-caption c-neutral">Comptées par défaut comme dépense ou revenu : {money(m.uncatOut, ref, 0)} sortis, {money(m.uncatIn, ref, 0)} entrés</span>
            </span>
            <Icon name="next" size={20} />
          </button>
        )}
        {m.estimated && <p className="t-caption c-moderate row"><Icon name="info" size={16} />Taux de change estimés pour une partie des opérations (taux BCE pas encore chargés).</p>}

        <KpiGrid items={[
          { id: 'rate', label: "Taux d'épargne", value: m.income > 0 ? pct(m.savings / m.income) : '—', tone: m.savings >= 0 ? 'gain' : 'loss', help: 'Part des revenus du mois qui n\'a pas été dépensée : (revenus − dépenses) ÷ revenus. Les virements entre tes comptes et l\'argent placé (crypto, PEA) n\'entrent pas dans le calcul.' },
          { id: 'env', label: 'Reste des budgets', value: envTotal ? money(envTotal - envSpent, ref, 0) : '—', tone: envTotal ? (envTotal - envSpent >= 0 ? 'gain' : 'loss') : 'neutral', help: 'Somme des enveloppes du mois moins ce qui a déjà été dépensé dans ces catégories. Les enveloppes se règlent dans l\'onglet Budget.' },
          { id: 'day', label: 'Dépense par jour', value: money(m.expenses / Math.max(1, dayCount), ref, 0), help: `Dépenses du mois divisées par ${dayCount} jour${dayCount > 1 ? 's' : ''}${isCurrent ? ' écoulés' : ''}. Repère utile pour tenir un budget sans le recalculer.` },
          { id: 'subs', label: 'Abonnements / mois', value: money(subsMonthly, ref, 0), help: 'Total des abonnements et prélèvements récurrents détectés (détail dans Analyse › Abonnements), ramené au mois.' },
        ]} />

        {envRows.length > 0 && (
          <section className="card g12" aria-labelledby="sum-env">
            <div className="between"><h2 id="sum-env">Budgets du mois</h2><button type="button" className="btn-tertiary btn" onClick={() => navigate('/budget')}>Tout voir</button></div>
            <ul className="stack-12">
              {envRows.map(({ c, v, s }) => (
                <li key={c} className="stack-4">
                  <div className="between t-caption"><span className="row t-caption-strong"><span className="dot s10" style={{ background: catColor(c) }} />{catOf(c).label}</span><span className={s > v ? 'c-critical t-caption-strong' : 'c-neutral'}>{money(s, ref, 0)} / {money(v, ref, 0)}{s > v ? ' · dépassé' : ''}</span></div>
                  <Gauge ratio={v ? s / v : 0} label={catOf(c).label} />
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="card g12" aria-labelledby="sum-trend">
          <h2 id="sum-trend">Épargne vs objectif</h2>
          <MonthBars months={last6} cur={ref} label="Épargne des six derniers mois et objectif de chaque mois" selected={ym} onSelect={setYm}
            series={[{ name: 'Épargne', color: 'var(--chart-bar)', values: last6.map((x) => b.month(x).savings) }]}
            goals={last6.map((x) => b.goal(x) || null)} />
          <p className="t-caption c-moderate">Barre = revenus − dépenses du mois · trait = objectif. Touche un mois pour l'afficher.</p>
        </section>

        {byGroup.length > 0 && (
          <section className="card g12" aria-labelledby="sum-where">
            <div className="between"><h2 id="sum-where">Où part l'argent</h2><button type="button" className="btn-tertiary btn" onClick={() => navigate('/analyse')}>Détail</button></div>
            <div className="donut-row">
              <Donut slices={byGroup.map((x) => ({ value: x.v, color: x.g.slot ? `var(--cat-${x.g.slot})` : 'var(--cat-0)' }))} size={150} label="Répartition des dépenses du mois par famille">
                <span className="t-caption c-moderate">Dépenses</span>
                <span className="t-amount-m">{money(m.expenses, ref, 0)}</span>
              </Donut>
              <ul className="grow">
                {byGroup.map((x) => (
                  <li key={x.g.id} className="legend-row t-caption">
                    <span className="dot s10" style={{ background: x.g.slot ? `var(--cat-${x.g.slot})` : 'var(--cat-0)' }} />
                    <span className="ellipsis">{x.g.label}</span>
                    <span className="t-caption-strong nowrap">{money(x.v, ref, 0)} · {pct(x.v / Math.max(1, m.expenses))}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
