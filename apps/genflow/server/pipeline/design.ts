// design.ts — Color palette (v4.10.2 approach: no Colormind, no separate designPrompt call)
// Theme creation and design prompt generation happens inside the brief pipeline (Steps 2-3).

export function getColorPalette(customer?: { palette?: Record<string, string> } | null): string {
  if (customer?.palette) {
    return Object.entries(customer.palette).map(([k, v]) => `${k}: ${v}`).join('\n')
  }
  return 'No palette provided — choose colors based on the images and business type.'
}
