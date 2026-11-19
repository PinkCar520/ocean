import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from '../locales/en.json';
import zh from '../locales/zh.json';

// 语言策略：
// - SSR 与客户端首帧统一固定 zh，避免模块级单例被 changeLanguage 污染后
//   服务端渲染与客户端 hydration 语言不一致（React Hydration mismatch）。
// - 用户语言偏好存于后端 UserPreference，由 App useEffect 在 hydration 后恢复。
i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      zh: { translation: zh },
    },
    lng: 'zh',
    fallbackLng: 'zh',
    interpolation: {
      escapeValue: false,
    },
  });

export function resolvePreferredLanguage(preference: string): string {
  if (preference !== 'auto') return preference;
  if (typeof navigator === 'undefined') return 'zh';

  const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const locale of languages) {
    const language = locale?.toLowerCase().split('-')[0];
    if (language === 'en' || language === 'zh') return language;
  }
  return 'zh';
}

export default i18n;
