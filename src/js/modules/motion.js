// Рух: Lenis, прелоадер, hero-інтро, reveal, лічильники, marquee, горизонтальна секція, морф-форми.
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { $, $$, reduced, state, wait } from './env.js';

gsap.registerPlugin(ScrollTrigger);

const BLOBS = [
  'M421,95 C495,140 545,230 530,320 C515,410 445,500 345,525 C245,550 135,505 90,415 C45,325 70,215 140,145 C210,75 347,50 421,95 Z',
  'M450,120 C530,190 540,300 495,385 C450,470 365,540 265,520 C165,500 85,430 75,330 C65,230 120,140 205,100 C290,60 370,50 450,120 Z',
  'M395,80 C480,100 560,190 545,290 C530,390 470,480 370,515 C270,550 160,520 110,440 C60,360 50,250 105,170 C160,90 310,60 395,80 Z',
  'M430,110 C520,160 520,280 500,360 C470,470 380,520 290,530 C190,540 110,470 85,380 C55,280 95,170 175,120 C255,70 360,70 430,110 Z',
];

function heroImageReady() {
  const img = $('.hero__img');
  if (!img || (img.complete && img.naturalWidth)) return Promise.resolve();
  return new Promise((res) => {
    img.addEventListener('load', res, { once: true });
    img.addEventListener('error', res, { once: true });
  });
}

/** Прелоадер: ≤1,5 с разом із виходом. Вирішується, коли панель почала відкриватись. */
function runPreloader() {
  const pre = $('.preloader');
  if (!pre) return Promise.resolve();
  pre.style.animation = 'none'; // скасовуємо CSS-запасний варіант
  const t0 = performance.now();
  const ready = Promise.race([Promise.all([document.fonts?.ready, heroImageReady()]), wait(550)]);
  return ready
    .then(() => wait(Math.max(0, 350 - (performance.now() - t0))))
    .then(
      () =>
        new Promise((resolve) => {
          gsap
            .timeline({ onComplete: () => pre.remove() })
            .to('.preloader__mark, .preloader__bar', { yPercent: -60, opacity: 0, duration: 0.28, ease: 'power2.in' })
            .add(resolve)
            .to(pre, { yPercent: -100, duration: 0.65, ease: 'expo.inOut' }, '-=0.05');
        }),
    );
}

function heroIntro() {
  if (!$('.hero')) return;
  const tl = gsap.timeline({ defaults: { ease: 'expo.out' } });
  tl.fromTo('.hero__mask', { y: 0, yPercent: 100 }, { yPercent: 0, duration: 1.4, ease: 'expo.inOut' }, 0)
    .fromTo('.hero__mask-in', { y: 0, yPercent: -100 }, { yPercent: 0, duration: 1.4, ease: 'expo.inOut' }, 0)
    .fromTo('.hero__pic', { scale: 1.18 }, { scale: 1, duration: 2.4 }, 0.15)
    .fromTo('.hero__title .line__in', { y: 0, yPercent: 112 }, { yPercent: 0, duration: 1.2, stagger: 0.09 }, 0.15)
    .fromTo('[data-hero-fade]', { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: 0.9, stagger: 0.06 }, 0.3)
    .fromTo('.hero__blob path', { opacity: 0 }, { opacity: 1, duration: 1.6 }, 0.6)
    .add(() => {
      // повільне «дихання» фото, лише поки hero видно
      const breath = gsap.to('.hero__pic', { scale: 1.06, duration: 7, ease: 'sine.inOut', yoyo: true, repeat: -1 });
      ScrollTrigger.create({ trigger: '.hero', start: 'top bottom', end: 'bottom top', onToggle: (s) => (s.isActive ? breath.play() : breath.pause()) });
    });

  gsap.to('[data-hero-media]', { yPercent: 16, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } });
  gsap.to('.hero__content', { yPercent: -12, opacity: 0.2, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } });
  gsap.to('.hero__glow--a', { x: '-6vw', y: '5vh', scale: 1.12, duration: 11, ease: 'sine.inOut', yoyo: true, repeat: -1 });
  gsap.to('.hero__glow--b', { x: '8vw', y: '-6vh', scale: 0.9, duration: 13, ease: 'sine.inOut', yoyo: true, repeat: -1 });
}

// Усі контури мають однакову структуру (M + 5×C), тож морф — це інтерполяція чисел.
const NUM = /-?\d+(?:\.\d+)?/g;
const TPL = BLOBS[0].replace(NUM, '#');
const nums = (d) => d.match(NUM).map(Number);
const lerpPath = (a, b, t) => {
  let k = 0;
  return TPL.replace(/#/g, () => {
    const v = a[k] + (b[k] - a[k]) * t;
    k += 1;
    return v.toFixed(1);
  });
};

