import type { Metadata } from 'next';
import '../index.css';

export const metadata: Metadata = {
  title: 'Ocean',
  description: 'Ocean — AI-native life and work companion',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>\n        {/* Custom Highlight API selectors are valid browser CSS but not yet parsed by the Tailwind/Turbopack CSS pipeline. */}\n        <style dangerouslySetInnerHTML={{ __html: `\n          ::highlight(ocean-conversation-matches) { background-color: #ffe19b; color: #352208; }\n          ::highlight(ocean-conversation-match) { background-color: #ffab57; color: #352208; }\n        ` }} />\n      </head>\n      <body>{children}</body>
    </html>
  );
}
