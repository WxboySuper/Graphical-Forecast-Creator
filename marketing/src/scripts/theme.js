/* Sets the saved or preferred color theme before first paint, and marks the page as scripted. */
(function () {
  let theme;
  try { theme = localStorage.getItem('gfc-theme'); } catch { theme = null; }
  if (theme !== 'light' && theme !== 'dark') theme = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme;
  document.documentElement.classList.add('js');
})();
