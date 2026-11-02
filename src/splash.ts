// Écran de lancement (logo animé de index.html) : maintenu au moins MIN ms pour que l'animation soit visible, puis retiré en fondu.
const MIN = 1500;
let done = false;

export function hideSplash(): void {
  if (done) return;
  done = true;
  const el = document.getElementById('splash');
  if (!el) return;
  const t0 = (window as unknown as { __t0?: number }).__t0 ?? Date.now();
  const wait = Math.max(0, MIN - (Date.now() - t0));
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 400);
  }, wait);
}
