// ==UserScript==
// @name         SimpCity Infinite Scroll
// @namespace    https://github.com/vylix-dev/simpcity-infinite-scroll
// @version      1.0.6
// @description  Automatically load additional SimpCity thread-list pages as you scroll.
// @author       vylix-dev
// @license      MIT
// @icon         https://raw.githubusercontent.com/vylix-dev/simpcity-infinite-scroll/main/vylix-logo-64.png
// @iconURL      https://raw.githubusercontent.com/vylix-dev/simpcity-infinite-scroll/main/vylix-logo-64.png
// @icon64       https://raw.githubusercontent.com/vylix-dev/simpcity-infinite-scroll/main/vylix-logo-128.png
// @icon64URL    https://raw.githubusercontent.com/vylix-dev/simpcity-infinite-scroll/main/vylix-logo-128.png
// @homepageURL  https://github.com/vylix-dev/simpcity-infinite-scroll
// @supportURL   https://github.com/vylix-dev/simpcity-infinite-scroll/issues
// @updateURL    https://raw.githubusercontent.com/vylix-dev/simpcity-infinite-scroll/main/simpcity-infinite-scroll.meta.js
// @downloadURL  https://raw.githubusercontent.com/vylix-dev/simpcity-infinite-scroll/main/simpcity-infinite-scroll.user.js
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
  const DRAIN_BATCH_SIZE = 20;
  const MAX_THREAD_ROWS = 500;
  const MAX_FETCH_ATTEMPTS = 3;
  const INITIAL_RETRY_DELAY_MS = 2000;
  const RATINGS_SORT_EVENT = 'simpcity-thread-ratings:sort-state';

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
      border: 1px solid var(--xf-borderColorAccent, var(--xf-borderColor, currentColor)) !important;
      border-radius: 10px !important;
      background: var(--xf-contentBg, transparent) !important;
      color: var(--xf-textColorMuted, inherit) !important;
      font: 700 13px/1.35 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
      text-align: center !important;
    }

    .scis-status.scis-status-visible {
      display: block !important;
    }

    body.scg-enabled .scis-sentinel,
    body.scg-enabled .scis-status {
      grid-column: 1 / -1 !important;
    }

    .scis-retry-btn {
      margin-left: 8px !important;
      padding: 2px 8px !important;
      border: 1px solid var(--xf-borderColorAccent, var(--xf-borderColor, currentColor)) !important;
      border-radius: 999px !important;
      background: var(--xf-buttonBg, var(--xf-contentAltBg, transparent)) !important;
      color: var(--xf-linkColor, inherit) !important;
      cursor: pointer !important;
      font: inherit !important;
    }

    .scis-retry-btn:hover,
    .scis-retry-btn:focus-visible {
      background: var(--xf-buttonHoverBg, var(--xf-contentHighlightBg, var(--xf-contentAltBg, transparent))) !important;
      color: var(--xf-linkHoverColor, var(--xf-linkColor, inherit)) !important;
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
    observer: null,
    done: false,
    lastError: false,
    lastErrorCloudflare: false,
    pausedByRatings: false,
    seenIds: new Set(),
  };

  let initialized = false;
  let containerObserver = null;

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

  function getPageNumber(url) {
    try {
      const parsedUrl = new URL(url, window.location.href);
      const pathMatch = parsedUrl.pathname.match(/\/page-(\d+)\/?$/i);
      if (pathMatch) return Number(pathMatch[1]) || 1;

      const queryPage = Number(parsedUrl.searchParams.get('page'));
      return Number.isFinite(queryPage) && queryPage > 0 ? queryPage : 1;
    } catch (_error) {
      return 1;
    }
  }

  function updateHistoryForPage(pageUrl) {
    if (!pageUrl || !window.history || typeof window.history.replaceState !== 'function') return;

    try {
      const next = new URL(pageUrl, window.location.href);
      if (next.origin !== window.location.origin) return;
      if (next.href === window.location.href) return;
      window.history.replaceState(window.history.state, document.title, next.href);
    } catch (_error) {
      // URL state is a convenience. Ignore malformed page URLs.
    }
  }

  function wait(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function isCloudflareStatus(status) {
    return status === 403 || status === 429 || status === 503;
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

  function setStatus(message, visible = true, { retry = false } = {}) {
    if (!state.status) return;

    state.status.textContent = '';
    if (message) state.status.append(document.createTextNode(message));

    if (retry) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'scis-retry-btn';
      button.textContent = 'Retry';
      button.addEventListener('click', () => retryLoadMore());
      state.status.append(document.createTextNode(' '), button);
    }

    state.status.classList.toggle('scis-status-visible', visible);
  }

  function isRatingsSortActive() {
    return document.documentElement.dataset.scrRatingsSort === 'active';
  }

  function setRatingsSortPaused(active) {
    state.pausedByRatings = active;

    if (active) {
      if (state.observer) {
        state.observer.disconnect();
        state.observer = null;
      }
      setStatus('Infinite scroll is paused while Thread Ratings sorts all watched threads.', true);
      return;
    }

    setStatus('', false);
    setupScroll();
  }

  function prepareBufferedNode(node, id) {
    const clone = node.cloneNode(true);
    clone.dataset.scisThreadId = String(id);
    clone.removeAttribute('data-scis-buffered');
    return clone;
  }

  async function fetchPageHtml(url) {
    let delay = INITIAL_RETRY_DELAY_MS;
    let lastError = null;

    for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt += 1) {
      try {
        const response = await fetch(url, { credentials: 'include' });
        if (isCloudflareStatus(response.status)) {
          const error = new Error(`Cloudflare or rate-limit response: HTTP ${response.status}`);
          error.scisCloudflare = true;
          throw error;
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.text();
      } catch (error) {
        lastError = error;
        const shouldRetry = Boolean(error?.scisCloudflare || error instanceof TypeError);
        if (!shouldRetry || attempt >= MAX_FETCH_ATTEMPTS) break;
        await wait(delay);
        delay *= 2;
      }
    }

    throw lastError || new Error('Fetch failed');
  }

  async function fetchMore() {
    if (state.pausedByRatings || state.fetching || state.done || !state.nextUrl) return;
    state.fetching = true;
    state.lastError = false;
    state.lastErrorCloudflare = false;

    try {
      const url = state.nextUrl;
      const html = await fetchPageHtml(url);
      const doc = new DOMParser().parseFromString(html, 'text/html');
      state.nextUrl = nextPageLink(doc, url);
      if (!state.nextUrl) state.done = true;

      rememberVisibleRows(document);

      doc.querySelectorAll(THREAD_ROW_SELECTOR).forEach((node) => {
        const info = getThreadInfo(node, url);
        if (!info || state.seenIds.has(info.id)) return;

        state.seenIds.add(info.id);
        state.buffer.push({
          id: info.id,
          node: prepareBufferedNode(node, info.id),
          pageNumber: getPageNumber(url),
          pageUrl: url,
        });
      });
    } catch (error) {
      state.lastError = true;
      state.lastErrorCloudflare = Boolean(error?.scisCloudflare || error instanceof TypeError);
      console.error(`[${APP.name}] Fetch error:`, error);
      setStatus('Loading failed (possibly Cloudflare).', true, { retry: true });
    } finally {
      state.fetching = false;
    }
  }

  function trimThreadRows() {
    if (!state.container) return;

    const rows = Array.from(state.container.querySelectorAll(THREAD_ROW_SELECTOR));
    const overflow = rows.length - MAX_THREAD_ROWS;
    if (overflow <= 0) return;

    let removedHeight = 0;
    rows.slice(0, overflow).forEach((row) => {
      removedHeight += row.getBoundingClientRect().height;
      row.remove();
    });

    if (removedHeight > 0) window.scrollBy(0, -removedHeight);
  }

  async function drain(count = DRAIN_BATCH_SIZE) {
    if (state.pausedByRatings || !ensureContainer()) return 0;

    if (state.buffer.length < count && !state.fetching && !state.done) {
      await fetchMore();
      if (state.pausedByRatings || state.lastError) return 0;
    }

    const fragment = document.createDocumentFragment();
    let added = 0;
    let latestPageUrl = null;

    while (state.buffer.length && added < count) {
      const { id, node, pageUrl } = state.buffer.shift();
      node.dataset.scisThreadId = String(id);
      fragment.appendChild(node);
      latestPageUrl = pageUrl || latestPageUrl;
      added += 1;
    }

    if (!added) return 0;

    if (state.sentinel && state.sentinel.parentNode === state.container) {
      state.container.insertBefore(fragment, state.sentinel);
    } else {
      state.container.appendChild(fragment);
    }

    rememberVisibleRows(state.container);
    trimThreadRows();
    updateHistoryForPage(latestPageUrl);
    return added;
  }

  function ensureContainer() {
    const container = findContainer();
    if (!container) return false;

    if (state.container !== container) {
      if (state.observer) {
        state.observer.disconnect();
        state.observer = null;
      }

      state.container = container;
      state.sentinel = null;
      state.status = null;
      state.nextUrl = nextPageLink(document, window.location.href) || state.nextUrl;
      state.done = !state.nextUrl && !state.buffer.length;
      rememberVisibleRows(document);
    }

    return true;
  }

  function getObserverRootMargin() {
    const height = Math.max(0, window.innerHeight || 0);
    const margin = Math.min(720, Math.max(240, Math.round(height * 0.75)));
    return `${margin}px 0px`;
  }

  function finishIfExhausted(observer = state.observer) {
    if (!state.done || state.buffer.length) return false;
    if (observer) observer.disconnect();
    setStatus('— No more threads —', true);
    return true;
  }

  async function retryLoadMore() {
    if (state.pausedByRatings || state.fetching || state.scrollBusy) return;
    state.lastError = false;
    state.lastErrorCloudflare = false;
    state.scrollBusy = true;

    try {
      setStatus('Loading more threads…', true);
      const added = await drain(DRAIN_BATCH_SIZE);
      if (state.pausedByRatings) return;
      if (!state.lastError) setStatus('', false);
      if (!added && !state.lastError) finishIfExhausted();
    } finally {
      state.scrollBusy = false;
    }
  }

  function observeSentinel(sentinel) {
    if (typeof IntersectionObserver !== 'function') {
      setStatus('Infinite scroll is not supported by this browser.', true);
      return;
    }

    const observer = new IntersectionObserver(async ([entry]) => {
      if (state.pausedByRatings || !entry.isIntersecting || state.scrollBusy) return;
      state.scrollBusy = true;

      try {
        if (finishIfExhausted(observer)) return;

        setStatus('Loading more threads…', true);
        const added = await drain(DRAIN_BATCH_SIZE);
        if (state.pausedByRatings) return;
        if (!state.lastError) setStatus('', false);

        if (!added && !state.lastError) finishIfExhausted(observer);
      } finally {
        state.scrollBusy = false;
      }
    }, { rootMargin: getObserverRootMargin() });

    state.observer = observer;
    observer.observe(sentinel);
  }

  function setupScroll() {
    if (state.pausedByRatings || !ensureContainer()) return;
    if (!state.nextUrl && !state.buffer.length) return;

    const hasLiveSentinel = state.sentinel && state.sentinel.isConnected && state.sentinel.parentNode === state.container;
    if (hasLiveSentinel) {
      if (!state.observer) observeSentinel(state.sentinel);
      return;
    }

    if (state.observer) {
      state.observer.disconnect();
      state.observer = null;
    }

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
    observeSentinel(sentinel);
  }

  function isContainerRelevantNode(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
    return Boolean(
      node.matches?.('.structItemContainer, .structItemContainer-group, .js-threadList, .p-body-main, .block-body') ||
      node.querySelector?.('.structItemContainer, .structItemContainer-group, .js-threadList, .structItem--thread')
    );
  }

  function watchContainerChanges() {
    if (containerObserver) return;

    containerObserver = new MutationObserver((mutationList) => {
      if (state.pausedByRatings) return;
      for (const mutation of mutationList) {
        for (const node of mutation.addedNodes || []) {
          if (!isContainerRelevantNode(node)) continue;
          state.nextUrl = nextPageLink(document, window.location.href) || state.nextUrl;
          setupScroll();
          return;
        }
      }

      if (state.container && !state.container.isConnected) setupScroll();
    });

    containerObserver.observe(document.body, { childList: true, subtree: true });
  }

  async function init() {
    if (initialized || !document.body) return;
    initialized = true;

    addStyle(CSS);
    document.addEventListener(RATINGS_SORT_EVENT, (event) => setRatingsSortPaused(Boolean(event.detail?.active)));
    state.pausedByRatings = isRatingsSortActive();
    watchContainerChanges();
    state.container = findContainer();
    state.nextUrl = nextPageLink(document, window.location.href);
    rememberVisibleRows(document);

    if (state.pausedByRatings || !state.container || !state.nextUrl) return;

    setupScroll();
    await fetchMore();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else if (document.body) {
    init();
  } else {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  }
})();
