# Content Strategy Analysis

You are a content strategist for a web agency. Analyze the following business data, look at the actual images, and make decisions about how to present services and images on the website.

## Business Data
$BUSINESS_DATA

## Selected Services ($SERVICE_COUNT total, in $CATEGORY_COUNT categories)
$SERVICES

## Selected Images ($IMAGE_COUNT total)
The image files are located at: `$IMAGES_DIR`

These are the filenames:
$IMAGE_FILES

**Read each image file** and classify it into one of these categories:
- `"lokal"` — interior, exterior, storefront, reception, decor
- `"personal"` — people, staff, portraits, team photos
- `"arbete"` — work being performed, treatments, services in action
- `"produkt"` — products, tools, equipment, before/after

## Your Task

1. **Read and classify every image** listed above
2. **Analyze the volume** of services and images
3. **Produce a content strategy** with active, reasoned decisions

### Services
- The services are listed in bokadirekt popularity order (most booked first).
- If there are many services (more than ~10), select the most representative ones for the main page ("featured"). Pick the top services per category so all categories are represented.
- Decide if remaining services should be on a separate `services.html` page or an expand/toggle section:
  - ~15 or fewer total services → expand (toggle "Visa fler" in the same page) is sufficient
  - More than ~15 total services → a separate `services.html` page is better
- Determine the best category display order based on what best represents this business.

### Images
Choose a layout type for each section based on how many images fit that section. Available layout types:
- `"single"` — 1 image, full width
- `"asymmetric-pair"` — 2 images, different sizes (visually interesting)
- `"grid-even"` — 3-4 images in an even grid (MUST be even — never 3 in a 2-column grid)
- `"carousel"` — 5+ images in a slider/carousel

Rules:
- NEVER create uneven grids. If the number of images doesn't fit an even grid, use carousel instead.
- Assign images to sections based on YOUR classification:
  - `lokal` → hero section and/or about section
  - `personal` → about section (NOT a dedicated team section — we never create team sections)
  - `arbete` → gallery/portfolio section
  - `produkt` → services section or gallery
- Pick the single best `lokal` image for the hero.
- Do NOT create a "team" section. Personal images go in about or gallery.

## Output Format

Respond with ONLY valid JSON, no other text:

```json
{
  "reasoning": "Your analysis and motivation for the decisions (2-4 sentences)",
  "imageClassifications": [
    {"file": "<filename>", "category": "<lokal|personal|arbete|produkt>", "description": "<short description>"}
  ],
  "services": {
    "total": <number>,
    "featuredCount": <number>,
    "featured": [
      {"namn": "<service name>", "kategori": "<category>", "reason": "<why featured>"}
    ],
    "separatePage": <true|false>,
    "pageType": "<services.html or expand>",
    "categoryOrder": ["<category1>", "<category2>"]
  },
  "images": {
    "total": <number>,
    "hero": {"file": "<filename>", "reason": "<why this image>"},
    "sections": {
      "gallery": {"files": ["<filename>"], "layout": "<layout-type>", "reason": "<motivation>"},
      "about": {"files": ["<filename>"], "layout": "<layout-type>"}
    }
  }
}
```

Only include sections that have images assigned to them. If no images match a category, omit that section.
