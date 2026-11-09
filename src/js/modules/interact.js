// Курсор-крапля, magnetic-кнопки, 3D-tilt карток, точка заливки кнопок.
import { gsap } from 'gsap';
import { $, $$, finePointer, reduced } from './env.js';

const TEXT_INPUT = 'input:not([type="range"]):not([type="radio"]):not([type="checkbox"]), textarea';
const INTERACTIVE = 'a, button, label, select, [role="button"], input[type="range"]';

function cursor() {
  const c = $('.cursor');
  if (!c) return;
  document.documentElement.classList.add('has-cursor');
  const drop = $('.cursor__drop', c);
  const dot = $('.cursor__dot', c);
  gsap.set([drop, dot], { x: -100, y: -100 });
  const xTo = gsap.quickTo(drop, 'x', { duration: 0.45, ease: 'power3' });
  const yTo = gsap.quickTo(drop, 'y', { duration: 0.45, ease: 'power3' });

  window.addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType !== 'mouse') return;
      gsap.set(dot, { x: e.clientX, y: e.clientY });
      xTo(e.clientX);
      yTo(e.clientY);
      c.classList.remove('is-out');
    },
    { passive: true },
  );
  document.addEventListener('pointerover', (e) => {
    const t = e.target instanceof Element ? e.target : null;
    const view = t?.closest('[data-cursor="view"]');
    const text = t?.closest(TEXT_INPUT);
    const hover = !view && !text && t?.closest(INTERACTIVE);
    c.classList.toggle('is-view', !!view);
    c.classList.toggle('is-text', !!text);
    c.classList.toggle('is-hover', !!hover);
  });
  document.documentElement.addEventListener('mouseleave', () => c.classList.add('is-out'));
  window.addEventListener('pointerdown', () => c.classList.add('is-down'));
  window.addEventListener('pointerup', () => c.classList.remove('is-down'));
}

function magnetic() {
  $$('.magnetic').forEach((node) => {
    const xTo = gsap.quickTo(node, 'x', { duration: 0.8, ease: 'elastic.out(1, 0.45)' });
    const yTo = gsap.quickTo(node, 'y', { duration: 0.8, ease: 'elastic.out(1, 0.45)' });
    node.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      const r = node.getBoundingClientRect();
      xTo((e.clientX - r.left - r.width / 2) * 0.28);
      yTo((e.clientY - r.top - r.height / 2) * 0.38);
    });
    node.addEventListener('pointerleave', () => {
      xTo(0);
      yTo(0);
    });
  });
}

function tilt() {
  $$('[data-tilt]').forEach((node) => {
    gsap.set(node, { transformPerspective: 1000 });
    const rx = gsap.quickTo(node, 'rotationX', { duration: 0.7, ease: 'power3' });
    const ry = gsap.quickTo(node, 'rotationY', { duration: 0.7, ease: 'power3' });
    const lift = node.classList.contains('svc');
    node.addEventListener('pointerenter', (e) => {
      if (e.pointerType === 'mouse' && lift) gsap.to(node, { y: -8, duration: 0.6, ease: 'power3.out', overwrite: 'auto' });
    });
    node.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      const r = node.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      ry((px - 0.5) * 9);
      rx((0.5 - py) * 9);
      node.style.setProperty('--gx', `${(px * 100).toFixed(1)}%`);
      node.style.setProperty('--gy', `${(py * 100).toFixed(1)}%`);
    });
    node.addEventListener('pointerleave', () => {
      rx(0);
      ry(0);
      if (lift) gsap.to(node, { y: 0, duration: 0.6, ease: 'power3.out', overwrite: 'auto' });
    });
  });
}

/** Заливка кнопки «розливається» з точки, де курсор увійшов. Працює і для тапу. */
function fillOrigin() {
  const set = (e) => {
    const btn = e.target instanceof Element ? e.target.closest('.btn') : null;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    btn.style.setProperty('--x', `${e.clientX - r.left}px`);
    btn.style.setProperty('--y', `${e.clientY - r.top}px`);
  };
  document.addEventListener('pointerover', set);
  document.addEventListener('pointerdown', set);
}

export function initInteractions() {
  fillOrigin();
  if (!finePointer || reduced) return;
  cursor();
  magnetic();
  tilt();
}
