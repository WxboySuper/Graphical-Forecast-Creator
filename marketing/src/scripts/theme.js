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
  // If the main script never marks the page as ready, show everything instead of leaving content collapsed.
  setTimeout(() => { if (!root.classList.contains('site-ready')) root.classList.remove('js'); }, 4000);
})();
