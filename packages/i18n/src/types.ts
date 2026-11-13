export const locales = {
  en: 'English',
  frFR: 'Français',
  es: 'Español',
  'pt-BR': 'Português (Brasil)',
} as const

export type Langs = keyof typeof locales

export type LocaleKey = (typeof locales)[Langs]

export type I18nResources = {
  [key in Langs]?: { translation: Record<string, any> }
}
