import type { AIProviderId } from '@/extensions/ai/aiProvidersService'

export type OpenSettingTarget =
  | { category: 'ai'; providerId?: AIProviderId }

