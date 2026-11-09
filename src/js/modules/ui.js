// Хедер, мобільне меню, якорі, FAQ, плаваюча кнопка, прогрес, запасний стан для зображень.
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { $, $$, lockScroll, reduced, scrollToTarget, trapFocus, unlockScroll } from './env.js';

function headerAndProgress() {
  const header = $('[data-header]');
  const bar = $('.progress span');
  const fab = $('[data-fab]');
  let lastY = window.scrollY;
  let ticking = false;

  const update = () => {
    ticking = false;
    const y = window.scrollY;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    if (bar) bar.style.transform = `scaleX(${max > 0 ? Math.min(1, y / max) : 0})`;
    if (header) {
      header.classList.toggle('is-scrolled', y > 30);
      const menuOpen = document.body.classList.contains('menu-open');
      const goingDown = y > lastY + 4;
      const goingUp = y < lastY - 4;
      if (!menuOpen && goingDown && y > window.innerHeight * 0.9) header.classList.add('is-hidden');
      else if (goingUp || y < 120 || menuOpen) header.classList.remove('is-hidden');
    }
    if (fab) fab.classList.toggle('is-visible', y > window.innerHeight * 0.6);
    lastY = y;
  };
  window.addEventListener(
    'scroll',
    () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    },
    { passive: true },
  );
  window.addEventListener('resize', update, { passive: true });
  update();

  // Активний пункт меню
  const links = $$('.nav__link');
  if ('IntersectionObserver' in window && links.length) {
    const byId = new Map(links.map((a) => [a.getAttribute('href').slice(1), a]));
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (!en.isIntersecting) return;
          links.forEach((a) => a.classList.remove('is-active'));
          byId.get(en.target.id)?.classList.add('is-active');
        });
      },
      { rootMargin: '-45% 0px -50% 0px' },
    );
    byId.forEach((_, id) => {
      const sec = document.getElementById(id);
      if (sec) io.observe(sec);
    });
  }
}

let menuApi = { close: () => {} };
function mobileMenu() {
  const burger = $('.burger');
  const menu = $('#menu');
  if (!burger || !menu) return;
  let open = false;
  const onKey = (e) => {
    if (e.key === 'Escape') close();
    else trapFocus(document.body.classList.contains('menu-open') ? menuScope : menu, e);
  };
  // фокус циклічно ходить між бургером і пунктами меню
  const menuScope = { querySelectorAll: (s) => [burger, ...menu.querySelectorAll(s)] };

  function openMenu() {
    open = true;
    menu.hidden = false;
    document.body.classList.add('menu-open');
    burger.setAttribute('aria-expanded', 'true');
    burger.setAttribute('aria-label', 'Закрити меню');
    lockScroll();
    if (!reduced) {
      gsap.fromTo('.menu__bg', { opacity: 0 }, { opacity: 1, duration: 0.4 });
      gsap.fromTo('.menu__nav > *', { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.7, stagger: 0.05, ease: 'expo.out' });
    }
    $('.menu__link', menu)?.focus();
    document.addEventListener('keydown', onKey);
  }
  function close({ restoreFocus = true } = {}) {
    if (!open) return;
    open = false;
    document.body.classList.remove('menu-open');
    burger.setAttribute('aria-expanded', 'false');
    burger.setAttribute('aria-label', 'Відкрити меню');
    document.removeEventListener('keydown', onKey);
    unlockScroll();
    // ховаємо по таймеру, а не по onComplete: стан не залежить від того, чи крутиться rAF
    const done = () => {
      if (!open) menu.hidden = true;
    };
    if (reduced) done();
    else {
      gsap.to('.menu__bg, .menu__nav > *', { opacity: 0, duration: 0.25, overwrite: true });
      setTimeout(done, 260);
    }
    if (restoreFocus) burger.focus();
  }
  burger.addEventListener('click', () => (open ? close() : openMenu()));
  window.addEventListener('resize', () => {
    if (open && window.innerWidth > 1100) close({ restoreFocus: false });
  });
  menuApi = { close };
}

function anchors() {
  document.addEventListener('click', (e) => {
    const a = e.target instanceof Element ? e.target.closest('a[href^="#"]') : null;
    if (!a) return;
    const id = a.getAttribute('href').slice(1);
    const target = id ? document.getElementById(id) : null;
    if (!target) return;
    e.preventDefault();
    menuApi.close({ restoreFocus: false });
    scrollToTarget(target, { offset: id === 'top' ? 0 : -20 });
    if (history.replaceState) history.replaceState(null, '', `#${id}`);
    const focusable = target.matches('a, button, input, select, textarea, [tabindex]') ? target : null;
    setTimeout(() => focusable?.focus({ preventScroll: true }), reduced ? 0 : 900);
  });
}

function faq() {
  $$('.faq__q').forEach((q) => {
    q.addEventListener('click', () => {
      const open = q.getAttribute('aria-expanded') === 'true';
      q.setAttribute('aria-expanded', String(!open));
      document.getElementById(q.getAttribute('aria-controls'))?.classList.toggle('is-open', !open);
      setTimeout(() => ScrollTrigger.refresh(), 650);
    });
  });
}

function fab() {
  const root = $('[data-fab]');
  if (!root) return;
  const btn = $('.fab__btn', root);
  const menu = $('.fab__menu', root);
  const close = () => {
    btn.setAttribute('aria-expanded', 'false');
    menu.hidden = true;
  };
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = btn.getAttribute('aria-expanded') !== 'true';
    btn.setAttribute('aria-expanded', String(open));
    menu.hidden = !open;
    if (open && !reduced) gsap.fromTo($$('li', menu).reverse(), { opacity: 0, y: 16, scale: 0.9 }, { opacity: 1, y: 0, scale: 1, duration: 0.5, stagger: 0.05, ease: 'back.out(1.6)' });
  });
  menu.addEventListener('click', (e) => {
    if (e.target instanceof Element && e.target.closest('a')) close();
  });
  document.addEventListener('click', (e) => {
    if (!root.contains(e.target)) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && btn.getAttribute('aria-expanded') === 'true') {
      close();
      btn.focus();
    }
  });
  // над формою запису й у футері кнопка не потрібна і не повинна перекривати поля
  const zones = ['#booking', '.footer'].map((s) => $(s)).filter(Boolean);
  if ('IntersectionObserver' in window && zones.length) {
    const seen = new Set();
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => (en.isIntersecting ? seen.add(en.target) : seen.delete(en.target)));
        root.classList.toggle('is-away', seen.size > 0);
        if (seen.size) close();
      },
      { rootMargin: '-20% 0px -20% 0px' },
    );
    zones.forEach((z) => io.observe(z));
  }
}

/** Якщо фото не завантажилось — показуємо акуратний градієнт замість «битої» картинки. */
function imageFallbacks() {
  const box = (img) => img.closest('picture')?.parentElement;
  const imgs = $$('img');
  imgs.forEach((img) => {
    img.addEventListener('error', () => box(img)?.classList.add('is-broken'));
    img.addEventListener('load', () => box(img)?.classList.remove('is-broken'));
  });
  // eager-фото могли «впасти» ще до запуску скрипта — перевіряємо, коли сторінка завантажилась
  window.addEventListener(
    'load',
    () =>
      imgs.forEach((img) => {
        if (img.loading !== 'lazy' && img.getAttribute('src') && img.complete && img.naturalWidth === 0) box(img)?.classList.add('is-broken');
      }),
    { once: true },
  );
}

export function initUi() {
  headerAndProgress();
  mobileMenu();
  anchors();
  faq();
  fab();
  imageFallbacks();
}
