import type { Metadata } from 'next';
import '../index.css';

export const metadata: Metadata = {
  title: 'Ocean',
  description: 'Ocean — AI-native life and work companion',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
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
