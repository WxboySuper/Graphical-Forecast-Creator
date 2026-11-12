/* Sets the saved or preferred color theme before first paint (loaded synchronously in the head). */
(function () {
  var theme;
  try { theme = localStorage.getItem('gfc-theme'); } catch { theme = null; }
  if (theme !== 'light' && theme !== 'dark') theme = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme;
})();
