// Catégories par défaut, règles de classement et calcul de la catégorie effective d'une opération.
// Ordre de priorité : choix manuel > règles de l'utilisateur > virement interne détecté > règles par défaut > « À classer ».
import type { Category, Rule, Tx } from './types';
import { norm } from './text';

/** Familles : une couleur par famille (8 au maximum, ordre fixe de la palette catégorielle). */
export const GROUPS: { id: string; label: string; slot: number }[] = [
  { id: 'logement', label: 'Logement', slot: 1 },
  { id: 'alimentation', label: 'Alimentation', slot: 2 },
  { id: 'transport', label: 'Transport', slot: 3 },
  { id: 'loisirs', label: 'Voyages & loisirs', slot: 4 },
  { id: 'perso', label: 'Shopping & santé', slot: 5 },
  { id: 'sport', label: 'Sport', slot: 6 },
  { id: 'services', label: 'Abonnements & téléphone', slot: 7 },
  { id: 'finances', label: 'Banque & crédits', slot: 8 },
  { id: 'autres', label: 'Autres', slot: 0 },
];

export const UNCAT = 'aclasser';

export const CATEGORIES: Category[] = [
  // dépenses
  { id: 'loyer', label: 'Loyer', kind: 'expense', group: 'logement', icon: 'home', aliases: ['rent', 'logement'] },
  { id: 'charges', label: 'Charges & Internet', kind: 'expense', group: 'logement', icon: 'zap', aliases: ['charges', 'internet', 'electricite'] },
  { id: 'courses', label: 'Courses', kind: 'expense', group: 'alimentation', icon: 'cart', aliases: ['alimentation', 'groceries'] },
  { id: 'restos', label: 'Restaurants & Sorties', kind: 'expense', group: 'alimentation', icon: 'utensils', aliases: ['restaurants', 'sorties', 'restaurant'] },
  { id: 'essence', label: 'Essence', kind: 'expense', group: 'transport', icon: 'fuel', aliases: ['carburant', 'gas'] },
  { id: 'assu_auto', label: 'Assurance voiture', kind: 'expense', group: 'transport', icon: 'shield', aliases: ['assurance auto'] },
  { id: 'auto', label: 'Voiture - Entretien', kind: 'expense', group: 'transport', icon: 'car', aliases: ['voiture', 'entretien voiture', 'voiture entretien'] },
  { id: 'transports', label: 'Transports', kind: 'expense', group: 'transport', icon: 'bus', aliases: ['transport', 'taxi', 'parking'] },
  { id: 'voyages', label: 'Voyages & Week-ends', kind: 'expense', group: 'loisirs', icon: 'plane', aliases: ['voyages', 'voyage', 'vacances'] },
  { id: 'loisirs', label: 'Loisirs & culture', kind: 'expense', group: 'loisirs', icon: 'ticket', aliases: ['loisirs', 'culture'] },
  { id: 'shopping', label: 'Shopping & maison', kind: 'expense', group: 'perso', icon: 'bag', aliases: ['shopping', 'maison', 'equipement'] },
  { id: 'sante', label: 'Santé', kind: 'expense', group: 'perso', icon: 'heart', aliases: ['medical'] },
  { id: 'sport', label: 'Sport & nutrition', kind: 'expense', group: 'sport', icon: 'activity', aliases: ['sport'] },
  { id: 'telephone', label: 'Téléphone', kind: 'expense', group: 'services', icon: 'phone', aliases: ['mobile', 'forfait'] },
  { id: 'abonnements', label: 'Abonnements', kind: 'expense', group: 'services', icon: 'repeat', aliases: ['abonnement', 'subscriptions'] },
  { id: 'frais', label: 'Frais bancaires', kind: 'expense', group: 'finances', icon: 'receipt', aliases: ['frais', 'banque'] },
  { id: 'credits', label: 'Prêt & assurances', kind: 'expense', group: 'finances', icon: 'landmark', aliases: ['pret', 'assurances', 'credit'] },
  { id: 'especes', label: "Retraits d'espèces", kind: 'expense', group: 'finances', icon: 'banknote', aliases: ['especes', 'retrait', 'cash'] },
  { id: 'cadeaux', label: 'Cadeaux & dons', kind: 'expense', group: 'autres', icon: 'gift', aliases: ['cadeaux', 'dons'] },
  { id: 'divers', label: 'Divers', kind: 'expense', group: 'autres', icon: 'sparkle', aliases: ['autre', 'autres depenses'] },
  // revenus
  { id: 'salaire', label: 'Salaire', kind: 'income', group: 'revenus', icon: 'briefcase', aliases: ['revenu - salaire', 'salaire net', 'paie'] },
  { id: 'primes', label: 'Stipend & primes', kind: 'income', group: 'revenus', icon: 'star', aliases: ['revenu - stipend', 'stipend', 'stipend (net)', 'prime', 'primes'] },
  { id: 'rembours', label: 'Remboursements reçus', kind: 'income', group: 'revenus', icon: 'undo', aliases: ['remboursement', 'remboursements'] },
  { id: 'autres_rev', label: 'Autres revenus', kind: 'income', group: 'revenus', icon: 'plusCircle', aliases: ['revenu - autre', 'autres revenus', 'aide', 'famille'] },
  // neutres
  { id: 'interne', label: 'Virement interne', kind: 'transfer', group: 'neutre', icon: 'swap', aliases: ['virement interne', 'transfert'] },
  { id: 'invest', label: 'Épargne & investissement', kind: 'invest', group: 'neutre', icon: 'trend', aliases: ['epargne', 'investissement', 'pea', 'crypto'] },
];

