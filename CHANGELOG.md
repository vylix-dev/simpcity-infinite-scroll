# Changelog

All notable changes to SimpCity Infinite Scroll are documented here. This file is the update-log source shown by the website catalog.

## [Unreleased]

### Added

### Changed

### Fixed

### Security

## [1.0.6] - 2026-07-17

### Changed
- Reconnected Infinite Scroll after Thread Ratings restores watched threads to original order.
- Made Infinite Scroll status and sentinel span the full Thread Grid row.

## [1.0.5] - 2026-07-17

### Changed
- Pause infinite-scroll insertion while Thread Ratings sorts all watched-thread pages.

## [1.0.4] - 2026-07-05

### Changed
- Improved infinite-scroll URL state, batching, memory trimming, theme compatibility, and Cloudflare retry handling.

## [1.0.3] - 2026-06-27

### Changed
- Removed the retired alternate domain from supported matches.

## [1.0.2] - 2026-06-26

### Changed
- Switched Tampermonkey dashboard icon metadata from SVG to PNG assets for reliable rendering.

## [1.0.1] - 2026-06-26

### Changed
- Added vylix logo metadata so Tampermonkey dashboard entries use the project icon.

## [1.0.0] - 2026-06-24

### Added
- Initial split infinite-scroll release for `vylix-dev/simpcity-infinite-scroll`.
- Raw GitHub `@updateURL` and `@downloadURL` metadata for Tampermonkey updates.
- Standalone pagination discovery, fetch buffering, sentinel insertion, and loading/exhausted status UI.

### Changed
- Removed hidden-thread storage reads and hide-button processing from the infinite-scroll pipeline.
- Replaced hidden-script-dependent duplicate detection with internal visible/inserted thread ID tracking.
