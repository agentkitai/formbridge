import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'FormBridge',
  description: 'Mixed-mode agent-human form submission framework',
  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/quickstart' },
      { text: 'API Reference', link: '/api/' },
      { text: 'MCP', link: '/mcp/' },
    ],
    sidebar: {
      '/guide/': [
        {
          text: 'Getting Started',
          items: [
            { text: 'Quickstart', link: '/guide/quickstart' },
            { text: 'Core Concepts', link: '/guide/concepts' },
          ],
        },
        {
          text: 'Walkthroughs',
          items: [
            { text: 'Vendor Onboarding', link: '/guide/walkthrough-vendor' },
            { text: 'Agent-Human Handoff', link: '/guide/walkthrough-handoff' },
            { text: 'Approval Workflow', link: '/guide/walkthrough-approval' },
          ],
        },
      ],
      '/api/': [
        {
          text: 'API Reference',
          items: [
            { text: 'Overview', link: '/api/' },
            { text: 'Submissions', link: '/api/submissions' },
            { text: 'Events', link: '/api/events' },
            { text: 'Approvals', link: '/api/approvals' },
            { text: 'Webhooks', link: '/api/webhooks' },
            { text: 'Analytics', link: '/api/analytics' },
          ],
        },
      ],
      '/mcp/': [
        {
          text: 'MCP Integration',
          items: [
            { text: 'Overview', link: '/mcp/' },
            { text: 'Tool Generation', link: '/mcp/tool-generation' },
          ],
        },
      ],
      '/react/': [
        {
          text: 'React Integration',
          items: [
            { text: 'Form Renderer', link: '/react/' },
          ],
        },
      ],
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/formbridge/formbridge' },
    ],
    search: {
      provider: 'local',
    },
  },
});
