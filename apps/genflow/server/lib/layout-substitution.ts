import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import type { PageSpec, Strategy } from './types'

export function renderPageFromLayout(
  pageSpec: PageSpec,
  _strategy: Strategy,
  outputDir: string,
): void {
  const contentPath = join(outputDir, 'pages', `${pageSpec.slug}.content.html`)
  const layoutPath = join(outputDir, 'layout.html')
  const sitePath = join(outputDir, 'site', pageSpec.filename)

  if (!existsSync(contentPath)) {
    throw new Error(`Content-fragment saknas: ${contentPath}`)
  }
  if (!existsSync(layoutPath)) {
    throw new Error(`Layout saknas: ${layoutPath}`)
  }

  const content = readFileSync(contentPath, 'utf-8')
  const layout = readFileSync(layoutPath, 'utf-8')
  const businessName = readBusinessName(outputDir)
  const pageTitle = buildPageTitle(pageSpec.slug, businessName)
  const pageDescription = buildPageDescription(pageSpec.slug, businessName)

  let html = layout
    .replace('{{PAGE_TITLE}}', escapeHtml(pageTitle))
    .replace('{{PAGE_DESCRIPTION}}', escapeHtml(pageDescription))
    .replace('<!-- CONTENT -->', content)

  // Sätt active-klass på nav-länk för denna sida
  html = setActiveNav(html, pageSpec.slug)

  mkdirSync(dirname(sitePath), { recursive: true })
  writeFileSync(sitePath, html)
}

function readBusinessName(outputDir: string): string {
  try {
    const dataPath = join(outputDir, 'företagsdata.json')
    const data = JSON.parse(readFileSync(dataPath, 'utf-8'))
    return data.namn ?? data.name ?? 'Företag'
  } catch {
    return 'Företag'
  }
}

function buildPageTitle(slug: string, businessName: string): string {
  const titles: Record<string, string> = {
    index: businessName,
    tjanster: `Tjänster — ${businessName}`,
    'om-oss': `Om oss — ${businessName}`,
    galleri: `Galleri — ${businessName}`,
    kontakt: `Kontakt — ${businessName}`,
  }
  return titles[slug] ?? businessName
}

function buildPageDescription(slug: string, businessName: string): string {
  const descriptions: Record<string, string> = {
    index: `Välkommen till ${businessName}. Boka tid online.`,
    tjanster: `Alla tjänster och priser hos ${businessName}.`,
    'om-oss': `Läs mer om ${businessName} — vår historia och värderingar.`,
    galleri: `Bildgalleri från ${businessName}.`,
    kontakt: `Kontakta ${businessName} — adress, telefon och öppettider.`,
  }
  return descriptions[slug] ?? businessName
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function setActiveNav(html: string, slug: string): string {
  const activeRe = new RegExp(
    `(<a[^>]*data-page=["']${slug}["'][^>]*)(class=["']([^"']*)["'])?`,
  )
  return html.replace(activeRe, (_match, prefix: string, classAttr: string | undefined, classes: string | undefined) => {
    if (classAttr) {
      return `${prefix}class="${classes} active"`
    }
    return `${prefix} class="active"`
  })
}