export const CAT_BY_ID: Record<string, Category> = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));
export const UNCAT_CAT: Category = { id: UNCAT, label: 'À classer', kind: 'expense', group: 'autres', icon: 'help' };
export const catOf = (id: string): Category => CAT_BY_ID[id] || UNCAT_CAT;

/** Catégorie d'après un libellé du fichier Excel (« Revenu - Stipend », « Voiture - Entretien »…). */
export function catFromLabel(label: string): string | null {
  const n = norm(label);
  for (const c of CATEGORIES) if (norm(c.label) === n || norm(c.id) === n) return c.id;
  for (const c of CATEGORIES) if ((c.aliases || []).some((a) => norm(a) === n)) return c.id;
  return null;
}

// ------------------------------------------------------------------ règles par défaut (marchands courants, sans donnée personnelle)
// Recherche par mot entier dans le libellé normalisé ; le motif le plus long l'emporte.
const D = (cat: string, sign: 'in' | 'out' | undefined, ...pats: string[]) => pats.map((p) => ({ p: norm(p), cat, sign }));
export const DEFAULT_RULES: { p: string; cat: string; sign?: 'in' | 'out' }[] = [
  ...D('interne', undefined, 'change en usd', 'change en eur', 'change en gbp', 'exchanged to', 'exchanged from', 'transfer to revolut', 'transfer from revolut', 'top-up by', 'credit card payment', 'online banking transfer', 'payment - thank you', 'paiement envoye par moi', 'virement interne', 'vir interne'),
  ...D('invest', undefined, 'binance', 'coinbase', 'bitstack', 'kraken', 'versement sur pea', 'versement pea', 'trade republic', 'degiro', 'boursorama bourse', 'bitpanda', 'ledger', 'robinhood', 'fidelity', 'vanguard', 'schwab', 'livret a', 'ldds', 'assurance vie'),
  ...D('courses', undefined, 'walmart', 'wal-mart', 'wm supercenter', 'kroger', "trader joe's", 'trader joes', 'fresh market', 'the fresh mark', 'whole foods', 'aldi', 'lidl', 'intermarche', 'netto', 'carrefour', 'auchan', 'leclerc', 'monoprix', 'franprix', 'super u', 'hyper u', 'casino', 'dollar general', 'dollartree', 'dollar tree', 'food giant', 'costco', "sam's club", 'safeway', 'publix', 'heb', 'grand frais', 'picard', 'marie blachere', 'boulangerie', 'colonial wine', 'liquor', 'food mart'),
  ...D('restos', undefined, "mcdonald's", 'mcdonalds', 'mc donalds', 'burger king', 'starbucks', 'kfc', 'subway', 'chipotle', 'taco bell', "wendy's", 'chick-fil-a', "domino's", 'pizza', 'bistrot', 'bistro', 'brasserie', 'restaurant', 'cafe', 'coffee', 'bar', 'pub', 'uber eats', 'deliveroo', 'doordash', 'grubhub', 'burgers', 'grill', 'sushi', 'kebab', 'electric cowboy', 'selecta', 'buffalo wild wings', 'panera', 'waffle house', "zaxby's", "raising cane's", 'sonic drive', 'braise'),
  ...D('essence', undefined, 'shell', 'exxon', 'chevron', 'texaco', 'valero', 'murphy usa', 'circle k', 'phillips 66', 'marathon petro', 'bp', 'esso', 'totalenergies', 'total access', 'eni', "buc-ee's", 'bucees', 'qt', 'quiktrip', 'station service', 'carburant'),
  ...D('assu_auto', 'out', 'progressive', 'geico', 'state farm', 'allstate', 'usaa', 'liberty mutual'),
  ...D('auto', 'out', 'dmv', 'autozone', "o'reilly auto", 'jiffy lube', 'car wash', 'pep boys', 'firestone', 'midas', 'norauto', 'feu vert', 'speedy', 'controle technique'),
  ...D('transports', 'out', 'uber', 'lyft', 'sncf', 'ratp', 'navigo', 'tam', 'parking', 'horodateur', 'horodateurs', 'park mobile', 'parkmobile', 'best park', 'blablacar', 'flixbus', 'rotate', 'peage', 'vinci autoroutes', 'aprr', 'toll'),
  ...D('voyages', 'out', 'american airlines', 'delta air', 'united airlines', 'southwest', 'air france', 'transavia', 'easyjet', 'ryanair', 'booking.com', 'airbnb', 'expedia', 'trip.com', 'hotels.com', 'marriott', 'hilton', 'hyatt', 'holiday inn', 'best western', 'hertz', 'avis', 'enterprise rent', 'sixt'),
  ...D('loisirs', 'out', 'pathe', 'ugc', 'cinema', 'amc theatres', 'museum', 'musee', 'ticketmaster', 'fnac spectacles', 'iflyworld', 'airshow', 'wings over', 'bowling', 'concert', 'steam', 'playstation', 'nintendo'),
  ...D('shopping', 'out', 'amazon', 'amzn', 'h&m', 'zara', 'uniqlo', 'target', 'home depot', 'lowes', "lowe's", 'ikea', 'action', 'bass pro', 'best buy', 'tj maxx', 'marshalls', 'ross stores', 'fnac', 'darty', 'centrakor', 'leroy merlin', 'castorama', 'cdiscount', 'temu', 'shein', 'photomaton', 'relay', 'apple store', 'decathlon'),
  ...D('sante', 'out', 'cvs', 'walgreens', 'pharmacie', 'pharmacy', 'doctolib', 'medecin', 'hospital', 'clinic', 'dentist', 'dentiste', 'optique', 'opticien', 'laboratoire', 'urgent care'),
  ...D('sport', 'out', 'myprotein', 'basic-fit', 'basic fit', 'planet fitness', 'fitness', 'gym', 'crossfit', 'ymca', 'tennis', 'padel', 'decathlon', 'go sport', 'intersport', 'nike', 'adidas', 'strava', 'garmin'),
  ...D('telephone', 'out', 'tello', 'mint mobile', 't-mobile', 'tmobile', 'at&t', 'verizon', 'cricket wireless', 'free mobile', 'orange', 'sfr', 'bouygues telecom', 'sosh', 'red by sfr'),
  ...D('charges', 'out', 'now internet', 'xfinity', 'comcast', 'spectrum', 'entergy', 'central arkansas water', 'csc serviceworks', 'edf', 'engie', 'totalenergies electricite', 'free telecom', 'freebox', 'veolia', 'suez'),
  ...D('abonnements', 'out', 'netflix', 'spotify', 'deezer', 'apple.com/bill', 'apple.com', 'icloud', 'apple', 'anthropic', 'claude.ai', 'openai', 'chatgpt', 'amazon prime', 'prime video', 'disney plus', 'disney+', 'youtube premium', 'google one', 'canal+', 'hbo', 'max.com', 'paramount', 'audible', 'kindle unlimited', 'frais d\'abonnement premium', 'frais d\'abonnement metal', 'revolut premium', 'microsoft 365', 'adobe', 'notion', 'duolingo', 'linkedin premium'),
  ...D('frais', 'out', 'tenue de compte', 'frais de tenue de compte', 'frais de livraison de carte', 'cotisation carte', 'commission', 'frais bancaires', 'agios', 'service fee', 'monthly maintenance fee', 'foreign transaction fee', 'overdraft fee', 'frais :', 'frais de change', 'mise en plac', 'prelevement sepa mise en place'),
  ...D('credits', 'out', 'ech pret', 'echeance pret', 'assu. caae', 'assurance pret', 'caae pret', 'lemonade', 'pacifica', 'assurance habitation', 'assurancehabitation', 'mutuelle', 'student loan'),
  ...D('especes', 'out', 'atm', 'withdrwl', 'withdrawal', 'retrait', 'dab', "retrait d'especes", 'cash withdrawal'),
  ...D('cadeaux', 'out', 'lydia cagnotte', 'leetchi', 'cagnotte', 'ulule', 'gofundme'),
  ...D('salaire', 'in', 'payroll', 'salaire', 'paie', 'remuneration', 'direct dep'),
  ...D('rembours', 'in', 'zelle payment from', 'virement de :', 'remboursement', 'refund', 'lydia', 'paypal'),
];

