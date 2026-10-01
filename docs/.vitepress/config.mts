import { defineConfig } from 'vitepress';

const repo = 'https://github.com/alliecatowo/jupyterlite-web-mcp';

// GitHub Pages serves project sites under /<repo>/. Set DOCS_BASE=/ when the
// site moves to its own domain or a Vercel project.
const base = process.env.DOCS_BASE ?? '/jupyterlite-web-mcp/';

export default defineConfig({
  title: 'JupyterLite WebMCP',
  description:
    'A JupyterLab / JupyterLite extension that lets a browser agent read, edit, run and review the notebook you already have open, through WebMCP.',
  base,
  cleanUrls: true,
  lastUpdated: true,
  head: [
    ['meta', { name: 'theme-color', content: '#d4a017' }],
    ['meta', { property: 'og:title', content: 'JupyterLite WebMCP' }],
    [
      'meta',
      {
        property: 'og:description',
        content:
          'Your notebook is already in the browser. Now your agent can be too.'
      }
    ]
  ],
  themeConfig: {
    nav: [
      { text: 'Guide', link: '/install' },
      { text: 'Tools', link: '/webmcp-tools' },
      { text: 'Live demo', link: 'https://jupyterlite-web-mcp.vercel.app/lab/index.html' },
      { text: 'PyPI', link: 'https://pypi.org/project/jupyterlite-webmcp/' }
    ],
    sidebar: [
      {
        text: 'Get started',
        items: [{ text: 'Install', link: '/install' }]
      },
      {
        text: 'Using it',
        items: [
          { text: 'Tool reference (22 tools)', link: '/webmcp-tools' },
          { text: 'Propose / Deny mode', link: '/propose-mode' },
          { text: 'Multiplayer', link: '/multiplayer' }
        ]
      },
      {
        text: 'Under the hood',
        items: [
          { text: 'Architecture', link: '/architecture' },
          { text: 'WebMCP compatibility', link: '/webmcp-compatibility' },
          { text: 'Release checklist', link: '/release-checklist' }
        ]
      },
      {
        text: 'Project',
        items: [
          { text: 'Changelog', link: `${repo}/blob/main/CHANGELOG.md` },
          { text: 'Contributing', link: `${repo}/blob/main/CONTRIBUTING.md` },
          { text: 'Security', link: `${repo}/blob/main/SECURITY.md` }
        ]
      }
    ],
    socialLinks: [
      { icon: 'github', link: repo },
      { icon: 'githubsponsors' as any, link: 'https://github.com/sponsors/alliecatowo' }
    ],
    editLink: {
      pattern: `${repo}/edit/main/docs/:path`,
      text: 'Edit this page on GitHub'
    },
    search: { provider: 'local' },
    footer: {
      message: 'Released under the MIT License. Winner of the OpenAI WebMCP Challenge.',
      copyright: 'Allison Coleman (@alliecatowo), with Juan Mendoza (@mennymendoza)'
    }
  }
});
