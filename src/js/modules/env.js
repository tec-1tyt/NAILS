// Спільні утиліти й стан
import { demoApi } from './demo.js';

/* global __BASE__, __DEMO__ */
// Підставляються під час збирання (scripts/build.mjs): шлях сайту й демо-режим без сервера.
// __DEMO__ — літерал true/false, тож у звичайній збірці демо-код повністю вирізається.
export const BASE = __BASE__;
export const DEMO = __DEMO__;

export const $ = (s, root = document) => root.querySelector(s);
export const $$ = (s, root = document) => [...root.querySelectorAll(s)];

export const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;

export const state = { lenis: null };

export const siteData = (() => {
  try {
    return JSON.parse($('#site-data')?.textContent || '{}');
  } catch {
    return {};
  }
})();

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

/** Плавний скрол до елемента (Lenis або нативний). */
export function scrollToTarget(target, { offset = 0, immediate = false } = {}) {
  const node = typeof target === 'string' ? $(target) : target;
  if (!node) return;
  if (state.lenis) {
    state.lenis.scrollTo(node, { offset, immediate, duration: 1.4 });
  } else {
    const y = node.getBoundingClientRect().top + window.scrollY + offset;
    window.scrollTo({ top: y, behavior: reduced || immediate ? 'auto' : 'smooth' });
  }
}

let locks = 0;
export function lockScroll() {
  locks += 1;
  if (locks === 1) {
    state.lenis?.stop();
    document.documentElement.style.overflow = 'hidden';
  }
}
export function unlockScroll() {
  locks = Math.max(0, locks - 1);
  if (locks === 0) {
    state.lenis?.start();
    document.documentElement.style.overflow = '';
  }
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Тримає фокус клавіатури всередині модального вікна. */
export function trapFocus(container, e) {
  if (e.key !== 'Tab') return;
  const items = $$(FOCUSABLE, container).filter((n) => n.getClientRects().length > 0);
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

/** fetch з тайм-аутом; ніколи не кидає — повертає { ok, status, data, network }. */
export async function api(url, opts = {}, timeout = 12000) {
  if (__DEMO__) return demoApi(url, opts);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(BASE + url.replace(/^\//, ''), {
      ...opts,
      signal: ctrl.signal,
      headers: { Accept: 'application/json', ...(opts.body ? { 'Content-Type': 'application/json' } : {}), ...opts.headers },
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      /* не JSON */
    }
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: null, network: true };
  } finally {
    clearTimeout(timer);
  }
}
