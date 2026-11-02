// Budget : enveloppes mensuelles par catégorie et objectifs d'épargne mois par mois.
import { useState } from 'react';
import { AppHeader, CatIcon, catColor, Empty, Gauge, MonthNav, Sheet, SubNav, Switch, showToast, useMonth } from '../ui/kit';
import { Icon } from '../ui/icons';
import { closeSheet, navigate, openSheet } from '../ui/router';
import { useBudget } from '../ui/useBudget';
import { MonthBars } from '../ui/charts';
import { setPlan } from '../data/actions';
import { CATEGORIES, catOf, UNCAT } from '../domain/categories';
import { addMonths, money, monthTitle, parseNum, symbol, toInput } from '../domain/format';
import { convert } from '../domain/calc';

const NAV = [{ to: '/budget', label: 'Enveloppes' }, { to: '/budget/objectifs', label: "Objectifs d'épargne" }];

export function EnvelopesScreen() {
  const b = useBudget();
  const [ym] = useMonth();
  const { ref } = b;
  const m = b.month(ym);
  const env = b.envelopes(ym);
  const cats = Object.keys(env).sort((x, y) => (m.byCat[y] || 0) / env[y] - (m.byCat[x] || 0) / env[x]);
  const total = Object.values(env).reduce((s, v) => s + v, 0);
  const spent = cats.reduce((s, c) => s + Math.max(0, m.byCat[c] || 0), 0);
  const outside = Object.entries(m.byCat).filter(([c, v]) => !env[c] && v > 0.5 && catOf(c).kind !== 'income').sort((a, c) => c[1] - a[1]);
  const isCurrent = ym === b.today.slice(0, 7);
  return (
    <div className="screen" data-screen="budget">
      <AppHeader title="Budget" />
      <SubNav label="Sections du budget" items={NAV}><MonthNav /></SubNav>
      <main className="content">
        {!cats.length ? (
          <Empty icon="target" title="Aucun budget pour ce mois" text="Fixe une enveloppe par catégorie (loyer, courses, sorties…), ou importe ton fichier Budget Excel : son prévisionnel devient tes enveloppes."
            action={<div className="stack-8"><button type="button" className="btn btn-primary" onClick={() => openSheet('budgets')}>Définir mes budgets</button><button type="button" className="btn btn-secondary" onClick={() => navigate('/import')}>Importer le fichier Budget</button></div>} />
        ) : (
          <>
            <section className="card g12" aria-label="Total des enveloppes">
              <div className="between baseline">
                <span className="stack"><span className="overline c-neutral">Dépensé sur les budgets</span><span className="t-h2">{money(spent, ref, 0)}</span></span>
                <span className="stack right"><span className="overline c-neutral">Budget total</span><span className="t-amount-m">{money(total, ref, 0)}</span></span>
              </div>
              <Gauge ratio={total ? spent / total : 0} label="Part du budget total consommée" />
              <span className={'t-caption' + (spent > total ? ' c-critical' : ' c-neutral')}>{spent > total ? `Dépassement de ${money(spent - total, ref, 0)}` : `Reste ${money(total - spent, ref, 0)}${isCurrent ? ' pour finir le mois' : ''}`}</span>
            </section>
            <ul className="tile-list divided" aria-label="Enveloppes">
              {cats.map((c) => {
                const s = m.byCat[c] || 0, v = env[c];
                return (
                  <li key={c} className="env-row">
                    <button type="button" className="env-btn" onClick={() => navigate(`/operations?cat=${c}&mois=${ym}`)} aria-label={`${catOf(c).label} : ${money(s, ref, 0)} sur ${money(v, ref, 0)}`}>
                      <CatIcon id={c} size={36} />
                      <span className="stack-4 grow">
                        <span className="between"><span className="t-strong ellipsis">{catOf(c).label}</span><span className="t-amount-s nowrap">{money(s, ref, 0)} <span className="c-moderate t-caption">/ {money(v, ref, 0)}</span></span></span>
                        <Gauge ratio={v ? s / v : 0} label={catOf(c).label} />
                        <span className={'t-caption' + (s > v ? ' c-critical t-caption-strong' : ' c-moderate')}>{s > v ? `Dépassé de ${money(s - v, ref, 0)}` : `Reste ${money(v - s, ref, 0)}`}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
        {outside.length > 0 && (
          <section className="stack-8" aria-labelledby="env-out">
            <h2 id="env-out" className="t-h3">Hors budget</h2>
            <ul className="tile-list divided">
              {outside.map(([c, v]) => (
                <li key={c} className="legend-row" style={{ padding: 'var(--space-10) var(--space-12)', gridTemplateColumns: '10px 1fr auto' }}>
                  <span className="dot s10" style={{ background: catColor(c) }} />
                  <span className="ellipsis">{c === UNCAT ? 'À classer' : catOf(c).label}</span>
                  <span className="t-amount-s">{money(v, ref, 0)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {cats.length > 0 && <button type="button" className="btn btn-secondary block" onClick={() => openSheet('budgets')}><Icon name="pencil" size={18} />Modifier les budgets</button>}
        <PlanCurrencyNote />
      </main>
    </div>
  );
}

function PlanCurrencyNote() {
  const b = useBudget();
  const pc = b.data.plan.currency;
  if (pc === b.ref) return null;
  return <p className="t-caption c-moderate row" style={{ alignItems: 'flex-start' }}><Icon name="info" size={16} />Budgets et objectifs saisis en {symbol(pc)}, affichés en {symbol(b.ref)} au taux du jour. Pour les saisir en {symbol(b.ref)}, convertis-les dans Paramètres.</p>;
}

/** Feuille d'édition des enveloppes (montants dans la devise du plan). */
export function EnvelopesSheet() {
  const b = useBudget();
  const [ym] = useMonth();
  const plan = b.data.plan;
  const [onlyMonth, setOnlyMonth] = useState(false);
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries({ ...plan.envelopes, ...(plan.envelopesByMonth[ym] || {}) }).map(([k, v]) => [k, toInput(v, 0)])));
  // moyenne des 3 derniers mois complets, dans la devise du plan
  const avg = (c: string) => {
    const ms = [1, 2, 3].map((k) => addMonths(b.today.slice(0, 7), -k));
    const s = ms.reduce((t, x) => t + Math.max(0, b.month(x).byCat[c] || 0), 0) / 3;
    return convert(s, b.ref, plan.currency, b.today, b.ledger.fx, b.data.settings.fallbackEurUsd).value;
  };
  const save = () => {
    setPlan((p) => {
      const target: Record<string, number> = {};
      for (const [k, v] of Object.entries(vals)) { const n = parseNum(v); if (n > 0) target[k] = Math.round(n); }
      if (onlyMonth) p.envelopesByMonth[ym] = target;
      else { p.envelopes = target; delete p.envelopesByMonth[ym]; }
    });
    showToast(onlyMonth ? 'Budgets de ' + monthTitle(ym).toLowerCase() + ' enregistrés' : 'Budgets mensuels enregistrés');
    closeSheet();
  };
  return (
    <Sheet title="Budgets mensuels" full footer={<button type="button" className="btn btn-primary block" onClick={save}>Enregistrer</button>}
      head={<div className="between"><span id="only-month" className="t-caption">Seulement pour {monthTitle(ym).toLowerCase()}</span><Switch checked={onlyMonth} onChange={setOnlyMonth} labelledBy="only-month" /></div>}>
      <ul className="stack-8" style={{ paddingBottom: 'var(--space-16)' }}>
        {CATEGORIES.filter((c) => c.kind === 'expense').map((c) => {
          const a = avg(c.id);
          return (
            <li key={c.id} className="env-edit">
              <CatIcon id={c.id} size={32} />
              <span className="stack grow" style={{ minWidth: 0 }}>
                <span className="t-strong ellipsis">{c.label}</span>
                <span className="t-caption c-moderate">{a > 0.5 ? `Moy. 3 derniers mois : ${money(a, plan.currency, 0)}` : 'Pas de dépense récente'}</span>
              </span>
              <span className="input-wrap" style={{ width: 120 }}>
                <input className="input num" inputMode="decimal" aria-label={'Budget ' + c.label} value={vals[c.id] ?? ''} placeholder="—" onChange={(e) => setVals({ ...vals, [c.id]: e.target.value })} style={{ paddingRight: 32 }} />
                <span className="unit">{symbol(plan.currency)}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}

// ------------------------------------------------------------------ objectifs d'épargne
export function GoalsScreen() {
  const b = useBudget();
  const plan = b.data.plan;
  const { ref } = b;
  const [def, setDef] = useState(toInput(plan.goal, 0));
  const cur = b.today.slice(0, 7);
  const months = [...new Set([...b.months, ...Object.keys(plan.goalsByMonth), addMonths(cur, 1), addMonths(cur, 2)])].sort().filter((x) => x >= (b.months[0] || cur));
  const past = months.filter((x) => x <= cur);
  const withGoal = past.filter((x) => b.goal(x) > 0);
  const cumGoal = withGoal.reduce((s, x) => s + b.goal(x), 0);
  const cumReal = withGoal.reduce((s, x) => s + b.month(x).savings, 0);
  const chartMonths = past.slice(-12);
  return (
    <div className="screen" data-screen="objectifs">
      <AppHeader title="Budget" />
      <SubNav label="Sections du budget" items={NAV} />
      <main className="content">
        <section className="card g12" aria-labelledby="g-def">
          <h2 id="g-def">Objectif mensuel par défaut</h2>
          <p className="t-caption c-neutral">Épargne visée chaque mois = revenus − dépenses. L'argent placé (crypto, PEA, Bitstack) en fait partie ; les virements entre tes comptes n'y entrent pas.</p>
          <div className="row">
            <span className="input-wrap grow">
              <input className="input num" inputMode="decimal" value={def} onChange={(e) => setDef(e.target.value)} aria-label="Objectif mensuel par défaut" style={{ paddingRight: 32 }} />
              <span className="unit">{symbol(plan.currency)}</span>
            </span>
            <button type="button" className="btn btn-primary" onClick={() => { const n = parseNum(def); setPlan((p) => { p.goal = isNaN(n) ? 0 : Math.max(0, Math.round(n)); }); showToast('Objectif enregistré'); }}>Enregistrer</button>
          </div>
        </section>

        {withGoal.length > 0 && (
          <section className="hero" aria-label="Bilan cumulé">
            <span className="overline">Cumul depuis {monthTitle(withGoal[0]).toLowerCase()}</span>
            <span className="t-display">{money(cumReal, ref, 0)}</span>
            <span className="t-caption c-reverse-muted">{cumReal >= cumGoal ? `✓ En avance de ${money(cumReal - cumGoal, ref, 0)} sur l'objectif cumulé (${money(cumGoal, ref, 0)})` : `En retard de ${money(cumGoal - cumReal, ref, 0)} sur l'objectif cumulé (${money(cumGoal, ref, 0)})`}</span>
          </section>
        )}

        {chartMonths.length > 1 && (
          <section className="card g12" aria-labelledby="g-chart">
            <h2 id="g-chart">Épargne réalisée vs objectif</h2>
            <MonthBars months={chartMonths} cur={ref} label="Épargne de chaque mois et objectif" series={[{ name: 'Épargne', color: 'var(--chart-bar)', values: chartMonths.map((x) => b.month(x).savings) }]} goals={chartMonths.map((x) => b.goal(x) || null)} />
          </section>
        )}

        <section className="stack-8" aria-labelledby="g-months">
          <h2 id="g-months" className="t-h3">Mois par mois</h2>
          <p className="t-caption c-moderate">Laisse vide pour appliquer l'objectif par défaut. Montants en {symbol(plan.currency)}.</p>
          <ul className="tile-list divided">
            {[...months].reverse().map((x) => <GoalRow key={x} ym={x} future={x > cur} />)}
          </ul>
        </section>
        <PlanCurrencyNote />
      </main>
    </div>
  );
}

function GoalRow({ ym, future }: { ym: string; future: boolean }) {
  const b = useBudget();
  const plan = b.data.plan;
  const own = plan.goalsByMonth[ym];
  const [v, setV] = useState(own !== undefined ? toInput(own, 0) : '');
  const m = b.month(ym);
  const goal = b.goal(ym);
  const commit = () => {
    const n = parseNum(v);
    if ((v.trim() === '' && own === undefined) || n === own) return;
    setPlan((p) => { if (v.trim() === '' || isNaN(n)) delete p.goalsByMonth[ym]; else p.goalsByMonth[ym] = Math.max(0, Math.round(n)); });
  };
  const ok = m.savings >= goal;
  return (
    <li className="goal-row">
      <span className="stack" style={{ minWidth: 0 }}>
        <span className="t-strong">{monthTitle(ym)}</span>
        <span className={'t-caption' + (future ? ' c-moderate' : goal > 0 ? (ok ? ' c-success' : ' c-critical') : ' c-moderate')}>
          {future ? 'À venir' : goal > 0 ? `${ok ? '✓' : '⚠'} ${money(m.savings, b.ref, 0)} épargnés · ${ok ? '+' : ''}${money(m.savings - goal, b.ref, 0)}` : `${money(m.savings, b.ref, 0)} épargnés`}
        </span>
      </span>
      <span className="input-wrap" style={{ width: 112 }}>
        <input className="input num" inputMode="decimal" value={v} placeholder={toInput(plan.goal, 0) || '—'} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} aria-label={'Objectif de ' + monthTitle(ym)} style={{ paddingRight: 32 }} />
        <span className="unit">{symbol(plan.currency)}</span>
      </span>
    </li>
  );
}

