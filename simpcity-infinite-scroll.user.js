// ==UserScript==
// @name         SimpCity Infinite Scroll
// @namespace    https://github.com/vylix-dev/simpcity-infinite-scroll
// @version      1.0.0
// @description  Automatically load additional SimpCity thread-list pages as you scroll.
// @author       vylix-dev
// @license      MIT
// @homepageURL  https://github.com/vylix-dev/simpcity-infinite-scroll
// @supportURL   https://github.com/vylix-dev/simpcity-infinite-scroll/issues
// @updateURL    https://raw.githubusercontent.com/vylix-dev/simpcity-infinite-scroll/main/simpcity-infinite-scroll.meta.js
// @downloadURL  https://raw.githubusercontent.com/vylix-dev/simpcity-infinite-scroll/main/simpcity-infinite-scroll.user.js
// @match        *://simpcity.su/*
// @match        *://www.simpcity.su/*
// @match        *://*.simpcity.su/*
// @match        *://simpcity.cr/*
// @match        *://www.simpcity.cr/*
// @match        *://*.simpcity.cr/*
// @run-at       document-idle
// @grant        none
// @noframes
// ==/UserScript==

(() => {
  'use strict';

  const APP = Object.freeze({
    id: 'scis',
    name: 'SimpCity Infinite Scroll',
  });

  const THREAD_ROW_SELECTOR = '.structItem--thread';
  const THREAD_LINK_SELECTOR = 'a[href*="/threads/"]';

  const CSS = String.raw`
    .scis-sentinel {
      clear: both !important;
      height: 1px !important;
      pointer-events: none !important;
    }

    .scis-status {
      display: none !important;
      margin: 12px 0 !important;
      padding: 12px !important;
      border: 1px solid rgba(148, 163, 184, 0.22) !important;
      border-radius: 10px !important;
      background: rgba(15, 23, 42, 0.72) !important;
      color: #9ca3af !important;
      font: 700 13px/1.35 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
      text-align: center !important;
    }

    .scis-status.scis-status-visible {
      display: block !important;
    }
  `;

  const state = {
    nextUrl: null,
    fetching: false,
    scrollBusy: false,
    buffer: [],
    container: null,
    sentinel: null,
    status: null,
    done: false,
    lastError: false,
    seenIds: new Set(),
  };

  let initialized = false;

  function addStyle(css) {
    const style = document.createElement('style');
    style.setAttribute('data-scis-style', 'true');
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  }

  function toThreadId(value) {
    const numeric = Number(value);
    if (!Number.isInteger(numeric) || numeric <= 0) return null;
    return numeric;
  }

  function getThreadId(href) {
    const match = String(href || '').match(/\/threads\/(?:[^/]+\.)?(\d+)(?:[/?#]|$)/i);
    return match ? toThreadId(match[1]) : null;
  }

  function resolveUrl(href, base = window.location.href) {
    if (!href) return null;
    try {
      return new URL(href, base).href;
    } catch (_error) {
      return href;
    }
  }

  function nextPageLink(doc, base) {
    const link = doc.querySelector('a[rel="next"], .pageNav-jump--next');
    return link ? resolveUrl(link.getAttribute('href'), base) : null;
  }

  function findContainer() {
    return document.querySelector('.js-threadList') ||
      document.querySelector('.structItemContainer-group') ||
      document.querySelector('.structItemContainer') ||
      document.querySelector(THREAD_ROW_SELECTOR)?.parentElement ||
      null;
  }

  function getThreadInfo(row, base = window.location.href) {
    const link = row.querySelector(THREAD_LINK_SELECTOR);
    if (!link) return null;

    const href = link.getAttribute('href') || link.href || '';
    const id = getThreadId(href);
    if (!id) return null;

    return {
      id,
      url: resolveUrl(href, base),
    };
  }

  function rememberVisibleRows(root = document) {
    if (!root || typeof root.querySelectorAll !== 'function') return;

    root.querySelectorAll(THREAD_ROW_SELECTOR).forEach((row) => {
      const info = getThreadInfo(row);
      if (!info) return;
      state.seenIds.add(info.id);
      row.dataset.scisThreadId = String(info.id);
    });
  }

  function setStatus(message, visible = true) {
    if (!state.status) return;
    state.status.textContent = message;
    state.status.classList.toggle('scis-status-visible', visible);
  }

  function prepareBufferedNode(node, id) {
    const clone = node.cloneNode(true);
    clone.dataset.scisThreadId = String(id);
    clone.removeAttribute('data-scis-buffered');
    return clone;
  }

  async function fetchMore() {
    if (state.fetching || state.done || !state.nextUrl) return;
    state.fetching = true;
    state.lastError = false;

    try {
      const url = state.nextUrl;
      const response = await fetch(url, { credentials: 'include' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      state.nextUrl = nextPageLink(doc, url);
      if (!state.nextUrl) state.done = true;

      rememberVisibleRows(document);

      doc.querySelectorAll(THREAD_ROW_SELECTOR).forEach((node) => {
        const info = getThreadInfo(node, url);
        if (!info || state.seenIds.has(info.id)) return;

        state.seenIds.add(info.id);
        state.buffer.push({ id: info.id, node: prepareBufferedNode(node, info.id) });
      });
    } catch (error) {
      state.lastError = true;
      console.error(`[${APP.name}] Fetch error:`, error);
      setStatus('Unable to load more threads. Try refreshing the page.', true);
    } finally {
      state.fetching = false;
    }
  }

  async function drain(count = 20) {
    if (!state.container) return 0;

    if (state.buffer.length < count && !state.fetching && !state.done) {
      await fetchMore();
      if (state.lastError) return 0;
    }

    let added = 0;
    while (state.buffer.length && added < count) {
      const { id, node } = state.buffer.shift();
      node.dataset.scisThreadId = String(id);

      if (state.sentinel) {
        state.container.insertBefore(node, state.sentinel);
      } else {
        state.container.appendChild(node);
      }

      added += 1;
    }

    if (added) rememberVisibleRows(state.container);
    return added;
  }

  function finishIfExhausted(observer) {
    if (!state.done || state.buffer.length) return false;
    observer.disconnect();
    setStatus('— No more threads —', true);
    return true;
  }

  function setupScroll() {
    if (!state.container || state.sentinel) return;

    const sentinel = document.createElement('div');
    sentinel.className = 'scis-sentinel';
    sentinel.setAttribute('aria-hidden', 'true');

    const status = document.createElement('p');
    status.className = 'scis-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');

    state.container.appendChild(sentinel);
    sentinel.insertAdjacentElement('afterend', status);
    state.sentinel = sentinel;
    state.status = status;

    if (typeof IntersectionObserver !== 'function') {
      setStatus('Infinite scroll is not supported by this browser.', true);
      return;
    }

    const observer = new IntersectionObserver(async ([entry]) => {
      if (!entry.isIntersecting || state.scrollBusy) return;
      state.scrollBusy = true;

      try {
        if (finishIfExhausted(observer)) return;

        setStatus('Loading more threads…', true);
        const added = await drain(20);
        if (!state.lastError) setStatus('', false);

        if (!added && !state.lastError) finishIfExhausted(observer);
      } finally {
        state.scrollBusy = false;
      }
    }, { rootMargin: '320px' });

    observer.observe(sentinel);
  }

  async function init() {
    if (initialized || !document.body) return;
    initialized = true;

    addStyle(CSS);
    state.container = findContainer();
    state.nextUrl = nextPageLink(document, window.location.href);
    rememberVisibleRows(document);

    if (!state.container || !state.nextUrl) return;

    await fetchMore();
    setupScroll();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else if (document.body) {
    init();
  } else {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  }
})();
