# Website Generation Brief

## Business Data
Read the business data at: `$OUTPUT_DIR/företagsdata.json`

## Logo
$LOGO_URL

## Color Palette (extracted from logo)
These colors are extracted from the business logo. Use them as your base palette — you may adjust shades but stay within this color family:
$COLOR_PALETTE

## Image Descriptions
These images have been tagged with categories and descriptions. Use these instead of analyzing the images yourself:
$IMAGE_DESCRIPTIONS

## Selected Images
$SELECTED_IMAGES

Image files are at: `$OUTPUT_DIR/bilder/`

If no images were selected (empty list above), use high-quality stock images from Unsplash that match the business type. Use real Unsplash URLs like: https://images.unsplash.com/photo-XXXX?w=1200&q=80. Choose images that fit the business (salon, spa, massage, clinic, automotive, etc.). You MUST still have a hero image, gallery section, and visual content — just use stock instead of local files.

## Selected Services
ONLY include these services on the website — do NOT add any other services from the data file:
$SELECTED_SERVICES

## Customer Reviews
$REVIEWS

## Content Strategy
The following strategy was produced by a pre-analysis step. Follow it EXACTLY — do not override these decisions:
$STRATEGY

## Instructions

Follow this pipeline exactly:

### Step 1: Analyze
Read the business data JSON. Understand:
- What kind of business this is (salon, spa, clinic, etc.)
- Services offered, staff, opening hours
- Use the image descriptions above to understand the visual style
- Place images in sections matching their categories (lokal → hero/about, arbete → gallery, produkt → services)
- Do NOT create a dedicated "Personal" / "Team" section — skip it entirely. Staff names can be mentioned in the about section or footer if relevant, but never as a standalone section with photos.

### Step 2: Create Theme
Look at the business images — if there is a logo visible, extract the EXACT colors from it. The website colors MUST match the business brand. If no logo/brand colors are visible, choose colors based on the images and business type.

IMPORTANT: Follow the frontend-design skill guidelines:
- NEVER use generic fonts like Inter, Roboto, Arial, Source Sans, Montserrat, Poppins, or system fonts
- Choose DISTINCTIVE, characterful fonts that match the business vibe (e.g. a raw gym → bold condensed fonts, a luxury spa → elegant serifs)
- Browse the theme-factory skill references for inspiration, but create a UNIQUE theme for THIS business

Save to `$OUTPUT_DIR/theme.json`:
```json
{
  "primary": "#hex",
  "secondary": "#hex",
  "accent": "#hex",
  "background": "#hex",
  "surface": "#hex",
  "text": "#hex",
  "headingFont": "Font Name",
  "bodyFont": "Font Name",
  "mood": "description of the design mood"
}
```

### Step 3: Generate Design Prompt
Based on the theme, images, and business type, choose a design style that MATCHES this specific business. Do NOT pick randomly — analyze the images, colors, and business vibe.

Follow the frontend-design skill: commit to a BOLD aesthetic direction. Ask yourself:
- What makes this business UNIQUE? A raw crossfit gym is NOT the same as a luxury spa.
- What should the visitor FEEL? Energy? Calm? Power? Elegance?
- What one design choice will make this site UNFORGETTABLE?

Write a 3-paragraph design prompt to `$OUTPUT_DIR/prompt.md`.

### Step 4: Build Website
Build a complete, production-grade single-page website as a SINGLE HTML file with all CSS and JS inlined. The site must:
- Use the actual business data (name, staff, hours, contact info)
- ONLY show the services listed under "Selected Services" above — no others
- Embed the selected images using relative paths: `./bilder/filename.jpg` (images will be copied into site/ for deployment)
- Apply the generated theme colors and fonts (use Google Fonts CDN)
- Be responsive (mobile + desktop)
- Be visually distinctive — avoid generic AI aesthetics
- If the business has an aggregateRating in företagsdata.json (ratingValue > 0 and reviewCount > 0), display it in the hero section as a trust badge with stars (e.g. "4.9 av 5 — baserat på 2 328 omdömen"). If no rating data exists, skip this entirely.
- Follow the content strategy EXACTLY:
  - Show ONLY the featured services on the main page — do not include any others
  - Use the specified layout type for each image section (single, asymmetric-pair, grid-even, carousel)
  - If separatePage is true and pageType is "services.html", create a separate `$OUTPUT_DIR/site/services.html` with ALL services, in the same design and theme as index.html. Add a "Se alla våra tjänster" button on the main page linking to services.html.
  - If pageType is "expand", include all services in index.html but hide non-featured ones behind a "Visa fler" button with smooth JavaScript toggle animation
  - NEVER create uneven grids — if images don't fit evenly, use a carousel/slider instead
  - Place the hero image specified in the strategy
  - Follow the categoryOrder for service section ordering
  - "carousel" layout means a MANUAL image slider/carousel with navigation arrows — NOT auto-scrolling and NOT infinity loop. Only the reviews section uses auto-scrolling.
- Include a reviews/testimonials section using the customer reviews data above. The section MUST use:
  - Horizontally scrolling cards that auto-scroll infinitely (CSS animation, no JavaScript scroll needed)
  - Duplicate the cards in the DOM so the scroll loops seamlessly
  - Each card shows: customer name, star rating (filled/empty stars), review text, and the date
  - Cards should have a clean, elevated design (subtle shadow, rounded corners, consistent sizing)
  - The scroll should be smooth and continuous — pause on hover
  - If no reviews are available, skip this section entirely
- Navigation header MUST include (right side):
  - Phone number from företagsdata.json as a clickable tel: link
  - A prominent "Boka tid" button that links to: $BOOKING_URL
  - The "Boka tid" button must stand out visually (accent color background, white text, slightly rounded)
- All other "Boka tid" buttons/CTAs on the page must also link to: $BOOKING_URL
- Contact info (address, phone, email, opening hours) in footer
- All text in Swedish with correct ÅÄÖ — `<meta charset="UTF-8">` mandatory
- NEVER use emojis or Unicode decorative symbols
- Save to: `$OUTPUT_DIR/site/index.html`

Create the site/ directory if it doesn't exist.
