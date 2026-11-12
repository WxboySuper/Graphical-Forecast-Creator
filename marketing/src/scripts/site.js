/* Shared behavior: theme toggle, sticky header, mobile menu, FAQ accordions, scroll reveal. */
(() => {
  const root = document.documentElement;
  root.classList.add('site-ready');
  const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const themeButton = document.getElementById('themeBtn');
  const label = () => themeButton && themeButton.setAttribute('aria-label', root.dataset.theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme');
  if (themeButton) {
    label();
    themeButton.addEventListener('click', () => {
      root.dataset.theme = root.dataset.theme === 'light' ? 'dark' : 'light';
      try { localStorage.setItem('gfc-theme', root.dataset.theme); } catch { /* storage unavailable */ }
      label();
    });
  }

  const top = document.getElementById('top');
  const onScroll = () => top && top.classList.toggle('scrolled', window.scrollY > 20);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  const toggle = document.getElementById('navToggle');
  const nav = document.getElementById('primaryNav');
  if (toggle && nav) {
    root.classList.add('nav-js');
    toggle.addEventListener('click', () => {
      const open = toggle.getAttribute('aria-expanded') !== 'true';
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      if (top) top.classList.toggle('menu-open', open);
    });
    const closeMenu = () => {
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'Open menu');
      if (top) top.classList.remove('menu-open');
    };
    addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
        closeMenu();
        toggle.focus();
      }
    });
    addEventListener('resize', () => { if (window.innerWidth > 980) closeMenu(); });
  }

  const current = document.body.dataset.active;
  if (current) {
    const safe = window.CSS && CSS.escape ? CSS.escape(current) : current.replace(/[^\w-]/g, '');
    try {
      document.querySelectorAll('[data-nav="' + safe + '"]').forEach((link) => link.setAttribute('aria-current', 'page'));
    } catch {
      /* an unusual data-active value only loses the active-link highlight */
    }
  }

  document.querySelectorAll('.qa button').forEach((button) => button.addEventListener('click', () => {
    const open = button.getAttribute('aria-expanded') !== 'true';
    button.setAttribute('aria-expanded', String(open));
    const item = button.closest('.qa');
    if (item) item.classList.toggle('open', open);
  }));

  const revealed = document.querySelectorAll('.reveal');
  if (reduceMotion || !('IntersectionObserver' in window)) {
    revealed.forEach((el) => el.classList.add('in'));
  } else {
    const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
      if (entry.isIntersecting) { entry.target.classList.add('in'); observer.unobserve(entry.target); }
    }), { threshold: 0.12 });
    revealed.forEach((el) => observer.observe(el));
  }
})();
