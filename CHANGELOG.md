# Changelog

All notable changes to `jupyterlite-webmcp` are documented here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the
project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Security

- Replaced an insecure random-ID fallback.
- Rewrote the HTML-to-text conversion for output export as a single-pass
  scanner (fixes CodeQL multi-character sanitization alerts).

### Fixed

- React is held at 18 so the extension shares JupyterLab's copy; a guard
  fails the build if it drifts.
- Documentation corrections: console examples, Propose-mode abort behaviour,
  status-bar wording and broken links.

### Added

- A documentation site (quickstart, concepts, tool reference, roadmap) at
  https://alliecatowo.github.io/jupyterlite-web-mcp/.

### Changed

- Dependency updates, including `@jupyterlab/cells` 4.6.4 and
  `@lumino/disposable` 2.1.6.
- Python 3.10 or newer is now required (3.9 is end-of-life).
- Removed unused `@jupyterlab/coreutils`, `@jupyterlab/docregistry` and
  `@jupyterlab/nbformat` dependencies.
- Notebook detection when listing the workspace and in the notebook access
  command is now case-insensitive (`.IPYNB` counts as a notebook).
- Packaging: the Python package version is read from `package.json`, and the
  license is declared with PEP 639 metadata (`License-Expression: MIT`).
- Tagged releases now also create a GitHub Release with the built wheel and
  sdist attached.

## [0.1.0] - 2026-09-30

Initial release on PyPI as `jupyterlite-webmcp`.

### Added

- A prebuilt JupyterLab 4 / Notebook 7 / JupyterLite frontend extension that
  exposes the live notebook workspace to a browser agent through WebMCP
  (`document.modelContext`), with 22 tools to read, navigate, edit, run and
  review notebooks.
- Per-cell and per-notebook agent access levels (`write`, `read`, `none`),
  set only by the human.
- Review threads on cells, source ranges and outputs, stored in notebook
  metadata.
- Propose mode, where agent cell edits wait for the human to accept or deny.
- The Agent panel (Activity, Comments and Access tabs), presence markers and a
  status-bar indicator.

[Unreleased]: https://github.com/alliecatowo/jupyterlite-web-mcp/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/alliecatowo/jupyterlite-web-mcp/releases/tag/v0.1.0
