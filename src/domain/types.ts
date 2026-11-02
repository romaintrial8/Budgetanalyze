// Modèle de données de BudgetAnalyze. On ne stocke que des faits (opérations importées ou saisies,
// décisions de l'utilisateur) ; catégories effectives, virements internes, totaux et abonnements sont recalculés.

export type Bank = 'revolut' | 'bofa' | 'ca' | 'manual' | 'other';

export interface Account {
  id: string;
  bank: Bank;
  name: string;
  currency: string; // devise du compte (EUR, USD…)
  number?: string; // 4 derniers chiffres si connus
  hidden?: boolean; // compte masqué des listes (ses opérations restent comptées)
}

export interface Tx {
  id: string; // = empreinte (fp) pour les imports, identifiant aléatoire pour une saisie
  accountId: string;
  date: string; // AAAA-MM-JJ : date de l'opération (date de début chez Revolut, date d'opération ailleurs)
  amount: number; // signé, dans la devise du compte : négatif = sortie
  currency: string;
  label: string; // libellé nettoyé
  raw?: string; // libellé brut du relevé (si différent)
  detail?: string; // lignes complémentaires (taux de change, référence SEPA…)
  orig?: { amount: number; currency: string }; // montant d'origine (paiement en devise)
  balance?: number; // solde après opération, si le relevé le donne
  kind?: string; // type d'opération du relevé (Carte, Virement, Changes…)
  source: string; // id de l'import ou 'manual'
  // décisions de l'utilisateur
  cat?: string; // catégorie forcée
  note?: string;
  fp: string; // empreinte de dédoublonnage
}

export type CatKind = 'expense' | 'income' | 'transfer' | 'invest';

export interface Category {
  id: string;
  label: string;
  kind: CatKind;
  group: string; // famille (couleur commune)
  icon: string;
  aliases?: string[]; // libellés équivalents (import du fichier Excel)
}

export interface Rule {
  id: string;
  pattern: string; // texte normalisé recherché dans le libellé
  cat: string;
  accountId?: string;
  sign?: 'in' | 'out'; // limite la règle aux entrées ou aux sorties
  created: string;
}

/** Budgets et objectifs : montants exprimés dans `currency` (convertis à l'affichage si la devise de référence diffère). */
export interface Plan {
  currency: string;
  envelopes: Record<string, number>; // catégorie → budget mensuel par défaut
  envelopesByMonth: Record<string, Record<string, number>>; // 'AAAA-MM' → catégorie → budget du mois
  goal: number; // objectif d'épargne mensuel par défaut
  goalsByMonth: Record<string, number>; // 'AAAA-MM' → objectif du mois
  incomeByMonth: Record<string, number>; // revenus prévus
}

export interface ImportRecord {
  id: string;
  at: string;
  file: string;
  format: string;
  accountIds: string[];
  added: number;
  skipped: number;
  period?: [string, string];
  check?: string; // résultat du contrôle des totaux
}

export interface Settings {
  refCurrency: string; // devise de référence : USD (Little Rock) ou EUR (retour en France)
  ownNames: string[]; // titulaires (« Dupont Jean ») : un virement à son propre nom est interne
  fallbackEurUsd: number; // taux de secours si les taux BCE ne sont pas encore chargés
  subsIgnored: string[]; // abonnements détectés écartés par l'utilisateur
  subsConfirmed: string[];
}

export interface AppData {
  version: number;
  updatedAt: string;
  accounts: Account[];
  txs: Tx[];
  rules: Rule[];
  plan: Plan;
  fx: Record<string, Record<string, number>>; // devise → date → valeur en USD de 1 unité
  imports: ImportRecord[];
  settings: Settings;
}

// ------------------------------------------------------------------ résultat d'un lecteur de relevé
export interface AccountHint {
  bank: Bank;
  currency: string;
  number?: string;
  name: string;
  product?: string;
}

export interface ParsedTx {
  account: AccountHint;
  date: string;
  amount: number;
  currency: string;
  label: string;
  raw?: string;
  detail?: string;
  orig?: { amount: number; currency: string };
  balance?: number;
  kind?: string;
  cat?: string; // catégorie déjà choisie (fichier Excel, export BudgetAnalyze)
  note?: string;
}

export interface Check {
  ok: boolean;
  text: string; // « Totaux du relevé vérifiés : … » ou l'écart constaté
}

export interface ParseResult {
  format: string; // libellé lisible : « Revolut (CSV) »
  txs: ParsedTx[];
  unrecognized: string[]; // lignes non comprises : listées, jamais devinées
  ignored: { text: string; reason: string }[]; // lignes volontairement écartées (en attente, annulées…)
  checks: Check[];
  holders: string[]; // titulaires lus sur le relevé
  period?: [string, string];
  // fichier Budget Excel
  plan?: Partial<Plan>;
  notes?: string[];
}
