export interface GenflowConfig {
  backendUrl: string
  apiKey: string
  pollInterval: number
  claudeConcurrency: number
  claudeMaxRuntimeMs: number
  claudeIdleTimeoutMs: number
  autoStartPolling: boolean
  outputDir: string
}

export type SourceType = 'bokadirekt' | 'description' | 'website'

export interface GenJob {
  id: string
  source_url: string
  slug: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  deal_id: string | null
  demo_config_id: string | null
  source_type: SourceType
  source_text?: string
}

export interface JobResult {
  slug: string
  ok: boolean
  error?: string
}

export interface PageSpec {
  slug: string
  filename: string
  sections: string[]
  categoryOrder?: string[]
  reason: string
}

export interface Strategy {
  reasoning: string
  businessType: 'frisör' | 'spa' | 'nagel' | 'massage' | 'skönhet' | 'klinik' | 'annat'
  pages: PageSpec[]
  services: {
    total: number
    featuredForIndex: Array<{ namn: string; kategori: string; reason: string }>
    categoryOrder: string[]
  }
  reviews: {
    total: number
    displayMode: 'statiska-kort' | 'infinity-scroll' | 'skippa'
    placement: string
  }
  gallery: {
    needed: boolean
    layout: 'bento'
    placement?: string
    themes: string[]
  }
}

export type LogFn = (message: string) => void
