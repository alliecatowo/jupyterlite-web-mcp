# Contributing

Thanks for looking. Bug reports, questions, integration ideas and PRs are all
welcome. For anything non-trivial, open an issue first so we can agree on the
shape before you spend time on it.

## Setup

Requires Node 20+ and Python 3.11+. See [`docs/install.md`](docs/install.md) and
[`docs/architecture.md`](docs/architecture.md) for the layout.

```bash
git clone https://github.com/alliecatowo/jupyterlite-web-mcp.git
cd jupyterlite-web-mcp/packages/jupyterlite-webmcp
npm install
npm run build
```

## Before you open a PR

From `packages/jupyterlite-webmcp`:

```bash
npm run typecheck
npm test            # Jest unit tests
npm run lint
```

Browser tests live in `ui-tests/` (Playwright). Run them if you touched
anything user-visible.

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
