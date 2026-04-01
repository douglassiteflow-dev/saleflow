import { describe, it, expect } from "vitest";
import { colors, spacing, typography, layout, radii } from "../tokens";

describe("design tokens", () => {
  describe("colors", () => {
    it("has bg tokens", () => {
      expect(colors.bg.primary).toBe("#FFFFFF");
      expect(colors.bg.panel).toBe("#F8FAFC");
    });

    it("has text tokens", () => {
      expect(colors.text.primary).toBe("#0F172A");
      expect(colors.text.secondary).toBe("#64748B");
      expect(colors.text.inverse).toBe("#FFFFFF");
    });

    it("has accent tokens", () => {
      expect(colors.accent.primary).toBe("#4F46E5");
      expect(colors.accent.primaryHover).toBe("#4338CA");
    });

    it("has status tokens", () => {
      expect(colors.status.success).toBe("#059669");
      expect(colors.status.warning).toBe("#F59E0B");
      expect(colors.status.danger).toBe("#DC2626");
    });

    it("has border tokens", () => {
      expect(colors.border.default).toBe("#E2E8F0");
      expect(colors.border.input).toBe("#CBD5E1");
    });

    it("has outcome tokens", () => {
      expect(colors.outcome.meeting_booked).toBe("#059669");
      expect(colors.outcome.callback).toBe("#F59E0B");
      expect(colors.outcome.not_interested).toBe("#DC2626");
      expect(colors.outcome.no_answer).toBe("#64748B");
      expect(colors.outcome.bad_number).toBe("#1E293B");
      expect(colors.outcome.customer).toBe("#4F46E5");
    });
  });

  describe("spacing", () => {
    it("has expected tokens", () => {
      expect(spacing.page).toBe("24px");
      expect(spacing.card).toBe("20px");
      expect(spacing.section).toBe("24px");
      expect(spacing.element).toBe("12px");
      expect(spacing.buttonX).toBe("16px");
      expect(spacing.buttonY).toBe("10px");
      expect(spacing.inputX).toBe("12px");
      expect(spacing.inputY).toBe("8px");
    });
  });

  describe("typography", () => {
    it("has font families", () => {
      expect(typography.fontFamily.sans).toContain("Inter");
      expect(typography.fontFamily.mono).toContain("JetBrains Mono");
    });

    it("has page title styles", () => {
      expect(typography.pageTitle.size).toBe("24px");
      expect(typography.pageTitle.weight).toBe("600");
    });

    it("has section title styles", () => {
      expect(typography.sectionTitle.size).toBe("18px");
      expect(typography.sectionTitle.weight).toBe("600");
    });

    it("has body styles", () => {
      expect(typography.body.size).toBe("14px");
      expect(typography.body.weight).toBe("400");
    });

    it("has label styles", () => {
      expect(typography.label.size).toBe("12px");
      expect(typography.label.weight).toBe("500");
      expect(typography.label.transform).toBe("uppercase");
      expect(typography.label.tracking).toBe("0.05em");
    });

    it("has mono styles", () => {
      expect(typography.mono.size).toBe("13px");
      expect(typography.mono.weight).toBe("400");
    });
  });

  describe("layout", () => {
    it("has expected tokens", () => {
      expect(layout.maxWidth).toBe("1280px");
      expect(layout.sidebarWidth).toBe("240px");
      expect(layout.topbarHeight).toBe("56px");
    });
  });

  describe("radii", () => {
    it("has expected tokens", () => {
      expect(radii.card).toBe("8px");
      expect(radii.button).toBe("6px");
      expect(radii.input).toBe("6px");
      expect(radii.badge).toBe("9999px");
    });
  });
});
