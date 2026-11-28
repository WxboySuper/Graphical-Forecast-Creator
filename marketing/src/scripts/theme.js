/* Sets the saved or preferred color theme before first paint, and marks the page as scripted. */
(function () {
  let theme = null;
  try { theme = window.localStorage ? localStorage.getItem('gfc-theme') : null; } catch { theme = null; }
  if (theme !== 'light' && theme !== 'dark') {
    const prefersLight = typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: light)').matches;
    theme = prefersLight ? 'light' : 'dark';
  }
  document.documentElement.dataset.theme = theme;
  const root = document.documentElement;
  root.classList.add('js');
  // Time-limited deal: show deal pricing until the end instant, and the top bar unless it was dismissed.
  const promoEnds = Date.parse(root.dataset.promoEnds || '');
  if (!Number.isNaN(promoEnds) && Date.now() < promoEnds) {
    root.classList.add('deal-on');
    let dismissed = null;
    try { dismissed = window.localStorage ? localStorage.getItem('gfc-promo-dismissed') : null; } catch { dismissed = null; }
    if (dismissed !== root.dataset.promoId) root.classList.add('promo-bar-on');
  }
  // If the main script never marks the page as ready, show everything instead of leaving content collapsed.
  setTimeout(() => { if (!root.classList.contains('site-ready')) root.classList.remove('js'); }, 4000);
})();
