// Портфоліо: фільтри, лайтбокс зі свайпом і клавіатурою, слайдер «до/після».
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { $, $$, BASE, lockScroll, reduced, siteData, trapFocus, unlockScroll } from './env.js';

function filters() {
  const buttons = $$('.filter');
  const items = $$('.masonry__item');
  if (!buttons.length) return;
  buttons.forEach((btn) =>
    btn.addEventListener('click', () => {
      const cat = btn.dataset.filter;
      buttons.forEach((b) => {
        const on = b === btn;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-pressed', String(on));
      });
      const shown = [];
      items.forEach((it) => {
        const match = cat === 'all' || it.dataset.cat === cat;
        it.classList.toggle('is-hidden', !match);
        if (match) shown.push(it);
      });
      shown.forEach((n) => (n.dataset.revealed = '1'));
      if (!reduced) {
        gsap.fromTo(shown, { opacity: 0, y: 30, scale: 0.96 }, { opacity: 1, y: 0, scale: 1, duration: 0.7, stagger: 0.06, ease: 'expo.out', overwrite: true });
      }
      ScrollTrigger.refresh();
    }),
  );
}

function lightbox() {
  const box = $('[data-lightbox]');
  const gallery = siteData.gallery || [];
  if (!box || !gallery.length) return;
  const img = $('[data-lb-img]', box);
  const [avif, webp] = $$('source', box);
  const caption = $('[data-lb-caption]', box);
  const count = $('[data-lb-count]', box);
  const stage = $('[data-lb-stage]', box);
  let list = [];
  let pos = 0;
  let lastFocus = null;

  const srcset = (g, ext) => g.widths.map((w) => `${BASE}img/${g.name}-${w}.${ext} ${w}w`).join(', ');

  function show(dir = 0) {
    const g = gallery[list[pos]];
    const apply = () => {
      avif.srcset = srcset(g, 'avif');
      webp.srcset = srcset(g, 'webp');
      avif.sizes = webp.sizes = img.sizes = '(max-width: 900px) 92vw, 900px';
      img.srcset = srcset(g, 'jpg');
      img.src = `${BASE}img/${g.name}-${g.widths[g.widths.length - 1]}.jpg`;
      img.width = g.w;
      img.height = g.h;
      img.alt = g.alt || g.caption;
      caption.textContent = g.caption;
      count.textContent = `${pos + 1} / ${list.length}`;
    };
    // стан змінюється одразу, анімація — лише візуальний шар
    apply();
    if (reduced) return;
    if (dir) gsap.fromTo(img, { opacity: 0, x: 48 * dir }, { opacity: 1, x: 0, duration: 0.55, ease: 'expo.out', overwrite: true });
    else gsap.fromTo(img, { opacity: 0, scale: 0.96 }, { opacity: 1, scale: 1, duration: 0.6, ease: 'expo.out', overwrite: true });
  }

  const step = (d) => {
    if (list.length < 2) return;
    pos = (pos + d + list.length) % list.length;
    show(d);
  };

  function onKey(e) {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowRight') step(1);
    else if (e.key === 'ArrowLeft') step(-1);
    else trapFocus(box, e);
  }

  function open(index, opener) {
    list = $$('.masonry__item:not(.is-hidden) .work').map((b) => Number(b.dataset.index));
    pos = Math.max(0, list.indexOf(index));
    lastFocus = opener || document.activeElement;
    box.hidden = false;
    lockScroll();
    show(0);
    if (!reduced) gsap.fromTo(box, { opacity: 0 }, { opacity: 1, duration: 0.35 });
    document.addEventListener('keydown', onKey);
    $('.lightbox__btn--close', box).focus();
  }

  function close() {
    if (box.hidden) return;
    document.removeEventListener('keydown', onKey);
    box.hidden = true;
    unlockScroll();
    lastFocus?.focus?.({ preventScroll: true });
  }

  document.addEventListener('click', (e) => {
    const btn = e.target instanceof Element ? e.target.closest('.work') : null;
    if (btn) open(Number(btn.dataset.index), btn);
  });
  $$('[data-lb-close]', box).forEach((b) => b.addEventListener('click', close));
  $('[data-lb-prev]', box).addEventListener('click', () => step(-1));
  $('[data-lb-next]', box).addEventListener('click', () => step(1));

  // свайп
  let startX = 0;
  let startY = 0;
  let tracking = false;
  stage.addEventListener('pointerdown', (e) => {
    tracking = true;
    startX = e.clientX;
    startY = e.clientY;
  });
  stage.addEventListener('pointerup', (e) => {
    if (!tracking) return;
    tracking = false;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) step(dx < 0 ? 1 : -1);
  });
  stage.addEventListener('pointercancel', () => (tracking = false));
  img.draggable = false;
}

function beforeAfter() {
  const root = $('[data-ba]');
  if (!root) return;
  const frame = $('.ba__frame', root);
  const range = $('.ba__range', root);
  const set = (v) => frame.style.setProperty('--pos', `${v}%`);
  let hint = null;
  const stopHint = () => hint?.kill();
  range.addEventListener('input', () => {
    stopHint();
    set(range.value);
  });
  range.addEventListener('pointerdown', stopHint);
  set(range.value);
  if (reduced) return;
  // підказка: повзунок сам «гойдається», коли блок уперше зʼявляється (зупиняється від дотику)
  const o = { v: 50 };
  ScrollTrigger.create({
    trigger: root,
    start: 'top 75%',
    once: true,
    onEnter: () => {
      hint = gsap
        .timeline({ delay: 0.4, onUpdate: () => set(o.v), onComplete: () => set(range.value) })
        .to(o, { v: 78, duration: 0.9, ease: 'power2.inOut' })
        .to(o, { v: 26, duration: 1.1, ease: 'power2.inOut' })
        .to(o, { v: 50, duration: 0.8, ease: 'power2.out' });
    },
  });
}

export function initGallery() {
  filters();
  lightbox();
  beforeAfter();
}