// tri : motifs les plus longs d'abord (« amazon prime » avant « amazon », « uber eats » avant « uber »)
const SORTED_DEFAULTS = [...DEFAULT_RULES].sort((a, b) => b.p.length - a.p.length);

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
const reCache = new Map<string, RegExp>();
/** Le motif apparaît-il comme mot (ou groupe de mots) entier dans le texte normalisé ? */
export function matches(text: string, pattern: string): boolean {
  let re = reCache.get(pattern);
  if (!re) {
    re = new RegExp('(^|[^a-z0-9])' + escapeRe(pattern) + '($|[^a-z0-9])');
    reCache.set(pattern, re);
  }
  return re.test(text);
}

/** Texte sur lequel portent les règles : libellé + type d'opération, sans le nom du bénéficiaire d'un virement ACH (INDN:…). */
export function ruleText(t: Pick<Tx, 'label' | 'raw' | 'kind' | 'detail'>): string {
  return norm([t.label, t.raw && t.raw !== t.label ? t.raw : '', t.detail || '', t.kind || ''].join(' '))
    .replace(/indn:[^:]*?(?= co id| [a-z]+:|$)/g, ' ')
    .replace(/\s+/g, ' ');
}

/** Le libellé mentionne-t-il un des titulaires (prénom ET nom) ? → virement vers ou depuis soi-même. */
export function mentionsOwner(text: string, ownNames: string[]): boolean {
  for (const name of ownNames) {
    const parts = norm(name).split(' ').filter((p) => p.length >= 2);
    if (parts.length < 2) continue;
    const first = parts[0], last = parts[parts.length - 1];
    if (matches(text, first) && matches(text, last)) return true;
  }
  return false;
}

