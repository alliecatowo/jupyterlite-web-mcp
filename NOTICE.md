# Third-party notices

This project (JupyterLite WebMCP) is licensed under the MIT License; see
`LICENSE`. This file documents third-party works it depends on, builds on,
or was studied against during development.

## Runtime and build dependencies

The following are used as installed dependencies (Python packages installed
via `requirements.txt`, and JupyterLab/JupyterLite packages depended on by
`packages/jupyterlite-webmcp/package.json`):

- **JupyterLite** (`jupyterlite-core`)
- **JupyterLab** (`@jupyterlab/*` packages)
- **Jupyter Notebook** (`notebook`)
- **jupyterlite-pyodide-kernel**
- **ipywidgets**

All of the above are Copyright (c) Project Jupyter Contributors, licensed
under the BSD 3-Clause License reproduced at the end of this file.

- **webmcp-types** — a TypeScript types-only `devDependency` used for
  editor/compiler support against the WebMCP API shape. It contributes no
  runtime code.

## Deployment substrate

The overall repository layout for building and deploying a JupyterLite
site — the `content/` directory convention, the `requirements.txt` package
pins, the `jupyter-lite.json` configuration, and the GitHub Pages build
workflow in `.github/workflows/deploy.yml` — follows the official
[`jupyterlite/demo`](https://github.com/jupyterlite/jupyterlite-demo)
repository/template. `jupyterlite/demo` is Copyright (c) Project Jupyter
Contributors, licensed under the BSD 3-Clause License reproduced below.

## Implementation references (not runtime dependencies)

- **[`jupyter-ai-contrib/jupyterlab-ai-commands`](https://github.com/jupyter-ai-contrib/jupyterlab-ai-commands)**
  (BSD 3-Clause, Project Jupyter) was studied as an implementation reference
  for resolving the active notebook, operating on the live notebook model
  (rather than stale on-disk bytes), stable cell ids, inserting/editing/
  deleting cells, running cells, and handling outputs and execution errors.
  The Jupyter adapter in `src/jupyter/*` of this project is an independent
  reimplementation against public JupyterLab APIs. It is not a runtime
  dependency of this project, and no source from it was copied verbatim.

- **[`jupyterlab/jupyterlab-commenting`](https://github.com/jupyterlab/jupyterlab-commenting)**
  (BSD 3-Clause, Project Jupyter) was studied only for interaction concepts
  around notebook/file commenting (threaded comments, anchoring to content,
  resolving discussions). No code or server component from it is used; the
  review feature in `src/review/*` of this project is a from-scratch,
  frontend-only, notebook-metadata-backed implementation with a different
  storage model and anchoring algorithm.

- The **WebMCP explainer** (Web Machine Learning Community Group) was used
  as the specification reference for the `document.modelContext` imperative
  tool-registration API this project implements against.

## BSD 3-Clause License text

The following license text applies to the Project Jupyter works listed
above (JupyterLite, JupyterLab, Jupyter Notebook,
jupyterlite-pyodide-kernel, ipywidgets, and `jupyterlite/demo`) and to
`jupyterlab-ai-commands` and `jupyterlab-commenting`, each under their own
copyright:

```text
BSD 3-Clause License

Copyright (c) 2015-2024, Project Jupyter Contributors
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice,
   this list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright
   notice, this list of conditions and the following disclaimer in the
   documentation and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its
   contributors may be used to endorse or promote products derived from
   this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
POSSIBILITY OF SUCH DAMAGE.
```

## This project

JupyterLite WebMCP itself (everything under `packages/jupyterlite-webmcp`
and this repository outside the third-party works listed above) is
Copyright (c) 2026 Allison Coleman, licensed under the MIT License; see
`LICENSE`.
