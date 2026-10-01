# Contributing

Thanks for looking. Bug reports, questions, integration ideas and PRs are all
welcome. For anything non-trivial, open an issue first so we can agree on the
shape before you spend time on it.

## Setup

Requires Node 22+ and Python 3.10+ (CI uses 3.11). See
[`docs/install.md`](docs/install.md) and
[`docs/architecture.md`](docs/architecture.md) for the layout.

The labextension build calls `jupyter-builder`, which comes from the
`jupyterlab` Python package, so install that **before** building:

```bash
git clone https://github.com/alliecatowo/jupyterlite-web-mcp.git
cd jupyterlite-web-mcp
python -m venv .venv && source .venv/bin/activate
pip install "jupyterlab~=4.6.0"

cd packages/jupyterlite-webmcp
npm ci
npm run build
```

## Development loop

To work against a local JupyterLab, install the package in editable mode and
link the labextension, then rebuild after each change:

```bash
# from packages/jupyterlite-webmcp, with the venv active
pip install -e .
jupyter labextension develop . --overwrite
npm run build          # after each change, then reload the browser
jupyter lab
```

To build and serve the JupyterLite demo site exactly as it is deployed, run
from the repository root:

```bash
./scripts/build-site.sh
python ui-tests/serve.py --directory dist   # http://127.0.0.1:8765/lab/index.html
```

`build-site.sh` creates (or reuses) `.venv`, installs `requirements.txt`,
builds the extension and writes the site to `dist/`. It fails if the extension
or the Pyodide kernel is missing from the output.

## Before you open a PR

From `packages/jupyterlite-webmcp`:

```bash
npm run typecheck
npm test               # Jest unit tests
npm run lint:check     # ESLint + Prettier, same as CI
```

`npm run lint` applies the same rules and fixes what it can.

### Browser tests

The Playwright tests in `ui-tests/` run against the built site in `dist/`.
Run them if you touched anything user-visible:

```bash
./scripts/build-site.sh
cd ui-tests
npm ci
npx playwright install chromium
npx playwright test
```

The test server (`ui-tests/serve.py`) sends the same cross-origin isolation
headers as the production deployment.

## Releases

Releases are cut by the maintainer: bump the version in
`packages/jupyterlite-webmcp/package.json`, update `CHANGELOG.md`, and push a
`vX.Y.Z` tag. The [`release.yml`](.github/workflows/release.yml) workflow
builds and smoke-tests the wheel, publishes to PyPI after an approval, and
creates the GitHub Release.

## Guidelines

- Keep the access model intact: an agent must never be able to widen its own
  permissions. Changes under `src/access/` need tests.
- Tool changes must update [`docs/webmcp-tools.md`](docs/webmcp-tools.md).
- Small, focused PRs with a clear description beat large ones.
- Be kind: see the [Code of Conduct](CODE_OF_CONDUCT.md).

## Security

Please report vulnerabilities privately — see [`SECURITY.md`](SECURITY.md).

## License

By contributing you agree your contribution is licensed under the MIT license.
