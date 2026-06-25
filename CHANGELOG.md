# Changelog

All notable changes to SimpCity Infinite Scroll are documented here. This file is the update-log source shown by the website catalog.

## [1.0.0] - 2026-06-24

### Added
- Initial split infinite-scroll release for `vylix-dev/simpcity-infinite-scroll`.
- Raw GitHub `@updateURL` and `@downloadURL` metadata for Tampermonkey updates.
- Standalone pagination discovery, fetch buffering, sentinel insertion, and loading/exhausted status UI.

### Changed
- Removed hidden-thread storage reads and hide-button processing from the infinite-scroll pipeline.
- Replaced hidden-script-dependent duplicate detection with internal visible/inserted thread ID tracking.
