# Design System

Complete reference for SaleFlow frontend design tokens and UI components.

## Colors

All colors are defined in `src/design/tokens.ts` and mirrored as CSS variables in `tailwind.css`.

### Backgrounds

| Token | Value | Usage |
|-------|-------|-------|
| `--color-bg-primary` | `#FFFFFF` | Primary content area, cards, inputs |
| `--color-bg-panel` | `#F8FAFC` | Page background, panel backgrounds |

### Text

| Token | Value | Usage |
|-------|-------|-------|
| `--color-text-primary` | `#0F172A` | Main body text, headings |
| `--color-text-secondary` | `#64748B` | Secondary text, labels, hints |
| `--color-text-inverse` | `#FFFFFF` | Text on dark backgrounds (buttons) |

### Accent

| Token | Value | Usage |
|-------|-------|-------|
| `--color-accent` | `#4F46E5` | Primary interactive elements, links |
| `--color-accent-hover` | `#4338CA` | Hover state for accent elements |

### Status

| Token | Value | Usage |
|-------|-------|-------|
| `--color-success` | `#059669` | Success states, positive outcomes |
| `--color-warning` | `#F59E0B` | Warning states, pending outcomes |
| `--color-danger` | `#DC2626` | Error states, destructive actions |

### Borders

| Token | Value | Usage |
|-------|-------|-------|
| `--color-border` | `#E2E8F0` | General borders, dividers |
| `--color-border-input` | `#CBD5E1` | Input field borders |

### Outcome Status Colors

| Status | Color | Usage |
|--------|-------|-------|
| `meeting_booked` | `#059669` | Call result: Meeting booked |
| `callback` | `#F59E0B` | Call result: Callback scheduled |
| `not_interested` | `#DC2626` | Call result: Not interested |
| `no_answer` | `#64748B` | Call result: No answer |
| `bad_number` | `#1E293B` | Call result: Invalid number |
| `customer` | `#4F46E5` | Call result: Became customer |

## Spacing

All spacing values use standard 4px base unit. Defined in `src/design/tokens.ts` as CSS variables.

| Token | Value | Usage |
|-------|-------|-------|
| `--spacing-page` | `24px` | Page padding, section gaps |
| `--spacing-card` | `20px` | Inside cards and containers |
| `--spacing-section` | `24px` | Space between major sections |
| `--spacing-element` | `12px` | Small component spacing |
| `--spacing-button-x` | `16px` | Button horizontal padding |
| `--spacing-button-y` | `10px` | Button vertical padding |
| `--spacing-input-x` | `12px` | Input horizontal padding |
| `--spacing-input-y` | `8px` | Input vertical padding |

## Typography

### Fonts

| Token | Value |
|-------|-------|
| `--font-sans` | Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif |
| `--font-mono` | "JetBrains Mono", ui-monospace, monospace |

### Type Styles

| Style | Size | Weight | Usage |
|-------|------|--------|-------|
| **Page Title** | 24px | 600 | Page headings (h1 equivalent) |
| **Section Title** | 18px | 600 | Section headings (h3 equivalent) |
| **Body** | 14px | 400 | Main body text |
| **Label** | 12px | 500 | Form labels, small text (UPPERCASE) |
| **Mono** | 13px | 400 | Code, phone numbers, IDs (monospace) |

#### Label Specifics
- Text transform: UPPERCASE
- Letter spacing: 0.05em (tracking)
- Used for form field labels and secondary text

## Layout

| Token | Value | Usage |
|-------|-------|-------|
| `--spacing-page` (via layout) | 24px | Page gutter/padding |
| `maxWidth` | 1280px | Content max-width |
| `sidebarWidth` | 240px | Left sidebar fixed width |
| `topbarHeight` | 56px | Top navigation fixed height |

## Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `radii.card` | 8px | Card containers |
| `radii.button` | 6px | Button borders |
| `radii.input` | 6px | Input field borders |
| `radii.badge` | 9999px | Pill-shaped badges |

## Component Variants

### Button

**Variants:**

- `primary` — Indigo background, white text (main action)
- `secondary` — White background, primary text (alternative action)
- `danger` — Red background, white text (destructive)
- `outcome` — White with 2px border (call outcome selector)

**Sizes:**

- `default` — 36px height, 14px text
- `lg` — 48px height, 16px text

**States:**

- Default, hover (20% darker background)
- Focus: 2px ring outline
- Disabled: 50% opacity, no pointer

