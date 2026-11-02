import { useEffect, useState } from 'react';
import { hideSplash } from './splash';
import { HOME, navigate, useRoute } from './ui/router';
import { TabBar, ToastHost } from './ui/kit';
import { SummaryScreen } from './screens/Summary';
import { AddSheet, OperationsScreen, TxSheet, useOpSheet } from './screens/Operations';
import { EnvelopesScreen, EnvelopesSheet, GoalsScreen } from './screens/Budget';
import { CategoriesScreen, SubscriptionsScreen, TrendsScreen } from './screens/Analysis';
import { ImportScreen } from './screens/Import';
import { LoadingScreen, LoginScreen, SettingsScreen } from './screens/Settings';
import { needsLogin, useSync } from './data/sync';

const ROOTS = ['synthese', 'operations', 'budget', 'analyse', 'import', 'parametres'];

function Screen() {
  const route = useRoute();
  const [a, b] = route.parts;
  switch (a) {
    case 'operations': return <OperationsScreen key={`${route.query.get('cat')}|${route.query.get('mois')}|${route.query.get('filtre')}`} />;
    case 'budget': return b === 'objectifs' ? <GoalsScreen /> : <EnvelopesScreen />;
    case 'analyse': return b === 'tendances' ? <TrendsScreen /> : b === 'abonnements' ? <SubscriptionsScreen /> : <CategoriesScreen />;
    case 'import': return <ImportScreen />;
    case 'parametres': return <SettingsScreen />;
    default: return <SummaryScreen />;
  }
}

export function App() {
  const route = useRoute();
  const sync = useSync();
  const [, force] = useState(0);
  const sheet = route.query.get('sheet');
  const op = useOpSheet();
  const fullScreen = /^\/(import|parametres)/.test(route.path);

  useEffect(() => {
    if (!ROOTS.includes(route.parts[0])) navigate(HOME, { replace: true });
  }, [route.parts]);

  const booting = sync.configured && !sync.ready;
  useEffect(() => { if (!booting) hideSplash(); }, [booting]);
  if (booting) return <LoadingScreen />;
  if (needsLogin()) return <LoginScreen onSkip={() => force((x) => x + 1)} />;

  return (
    <>
      <div className="app-main">
        <Screen />
      </div>
      {!fullScreen && <TabBar />}
      {sheet === 'ajouter' && <AddSheet />}
      {sheet === 'budgets' && <EnvelopesSheet />}
      {op && <TxSheet id={op} />}
      <ToastHost />
    </>
  );
}
