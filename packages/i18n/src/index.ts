import type { InitOptions } from 'i18next'
import i18next, { deepMerge, initialize } from './core'

import enDesktop from '../../../locales/en.json'
import frDesktop from '../../../locales/fr-FR.json'
import esDesktop from '../../../locales/es.json'
import ptBRDesktop from '../../../locales/pt-BR.json'

import enEditor from '../../../locales/editor/en.json'
import frEditor from '../../../locales/editor/frFR.json'
import esEditor from '../../../locales/editor/es.json'
import ptBREditor from '../../../locales/editor/ptBR.json'

import type { Langs } from './types'

export * from './core'

const langMap = {
  en: { desktop: enDesktop, editor: enEditor },
  frFR: { desktop: frDesktop, editor: frEditor },
  es: { desktop: esDesktop, editor: esEditor },
  'pt-BR': { desktop: ptBRDesktop, editor: ptBREditor },
} as const

export const desktopResources = Object.fromEntries(
  Object.entries(langMap).map(([key, { desktop }]) => [key, { translation: desktop }]),
)

export const editorResources = Object.fromEntries(
  Object.entries(langMap).map(([key, { editor }]) => [key, { translation: (editor as any).editor }]),
)

export const resources = Object.fromEntries(
  Object.entries(langMap).map(([key, { desktop, editor }]) => [
    key,
    { translation: deepMerge(desktop, (editor as any).editor) },
  ]),
)

export async function i18nInit(options?: InitOptions) {
  await initialize({ resources, ...options })
}

export function changeLng(lng: Langs) {
  return i18next.changeLanguage(lng)
}

export default i18next
