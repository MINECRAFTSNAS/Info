'use strict';

(() => {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

  /* Opening sequence ---------------------------------------------------------- */

  const intro = $('#intro');
  const introSkip = $('[data-intro-skip]');
  const introBackground = [$('.skip-link'), $('.site-header'), $('main'), $('.site-footer')].filter(Boolean);
  let introFinished = false;
  let introCleanupTimer = 0;

  function removeIntro() {
    window.clearTimeout(introCleanupTimer);
    if (intro) intro.remove();
    introBackground.forEach((element) => { element.inert = false; });
    document.body.classList.remove('intro-active');
  }

  function finishIntro() {
    if (!intro || introFinished) return;
    introFinished = true;
    intro.classList.add('is-leaving');
    intro.setAttribute('aria-hidden', 'true');
    if (introSkip) introSkip.disabled = true;

    const hold = reducedMotion ? 220 : 1000;
    introCleanupTimer = window.setTimeout(removeIntro, hold);
  }

  if (intro) {
    introBackground.forEach((element) => { element.inert = true; });
    intro.focus({ preventScroll: true });
    introSkip?.addEventListener('click', finishIntro);

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') finishIntro();
    });

    // Give the last character enough time to land, then let the page take over.
    window.setTimeout(finishIntro, reducedMotion ? 1050 : 2800);

    // Failsafe: never leave the page locked behind the opening layer.
    window.setTimeout(() => {
      if (document.body.classList.contains('intro-active')) removeIntro();
    }, 7000);
  } else {
    document.body.classList.remove('intro-active');
  }

  /* Header, scroll progress and active navigation ----------------------------- */

  const header = $('.site-header');
  const progressBar = $('[data-scroll-progress]');
  const navLinks = $$('.nav-links a');
  const navSections = navLinks
    .map((link) => {
      const id = link.getAttribute('href');
      return { link, section: id ? $(id) : null };
    })
    .filter((item) => item.section);

  let ticking = false;

  function updateScrollUI() {
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    const progress = scrollable > 0 ? Math.min(scrollTop / scrollable, 1) : 0;

    if (progressBar) progressBar.style.width = `${progress * 100}%`;
    if (header) header.classList.toggle('is-scrolled', scrollTop > 16);

    let active = null;
    for (const item of navSections) {
      if (item.section.getBoundingClientRect().top <= 180) active = item;
    }

    for (const item of navSections) {
      item.link.classList.toggle('is-active', item === active);
      if (item === active) {
        item.link.setAttribute('aria-current', 'location');
      } else {
        item.link.removeAttribute('aria-current');
      }
    }

    ticking = false;
  }

  function requestScrollUpdate() {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(updateScrollUI);
  }

  window.addEventListener('scroll', requestScrollUpdate, { passive: true });
  window.addEventListener('resize', requestScrollUpdate);
  updateScrollUI();

  /* Visibility-aware animation pausing ---------------------------------------- */

  if ('IntersectionObserver' in window) {
    const hero = $('.hero');
    const ticker = $('.ticker');

    if (hero) {
      const heroObserver = new IntersectionObserver(
        ([entry]) => hero.classList.toggle('is-offscreen', !entry.isIntersecting),
        { rootMargin: '180px' }
      );
      heroObserver.observe(hero);
    }

    if (ticker) {
      const tickerObserver = new IntersectionObserver(
        ([entry]) => ticker.classList.toggle('is-offscreen', !entry.isIntersecting),
        { rootMargin: '100px' }
      );
      tickerObserver.observe(ticker);
    }
  }

  function syncPageVisibility() {
    document.documentElement.classList.toggle('is-page-hidden', document.hidden);
  }

  document.addEventListener('visibilitychange', syncPageVisibility);
  syncPageVisibility();

  /* Cursor glow --------------------------------------------------------------- */

  const cursorGlow = $('.cursor-glow');
  let glowTicking = false;
  let pointerX = window.innerWidth / 2;
  let pointerY = window.innerHeight / 2;

  function updateGlow() {
    document.documentElement.style.setProperty('--mx', `${pointerX}px`);
    document.documentElement.style.setProperty('--my', `${pointerY}px`);
    glowTicking = false;
  }

  if (cursorGlow && !reducedMotion && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    window.addEventListener(
      'pointermove',
      (event) => {
        if (event.pointerType && event.pointerType !== 'mouse') return;
        pointerX = event.clientX;
        pointerY = event.clientY;
        if (!glowTicking) {
          glowTicking = true;
          window.requestAnimationFrame(updateGlow);
        }
      },
      { passive: true }
    );
  } else if (cursorGlow) {
    cursorGlow.style.display = 'none';
  }

  /* Reveal on scroll ---------------------------------------------------------- */

  const revealElements = $$('[data-reveal]');

  if (reducedMotion || !('IntersectionObserver' in window)) {
    revealElements.forEach((element) => element.classList.add('is-visible'));
  } else {
    const revealObserver = new IntersectionObserver(
      (entries, observer) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -7% 0px' }
    );

    revealElements.forEach((element) => revealObserver.observe(element));
  }

  /* Number counters ----------------------------------------------------------- */

  const counters = $$('[data-count]');

  function animateCounter(element) {
    if (element.dataset.counted === 'true') return;
    element.dataset.counted = 'true';

    const target = Number.parseInt(element.dataset.count || '0', 10);
    if (!Number.isFinite(target) || target <= 0) return;

    if (reducedMotion) {
      element.textContent = String(target).padStart(element.textContent.trim().startsWith('0') ? 2 : 0, '0');
      return;
    }

    const shouldPad = element.textContent.trim().startsWith('0');
    const duration = 1500;
    const startAt = performance.now();

    function frame(now) {
      const progress = Math.min((now - startAt) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 4);
      const value = Math.round(target * eased);
      element.textContent = String(value).padStart(shouldPad ? 2 : 0, '0');
      if (progress < 1) window.requestAnimationFrame(frame);
    }

    window.requestAnimationFrame(frame);
  }

  if (counters.length) {
    if (reducedMotion || !('IntersectionObserver' in window)) {
      counters.forEach(animateCounter);
    } else {
      const counterObserver = new IntersectionObserver(
        (entries, observer) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            animateCounter(entry.target);
            observer.unobserve(entry.target);
          }
        },
        { threshold: 0.7 }
      );

      counters.forEach((counter) => counterObserver.observe(counter));
    }
  }

  /* Hero card tilt ------------------------------------------------------------ */

  const tiltCard = $('[data-tilt]');
  const canTilt =
    tiltCard &&
    !reducedMotion &&
    window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  if (canTilt) {
    tiltCard.addEventListener('pointermove', (event) => {
      if (event.pointerType && event.pointerType !== 'mouse') return;
      const rect = tiltCard.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      tiltCard.style.setProperty('--tilt-x', `${(-y * 5.5).toFixed(2)}deg`);
      tiltCard.style.setProperty('--tilt-y', `${(x * 7).toFixed(2)}deg`);
    });

    tiltCard.addEventListener('pointerleave', () => {
      tiltCard.style.setProperty('--tilt-x', '0deg');
      tiltCard.style.setProperty('--tilt-y', '0deg');
    });
  }

  /* Mobile navigation --------------------------------------------------------- */

  const navToggle = $('.nav-toggle');
  const primaryNav = $('#primary-nav');

  function closeNav() {
    if (!document.body.classList.contains('nav-open')) return;
    document.body.classList.remove('nav-open');
    if (navToggle) {
      navToggle.setAttribute('aria-expanded', 'false');
      navToggle.setAttribute('aria-label', '打开导航菜单');
    }
  }

  if (navToggle && primaryNav) {
    navToggle.addEventListener('click', () => {
      const open = document.body.classList.toggle('nav-open');
      navToggle.setAttribute('aria-expanded', String(open));
      navToggle.setAttribute('aria-label', open ? '关闭导航菜单' : '打开导航菜单');
    });

    $$('a', primaryNav).forEach((link) => {
      link.addEventListener('click', closeNav);
    });

    document.addEventListener('click', (event) => {
      if (!event.target.closest('.site-header')) closeNav();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeNav();
    });

    window.matchMedia('(min-width: 981px)').addEventListener('change', (event) => {
      if (event.matches) closeNav();
    });
  }

  /* Toast --------------------------------------------------------------------- */

  const toast = $('#toast');
  let toastTimer = 0;

  function showToast(message) {
    if (!toast) return;
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add('is-visible');
    toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 2600);
  }

  /* Copy player ID ------------------------------------------------------------ */

  const copyButton = $('#copy-id');

  function fallbackCopy(text) {
    return new Promise((resolve, reject) => {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.top = '-1000px';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();

      try {
        const copied = document.execCommand('copy');
        textarea.remove();
        copied ? resolve() : reject(new Error('copy failed'));
      } catch (error) {
        textarea.remove();
        reject(error);
      }
    });
  }

  if (copyButton) {
    copyButton.addEventListener('click', async () => {
      const value = copyButton.dataset.copy || 'MINECRAFT_SNAS';
      const label = $('span', copyButton);

      try {
        if (navigator.clipboard && window.isSecureContext) {
          try {
            await navigator.clipboard.writeText(value);
          } catch {
            await fallbackCopy(value);
          }
        } else {
          await fallbackCopy(value);
        }

        if (label) {
          const original = label.textContent;
          label.textContent = '已复制到剪贴板';
          window.setTimeout(() => {
            label.textContent = original;
          }, 1800);
        }
        showToast(`已复制 · ${value}`);
      } catch {
        showToast('复制失败，请手动选择 ID');
      }
    });
  }

  /* Footer year --------------------------------------------------------------- */

  const year = $('[data-year]');
  if (year) year.textContent = String(new Date().getFullYear());
})();
