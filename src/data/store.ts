// État de l'application : données persistées localement (+ synchronisation cloud optionnelle).
import { useSyncExternalStore } from 'react';
import type { AppData, Plan, Settings } from '../domain/types';

export const DATA_VERSION = 1;
const KEY = 'budgetanalyze:data';
type Listener = () => void;

export function defaultSettings(): Settings {
  return { refCurrency: 'USD', ownNames: [], fallbackEurUsd: 1.1, subsIgnored: [], subsConfirmed: [] };
}

export function defaultPlan(): Plan {
  return { currency: 'USD', envelopes: {}, envelopesByMonth: {}, goal: 0, goalsByMonth: {}, incomeByMonth: {} };
}

export function emptyData(): AppData {
  return { version: DATA_VERSION, updatedAt: '', accounts: [], txs: [], rules: [], plan: defaultPlan(), fx: {}, imports: [], settings: defaultSettings() };
}

const obj = <T,>(v: unknown, d: T): T => (v && typeof v === 'object' && !Array.isArray(v) ? (v as T) : d);
const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/** Complète une sauvegarde (ancienne version, import JSON, cloud) avec les champs par défaut. */
export function normalize(d: Partial<AppData> | null | undefined): AppData {
  const e = emptyData();
  if (!d || typeof d !== 'object') return e;
  const p = obj<Partial<Plan>>(d.plan, {});
  return {
    version: DATA_VERSION,
    updatedAt: d.updatedAt || '',
    accounts: arr(d.accounts),
    txs: arr(d.txs),
    rules: arr(d.rules),
    plan: { ...e.plan, ...p, envelopes: obj(p.envelopes, {}), envelopesByMonth: obj(p.envelopesByMonth, {}), goalsByMonth: obj(p.goalsByMonth, {}), incomeByMonth: obj(p.incomeByMonth, {}) },
    fx: obj(d.fx, {}),
    imports: arr(d.imports),
    settings: { ...defaultSettings(), ...obj<Partial<Settings>>(d.settings, {}) },
  };
}

function load(): AppData {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch { /* stockage indisponible : on repart de zéro */ }
  return emptyData();
}

let data: AppData = typeof localStorage === 'undefined' ? emptyData() : load();
const listeners = new Set<Listener>();
const changeHooks = new Set<(d: AppData, origin: 'local' | 'remote') => void>();

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* quota ou mode privé */ }
}

export function getData(): AppData {
  return data;
}

export function subscribe(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Notifié à chaque modification (utilisé par la synchronisation cloud). */
export function onDataChange(fn: (d: AppData, origin: 'local' | 'remote') => void): () => void {
  changeHooks.add(fn);
  return () => changeHooks.delete(fn);
}

/** Toute modification passe ici : clone, application, persistance, notification. */
export function update(fn: (d: AppData) => AppData | void, opts: { touch?: boolean } = {}): void {
  const draft: AppData = structuredClone(data);
  const res = fn(draft);
  data = res || draft;
  if (opts.touch !== false) data.updatedAt = new Date().toISOString();
  persist();
  listeners.forEach((l) => l());
  changeHooks.forEach((h) => h(data, 'local'));
}

/** Remplace toutes les données (import d'une sauvegarde, synchronisation). */
export function replaceData(next: AppData, origin: 'local' | 'remote' = 'local'): void {
  data = normalize(structuredClone(next));
  if (origin === 'local') data.updatedAt = new Date().toISOString();
  persist();
  listeners.forEach((l) => l());
  changeHooks.forEach((h) => h(data, origin));
}

export function useData(): AppData {
  return useSyncExternalStore(subscribe, getData, getData);
}

export function newId(prefix: string): string {
  return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
}

// ------------------------------------------------------------ préférences locales (non synchronisées)
const PREF_KEY = 'budgetanalyze:prefs';
export interface Prefs { skipLogin: boolean; syncedUid?: string; month?: string }
export function getPrefs(): Prefs {
  try {
    return { skipLogin: false, ...JSON.parse(localStorage.getItem(PREF_KEY) || '{}') };
  } catch {
    return { skipLogin: false };
  }
}
export function setPrefs(p: Partial<Prefs>): void {
  try { localStorage.setItem(PREF_KEY, JSON.stringify({ ...getPrefs(), ...p })); } catch { /* ignore */ }
}
