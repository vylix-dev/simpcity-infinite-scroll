# SimpCity Infinite Scroll

Automatically load additional SimpCity thread-list pages as you scroll.

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/).
2. Open the raw userscript URL:
   <https://raw.githubusercontent.com/vylix-dev/simpcity-infinite-scroll/main/simpcity-infinite-scroll.user.js>
3. Tampermonkey will detect the `.user.js` file and prompt you to install it.

## Updates

Tampermonkey checks the metadata file declared in `@updateURL`:

<https://raw.githubusercontent.com/vylix-dev/simpcity-infinite-scroll/main/simpcity-infinite-scroll.meta.js>

Keep `@version` in `simpcity-infinite-scroll.user.js`, `simpcity-infinite-scroll.meta.js`, and `CHANGELOG.md` aligned for every release.

## Features

- Detects SimpCity thread-list containers and next-page links, including `/watched/threads`.
- Fetches additional pages with the active browser session.
- Buffers cloned thread rows before inserting them above a sentinel in batched DOM updates.
- Uses `IntersectionObserver` to load more rows before the visitor reaches the bottom.
- Updates the browser URL as later pages are inserted so refreshes reopen near the current page.
- Trims very long sessions back to 500 thread rows to reduce memory pressure.
- Retries Cloudflare/rate-limited page loads with backoff and exposes an inline Retry button if loading still fails.
- Tracks visible and inserted thread IDs internally to avoid duplicates.
- Pauses safely while SimpCity Thread Ratings is sorting every watched-thread page, then resumes when original order is restored.

## Pairing with companion scripts

This script does not read hidden-thread storage or inject hide buttons. If `SimpCity Hide Threads` is installed too, its own MutationObserver will process newly inserted rows.

If `SimpCity Thread Ratings` is installed too, Infinite Scroll pauses only while Ratings builds an all-page watched-thread sort. It reconnects after the user chooses **Original order**, so it cannot append rows into the completed sorted result.

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## License

MIT © vylix-dev.
