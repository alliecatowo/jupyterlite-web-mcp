# Security policy

## Reporting a vulnerability

Please **do not** open a public issue for security problems. Use GitHub's
[private vulnerability reporting](https://github.com/alliecatowo/jupyterlite-web-mcp/security/advisories/new)
for this repository. Include what you found, steps to reproduce, and the
JupyterLab/JupyterLite and browser versions.

This is a small project maintained in spare time. Expect an acknowledgement
within about a week; fixes for confirmed issues are prioritized over features.

## Scope

The extension is frontend-only and runs in the user's browser. Especially
relevant reports:

- Any way for an agent to read, edit or run a cell that the notebook owner
  hid (`none`) or restricted to read-only, bypassing the access guard
  (`packages/jupyterlite-webmcp/src/access/`).
- Any way for an agent to change access levels (there is deliberately no tool
  for that).
- Tool inputs that escape their bounds or leak notebook content the owner did
  not expose.

## What access levels are (and aren't)

Access levels are a guardrail for the agent's registered tools, not a sandbox.
Known, documented limits — reports about these alone aren't vulnerabilities:
code an agent runs in a visible cell can read what the kernel can reach (e.g.
the saved `.ipynb`); access metadata is editable by anyone with file access;
and an unreadable access level fails open to `write`. See the README's
[Threat model](README.md#threat-model-what-access-levels-do-and-dont-guarantee).
Bypasses of the tool-level guard are in scope.

## Supported versions

Only the latest release / `main` receives fixes while the project is pre-1.0.
