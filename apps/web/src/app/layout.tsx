import type { Metadata } from 'next';
import '../index.css';

export const metadata: Metadata = {
  title: { default: 'Ocean — AI agent for work', template: '%s · Ocean' },
  description: 'Explore Ocean Code, the Ocean workspace, persistent conversations, Skills and MCP integrations. Discover the open-source agent platform.',
  applicationName: 'Ocean',
  openGraph: {
    type: 'website',
    title: 'Ocean — AI agent for work',
    description: 'One Agent Core. Multiple Hosts. Persistent Sessions.',
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <style
          dangerouslySetInnerHTML={{
            __html: `
              ::highlight(ocean-conversation-matches) { background-color: #ffe19b; color: #352208; }
              ::highlight(ocean-conversation-match) { background-color: #ffab57; color: #352208; }
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