export function defaultCat(text: string, amount: number): string | null {
  const sign = amount < 0 ? 'out' : 'in';
  for (const r of SORTED_DEFAULTS) {
    if (r.sign && r.sign !== sign) continue;
    if (matches(text, r.p)) return r.cat;
  }
  return null;
}

export function userRuleCat(t: Tx, text: string, rules: Rule[]): string | null {
  const sign = t.amount < 0 ? 'out' : 'in';
  let best: Rule | null = null;
  for (const r of rules) {
    if (r.accountId && r.accountId !== t.accountId) continue;
    if (r.sign && r.sign !== sign) continue;
    if (!matches(text, r.pattern)) continue;
    if (!best || r.pattern.length > best.pattern.length) best = r;
  }
  return best ? best.cat : null;
}

export type CatSource = 'manual' | 'rule' | 'pair' | 'owner' | 'default' | 'none';

/**
 * Catégorie effective d'une opération.
 * `paired` : ensemble des opérations reconnues comme les deux moitiés d'un virement entre comptes.
 */
export function categorize(t: Tx, rules: Rule[], ownNames: string[], paired: Set<string>): { cat: string; source: CatSource } {
  if (t.cat && (CAT_BY_ID[t.cat] || t.cat === UNCAT)) return { cat: t.cat, source: 'manual' };
  const text = ruleText(t);
  const u = userRuleCat(t, text, rules);
  if (u) return { cat: u, source: 'rule' };
  if (paired.has(t.id)) return { cat: 'interne', source: 'pair' };
  if (mentionsOwner(text, ownNames) && !/^(carte|card|checkcard|paiement par carte)/.test(norm(t.kind || ''))) return { cat: 'interne', source: 'owner' };
  if (norm(t.kind || '') === 'frais' && t.amount < 0) return { cat: 'frais', source: 'default' };
  const d = defaultCat(text, t.amount);
  if (d) return { cat: d, source: 'default' };
  return { cat: UNCAT, source: 'none' };
}

/**
 * Motif proposé pour une règle apprise à partir d'un libellé : on retire numéros, dates, références et préfixes de carte
 * (« CHECKCARD 0927 NOW INTERNET 8889364968 PA … » → « now internet »).
 */
export function suggestPattern(label: string): string {
  let s = norm(label)
    .replace(/^(checkcard|purchase|carte|paiement par carte|card payment|prlv|prelevement|virement|vir inst vers|vir sepa|pos)\s+/g, '')
    .replace(/\bx\d{4}\b/g, ' ')
    .replace(/#\s?\d+/g, ' ')
    .replace(/\b\d{2}[/.]\d{2}([/.]\d{2,4})?\b/g, ' ')
    .replace(/\b[a-z]*\d[a-z0-9]*\b/g, ' ')
    .replace(/[*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const words = s.split(' ').filter((w) => w.length > 1 && !['ar', 'tx', 'ca', 'ny', 'fl', 'pa', 'md', 'purchase', 'little', 'rock', 'paris'].includes(w));
  s = words.slice(0, 2).join(' ');
  return s || norm(label).slice(0, 24);
}
