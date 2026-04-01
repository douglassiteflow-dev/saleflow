export const colors = {
  bg: { primary: "#FFFFFF", panel: "#F8FAFC" },
  text: { primary: "#0F172A", secondary: "#64748B", inverse: "#FFFFFF" },
  accent: { primary: "#4F46E5", primaryHover: "#4338CA" },
  status: { success: "#059669", warning: "#F59E0B", danger: "#DC2626" },
  border: { default: "#E2E8F0", input: "#CBD5E1" },
  outcome: {
    meeting_booked: "#059669", callback: "#F59E0B", not_interested: "#DC2626",
    no_answer: "#64748B", bad_number: "#1E293B", customer: "#4F46E5",
  },
} as const;

export const spacing = {
  page: "24px", card: "20px", section: "24px", element: "12px",
  buttonX: "16px", buttonY: "10px", inputX: "12px", inputY: "8px",
} as const;

export const typography = {
  fontFamily: {
    sans: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    mono: '"JetBrains Mono", ui-monospace, monospace',
  },
  pageTitle: { size: "24px", weight: "600" },
  sectionTitle: { size: "18px", weight: "600" },
  body: { size: "14px", weight: "400" },
  label: { size: "12px", weight: "500", transform: "uppercase" as const, tracking: "0.05em" },
  mono: { size: "13px", weight: "400" },
} as const;

export const layout = { maxWidth: "1280px", sidebarWidth: "240px", topbarHeight: "56px" } as const;
export const radii = { card: "8px", button: "6px", input: "6px", badge: "9999px" } as const;
