# Changelog

All notable changes to SimpCity Infinite Scroll are documented here. This file is the update-log source shown by the website catalog.

## [Unreleased]

### Added

### Changed

### Fixed

### Security

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
