import type { Metadata } from 'next';
import i18n from '@ocean/ui/lib/i18n';
import '../index.css';

// SSR 前强制重置语言：模块级 i18n 单例在服务端进程内可能残留客户端
// changeLanguage('en') 的状态，导致服务端渲染 en 而客户端 hydration zh。
i18n.changeLanguage('zh');

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