function morphBlobs() {
  const shapes = BLOBS.map(nums);
  $$('[data-blob]').forEach((path, i) => {
    const seq = [0, 1, 2, 3, 0].map((k) => shapes[(k + i) % shapes.length]);
    const tl = gsap.timeline({ repeat: -1, paused: true });
    for (let j = 0; j < seq.length - 1; j++) {
      const a = seq[j];
      const b = seq[j + 1];
      const o = { t: 0 };
      tl.to(o, { t: 1, duration: 5.5, ease: 'sine.inOut', onUpdate: () => path.setAttribute('d', lerpPath(a, b, o.t)) });
    }
    const svg = path.ownerSVGElement;
    const spin = svg.classList.contains('hero__blob') ? gsap.to(svg, { rotation: 360, duration: 90, ease: 'none', repeat: -1, transformOrigin: '50% 50%', paused: true }) : null;
    ScrollTrigger.create({
      trigger: svg.closest('section') || svg,
      start: 'top bottom',
      end: 'bottom top',
      onToggle: (s) => {
        s.isActive ? tl.play() : tl.pause();
        if (spin) s.isActive ? spin.play() : spin.pause();
      },
    });
  });
}

function reveals() {
  ScrollTrigger.batch('[data-reveal], .masonry__item', {
    start: 'top 90%',
    once: true,
    onEnter: (all) => {
      const items = all.filter((n) => !n.dataset.revealed);
      items.forEach((n) => (n.dataset.revealed = '1'));
      if (!items.length) return;
      gsap.fromTo(
        items,
        { opacity: 0, y: 44, scale: 0.97 },
        { opacity: 1, y: 0, scale: 1, duration: 1.1, ease: 'expo.out', stagger: 0.09, overwrite: 'auto' },
      );
    },
  });

  $$('[data-lines]').forEach((h) => {
    gsap.fromTo(
      $$('.line__in', h),
      { y: 0, yPercent: 112 },
      { yPercent: 0, duration: 1.2, ease: 'expo.out', stagger: 0.1, scrollTrigger: { trigger: h, start: 'top 90%', once: true } },
    );
  });

  $$('[data-count]').forEach((node) => {
    const end = Number(node.dataset.count);
    const o = { v: 0 };
    node.textContent = '0';
    ScrollTrigger.create({
      trigger: node,
      start: 'top 92%',
      once: true,
      onEnter: () => gsap.to(o, { v: end, duration: 2.2, ease: 'power3.out', onUpdate: () => (node.textContent = String(Math.round(o.v))) }),
    });
  });

  const num = $('.about__num');
  if (num) gsap.fromTo(num, { yPercent: 30 }, { yPercent: -40, ease: 'none', scrollTrigger: { trigger: '.about', start: 'top bottom', end: 'bottom top', scrub: true } });
}

function marquee() {
  const track = $('.marquee__track');
  if (!track) return;
  const tween = gsap.to(track, { xPercent: -50, duration: 36, ease: 'none', repeat: -1 });
  tween.totalTime(tween.duration() * 50); // запас, щоб можна було «крутити» назад
  let base = 1;
  ScrollTrigger.create({
    trigger: '.marquee',
    start: 'top bottom',
    end: 'bottom top',
    onToggle: (s) => (s.isActive ? tween.play() : tween.pause()),
    onUpdate: (s) => {
      base = s.direction;
      const boost = gsap.utils.clamp(1, 6, 1 + Math.abs(s.getVelocity()) / 350);
      gsap.to(tween, { timeScale: boost * base, duration: 0.25, overwrite: true, onComplete: () => gsap.to(tween, { timeScale: base, duration: 1.2 }) });
    },
  });
}

function horizontal() {
  const mm = gsap.matchMedia();
  mm.add('(min-width: 1024px)', () => {
    const section = $('.process');
    const track = $('.process__track');
    if (!section || !track) return;
    const dist = () => Math.max(0, track.scrollWidth - window.innerWidth);
    const tween = gsap.to(track, { x: () => -dist(), ease: 'none' });
    ScrollTrigger.create({
      trigger: section,
      start: 'top top',
      end: () => `+=${dist()}`,
      pin: true,
      scrub: 0.8,
      animation: tween,
      invalidateOnRefresh: true,
      anticipatePin: 1,
    });
    $$('[data-hparallax]', track).forEach((node) => {
      gsap.fromTo(node, { xPercent: -8 }, { xPercent: 8, ease: 'none', scrollTrigger: { trigger: node.parentElement, containerAnimation: tween, start: 'left right', end: 'right left', scrub: true } });
    });
    $$('.step', track).forEach((node) => {
      gsap.fromTo(node, { opacity: 0.3, scale: 0.92 }, { opacity: 1, scale: 1, ease: 'none', scrollTrigger: { trigger: node, containerAnimation: tween, start: 'left 100%', end: 'left 60%', scrub: true } });
    });
  });
}

export async function initMotion() {
  if (reduced) {
    $('.preloader')?.remove();
    return;
  }
  document.documentElement.classList.add('anim');

  const lenis = new Lenis({ lerp: 0.1, smoothWheel: true });
  state.lenis = lenis;
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);

  morphBlobs();
  marquee();
  horizontal();

  await runPreloader();
  heroIntro();
  reveals();

  document.fonts?.ready.then(() => ScrollTrigger.refresh());
  window.addEventListener('load', () => ScrollTrigger.refresh(), { once: true });
}

export { gsap, ScrollTrigger };
