import type { Metadata } from 'next';
import '../index.css';

export const metadata: Metadata = {
  title: 'Ocean',
  description: 'Ocean — AI-native life and work companion',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
