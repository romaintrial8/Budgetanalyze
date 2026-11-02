// Synchronisation cloud gratuite et optionnelle : Firebase (offre Spark, sans carte bancaire), connexion Google.
// Le SDK est chargé à la demande depuis gstatic ; tant que FIREBASE_CONFIG.apiKey est vide, l'app reste 100 % locale.
// Un seul document par utilisateur : users/{uid}/budget/main = { data (JSON), updatedAt, device }. Dernier écrivain gagne.
import { useSyncExternalStore } from 'react';
import { FIREBASE_CONFIG } from './firebase-config';
import { getData, getPrefs, onDataChange, replaceData, setPrefs } from './store';
import type { AppData } from '../domain/types';

const SDK = 'https://www.gstatic.com/firebasejs/10.14.1/';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const load = (m: string): Promise<Any> => import(/* @vite-ignore */ SDK + m);

export interface SyncStatus {
  configured: boolean;
  ready: boolean;
  user: { name: string; email: string; photo: string } | null;
  state: 'off' | 'syncing' | 'ok' | 'error';
  lastSync: string;
  error: string;
}
let authChecked = false;
const known = (() => { try { const p = getPrefs(); return !!(p.syncedUid || p.skipLogin); } catch { return false; } })();
let status: SyncStatus = { configured: !!FIREBASE_CONFIG.apiKey, ready: !FIREBASE_CONFIG.apiKey || known, user: null, state: 'off', lastSync: '', error: '' };
const listeners = new Set<() => void>();
const set = (s: Partial<SyncStatus>) => { status = { ...status, ...s }; listeners.forEach((l) => l()); };
export function useSync(): SyncStatus {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => status);
}

let auth: Any, db: Any, fa: Any, fs: Any;
let unsubDoc: (() => void) | null = null;
let lastSynced = '';
let pushTimer: ReturnType<typeof setTimeout> | undefined;

async function init(): Promise<boolean> {
  if (auth) return true;
  if (!status.configured) return false;
  try {
    const [app, a, f] = await Promise.all([load('firebase-app.js'), load('firebase-auth.js'), load('firebase-firestore.js')]);
    fa = a; fs = f;
    const fbApp = app.initializeApp(FIREBASE_CONFIG);
    auth = a.getAuth(fbApp);
    auth.languageCode = 'fr';
    db = f.initializeFirestore(fbApp, { localCache: f.persistentLocalCache() });
    return true;
  } catch (e) {
    authChecked = true;
    set({ ready: true, state: 'error', error: 'Service de synchronisation injoignable' });
    console.warn('[sync] init', e);
    return false;
  }
}

function docRef(uid: string) {
  return fs.doc(db, 'users', uid, 'budget', 'main');
}

async function push(uid: string) {
  const d = getData();
  set({ state: 'syncing' });
  try {
    // taux de change : données publiques que chaque appareil recharge lui-même
    const slim = { ...d, fx: {} };
    await fs.setDoc(docRef(uid), { data: JSON.stringify(slim), updatedAt: d.updatedAt, device: navigator.userAgent.slice(0, 120) });
    lastSynced = d.updatedAt;
    set({ state: 'ok', lastSync: new Date().toISOString(), error: '' });
  } catch (e) {
    set({ state: 'error', error: 'Envoi impossible : ' + ((e as Error).message || 'erreur') });
  }
}

function watch(uid: string) {
  unsubDoc?.();
  unsubDoc = fs.onSnapshot(docRef(uid), (snap: Any) => {
    const firstTime = getPrefs().syncedUid !== uid;
    setPrefs({ syncedUid: uid });
    if (!snap.exists()) { push(uid); return; }
    const v = snap.data() as { data: string; updatedAt: string };
    const local = getData();
    // premier passage sur cet appareil avec un portefeuille vide : le cloud prime toujours (un téléphone neuf n'écrase rien)
    const localEmpty = !local.txs.length;
    if (v.updatedAt > local.updatedAt || (firstTime && localEmpty)) {
      try {
        const remote = JSON.parse(v.data) as AppData;
        remote.fx = { ...local.fx, ...(remote.fx || {}) };
        lastSynced = remote.updatedAt;
        replaceData(remote, 'remote');
      } catch { /* document illisible */ }
    } else if (local.updatedAt > v.updatedAt) {
      push(uid);
    } else lastSynced = v.updatedAt;
    set({ state: 'ok', lastSync: new Date().toISOString(), error: '' });
  }, (e: Error) => set({ state: 'error', error: e.message }));
}

export async function startSync(): Promise<void> {
  if (!(await init())) return;
  fa.getRedirectResult(auth).catch(() => undefined);
  fa.onAuthStateChanged(auth, (u: Any) => {
    authChecked = true;
    if (u) {
      set({ ready: true, user: { name: u.displayName || '', email: u.email || '', photo: u.photoURL || '' }, state: 'syncing' });
      setPrefs({ skipLogin: false });
      watch(u.uid);
    } else {
      unsubDoc?.(); unsubDoc = null;
      set({ ready: true, user: null, state: 'off' });
    }
  });
  onDataChange((d, origin) => {
    if (origin !== 'local' || !auth?.currentUser) return;
    if (d.updatedAt <= lastSynced) return; // mise à jour automatique (taux) : rien à envoyer
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => push(auth.currentUser.uid), 1200);
  });
}

/**
 * Sur téléphone (surtout dans l'app installée), la fenêtre Google s'ouvre ailleurs et sa fermeture n'est pas toujours
 * détectée : si l'utilisateur revient dans l'app sans être connecté, on abandonne la tentative (sinon bouton bloqué).
 */
function returnedWithoutLogin(): { promise: Promise<void>; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let armed = false;
  let cleanup: () => void = () => {};
  const promise = new Promise<void>((resolve) => {
    const check = () => {
      if (!armed || document.visibilityState !== 'visible') return;
      clearTimeout(timer);
      timer = setTimeout(() => { if (!auth?.currentUser) { cleanup(); resolve(); } }, 3000);
    };
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    const arm = setTimeout(() => { armed = true; }, 800);
    cleanup = () => { clearTimeout(arm); clearTimeout(timer); window.removeEventListener('focus', check); document.removeEventListener('visibilitychange', check); };
  });
  return { promise, cancel: () => cleanup() };
}

export async function signIn(): Promise<void> {
  if (!(await init())) throw new Error('Synchronisation non configurée');
  const provider = new fa.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const back = returnedWithoutLogin();
  try {
    const popup: Promise<unknown> = fa.signInWithPopup(auth, provider);
    popup.catch(() => undefined);
    await Promise.race([popup, back.promise]);
  } catch (e) {
    const code = (e as { code?: string }).code || '';
    if (code.includes('popup-blocked') || code.includes('operation-not-supported')) await fa.signInWithRedirect(auth, provider);
    else if (!/popup-closed|cancelled-popup-request|user-cancelled/.test(code)) throw e;
  } finally {
    back.cancel();
  }
}

export async function signOut(): Promise<void> {
  if (auth) await fa.signOut(auth);
}

export async function syncNow(): Promise<void> {
  if (auth?.currentUser) await push(auth.currentUser.uid);
}

export function needsLogin(): boolean {
  return status.configured && status.ready && authChecked && !status.user && !getPrefs().skipLogin;
}