### Card

- Background: `--color-bg-primary` (#FFFFFF)
- Border: 1px solid `--color-border`
- Border radius: 8px
- Padding: 20px (--spacing-card)

### Badge

Status badges with colored backgrounds and borders.

| Status | BG Color | Text Color | Border Color |
|--------|----------|------------|--------------|
| new | #DBEAFE | #1E40AF | #93C5FD |
| assigned | #EEF2FF | #312E81 | #C7D2FE |
| callback | #FEF3C7 | #92400E | #FDE68A |
| meeting_booked | #ECFDF5 | #065F46 | #A7F3D0 |
| not_interested | #FEE2E2 | #7F1D1D | #FECACA |
| quarantine | #FFEDD5 | #92400E | #FDBA74 |
| bad_number | #F8FAFC | #334155 | #CBD5E1 |
| customer | #F3F4F6 | #374151 | #D1D5DB |
| no_answer | #F1F5F9 | #475569 | #CBD5E1 |
| scheduled | #E0F2FE | #0C4A6E | #BAE6FD |
| completed | #ECFDF5 | #065F46 | #A7F3D0 |
| cancelled | #FEE2E2 | #7F1D1D | #FECACA |

Border radius: 9999px (pill-shaped)
Padding: 2.5px horizontal, 0.5px vertical
Font size: 12px, medium weight

### Input

- Background: white (`--color-bg-primary`)
- Border: 1px solid `--color-border-input`
- Border radius: 6px
- Padding: 12px horizontal, 8px vertical
- Focus: 2px ring outline with accent color
- Font size: 14px

## Responsive Behavior

### Grid Layouts

- Dashboard stats: 1 column (mobile) → 3 columns (sm breakpoint)
- Dialer page: 3fr 2fr grid (lead info + outcome panel)
- Lead detail: 3fr 2fr grid (info + empty right column for balance)

### Key Breakpoints

Using Tailwind's default breakpoints via utilities:
- `sm`: 640px and up
- `md`: 768px and up
- `lg`: 1024px and up

## Example Usage

### Using Design Tokens in Components

```tsx
import { colors, spacing, typography } from "@/design/tokens";

// In styles or inline
<div style={{
  backgroundColor: colors.bg.primary,
  padding: spacing.card,
  color: colors.text.primary,
}}>
  Content
</div>

// Via Tailwind/CSS variables
<div className="bg-[var(--color-bg-primary)] p-[var(--spacing-card)]">
  Content
</div>

// Type-safe token access
import { colors } from "@/design/tokens";
const accentColor = colors.accent.primary; // "#4F46E5"
```

### Applying Typography

```tsx
// Page title
<h1 style={{
  fontSize: typography.pageTitle.size,
  fontWeight: typography.pageTitle.weight,
}}>
  Dashboard
</h1>

// Label
<label style={{
  fontSize: typography.label.size,
  fontWeight: typography.label.weight,
  textTransform: typography.label.transform,
  letterSpacing: typography.label.tracking,
}}>
  Email Address
</label>
```

## Dark Mode

Currently not implemented. Light mode only.

## Accessibility

- All interactive elements have focus visible states (2px ring outline)
- Disabled states clearly indicated (opacity: 50%, pointer-events: none)
- Semantic HTML (buttons, links, form inputs)
- Label associations with form fields
- ARIA attributes used in custom components (timeline, outcome panel)

## Token Synchronization

Design tokens are maintained in two places:

1. **TypeScript:** `src/design/tokens.ts` (for runtime use)
2. **CSS:** `tailwind.css` (via `@theme inline`) (for Tailwind utilities)

Both must be kept in sync. When adding new tokens:
1. Add to `src/design/tokens.ts` object structure
2. Mirror the value(s) in `tailwind.css` under `@theme inline`

## Color Palette

Complete hex color reference:

```
Neutrals:
  #FFFFFF    - White (backgrounds)
  #F8FAFC    - Light slate (panel bg)
  #E2E8F0    - Border default
  #CBD5E1    - Border input
  #64748B    - Text secondary / no_answer status
  #0F172A    - Text primary

Accent:
  #4F46E5    - Primary accent / customer status
  #4338CA    - Accent hover

Status:
  #059669    - Success / meeting_booked
  #F59E0B    - Warning / callback
  #DC2626    - Danger / not_interested
  #1E293B    - Bad number status
```
