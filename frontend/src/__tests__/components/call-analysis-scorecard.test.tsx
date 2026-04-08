import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CallAnalysisModal } from "@/components/call-analysis-modal";
import type { Scorecard, TalkRatio, SentimentAnalysis } from "@/api/types";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const BASE_ANALYSIS = {
  conversation: [
    { speaker: "Säljare", text: "Hej!" },
    { speaker: "Kund", text: "Hej, vad gäller det?" },
  ],
  summary: "Bra samtal med intresserad kund.",
  meeting_time: null,
  customer_needs: [],
  objections: [],
  positive_signals: [],
  score: {
    opening: { score: 7, comment: "Bra öppning" },
    needs_discovery: { score: 6, comment: "Okej behovsanalys" },
    pitch: { score: 8, comment: "Stark pitch" },
    objection_handling: { score: 5, comment: "Hantera invändningar bättre" },
    closing: { score: 7, comment: "Okej avslut" },
    overall: 6.6,
    top_feedback: "Fokusera mer på att lyssna aktivt.",
  },
};

const SCORECARD: Scorecard = {
  opening: {
    avg: 8.0,
    "Hälsning och ton": { score: 4, comment: "Trevlig ton" },
    "Bygger rapport": { score: 4, comment: "Bra rapport" },
    "Presenterar sig": { score: 5, comment: "Tydlig presentation" },
    "Väcker intresse": { score: 4, comment: "Bra intresseväckare" },
    "Inledning": { score: 4, comment: "Bra inledning" },
  },
  discovery: {
    avg: 7.0,
    "Ställer öppna frågor": { score: 4, comment: "Bra frågor" },
    "Lyssnar aktivt": { score: 3, comment: "Kan förbättras" },
    "Identifierar behov": { score: 4, comment: "Tydliga behov" },
    "Sammanfattar kundens situation": { score: 3, comment: "Mer sammanfattning" },
    "Följdfrågor": { score: 4, comment: "Bra följdfrågor" },
  },
  pitch: {
    avg: 8.5,
    "Relevant för kundens behov": { score: 5, comment: "Perfekt koppling" },
    "Tydlig värdeproposition": { score: 4, comment: "Tydlig" },
    "Konkreta exempel": { score: 4, comment: "Bra exempel" },
    "Differentiering": { score: 5, comment: "Stark differentiering" },
    "Engagemang": { score: 4, comment: "Bra engagemang" },
  },
  objection_handling: {
    avg: 6.0,
    "Erkänner invändningen": { score: 3, comment: "Ok" },
    "Hanterar med fakta": { score: 3, comment: "Mer fakta behövs" },
    "Vänder till fördel": { score: 3, comment: "Kan bli bättre" },
    "Behåller positiv ton": { score: 4, comment: "Bra ton" },
    "Bekräftar förståelse": { score: 3, comment: "Mer bekräftelse" },
  },
  closing: {
    avg: 7.5,
    "Sammanfattar värde": { score: 4, comment: "Bra summering" },
    "Föreslår nästa steg": { score: 4, comment: "Tydliga steg" },
    "Begär beslut": { score: 4, comment: "Bra" },
    "Sätter datum": { score: 3, comment: "Ok" },
    "Positiv avslutning": { score: 4, comment: "Trevlig avslutning" },
  },
  overall_avg: 7.4,
};

const TALK_RATIO_NORMAL: TalkRatio = {
  seller_pct: 50,
  customer_pct: 50,
  longest_monolog_seconds: 30,
  avg_seller_turn_seconds: 12,
  avg_customer_turn_seconds: 11,
};

const TALK_RATIO_HIGH_SELLER: TalkRatio = {
  seller_pct: 70,
  customer_pct: 30,
  longest_monolog_seconds: 90,
  avg_seller_turn_seconds: 25,
  avg_customer_turn_seconds: 10,
};

const SENTIMENT_POSITIVE: SentimentAnalysis = {
  overall: "POSITIVE",
  positive_pct: 65,
  negative_pct: 10,
  neutral_pct: 25,
};

const SENTIMENT_NEGATIVE: SentimentAnalysis = {
  overall: "NEGATIVE",
  positive_pct: 10,
  negative_pct: 60,
  neutral_pct: 30,
};

const SENTIMENT_NEUTRAL: SentimentAnalysis = {
  overall: "NEUTRAL",
  positive_pct: 30,
  negative_pct: 20,
  neutral_pct: 50,
};

const DEFAULT_PROPS = {
  analysis: BASE_ANALYSIS,
  companyName: "Testföretag AB",
  onClose: vi.fn(),
};

// ─── 25-point scorecard ───────────────────────────────────────────────────────

describe("25-point scorecard", () => {
  it("renders scorecard section heading when scorecard is present", () => {
    render(<CallAnalysisModal {...DEFAULT_PROPS} analysis={{ ...BASE_ANALYSIS, scorecard: SCORECARD }} />);
    expect(screen.getByText("Betyg (25p)")).toBeInTheDocument();
  });

  it("renders all 5 category labels", () => {
    render(<CallAnalysisModal {...DEFAULT_PROPS} analysis={{ ...BASE_ANALYSIS, scorecard: SCORECARD }} />);
    expect(screen.getByText("Öppning")).toBeInTheDocument();
    expect(screen.getByText("Behovsanalys")).toBeInTheDocument();
    expect(screen.getByText("Pitch")).toBeInTheDocument();
    expect(screen.getByText("Invändningshantering")).toBeInTheDocument();
    expect(screen.getByText("Avslut")).toBeInTheDocument();
  });

  it("shows overall_avg in the header instead of legacy overall", () => {
    render(<CallAnalysisModal {...DEFAULT_PROPS} analysis={{ ...BASE_ANALYSIS, scorecard: SCORECARD }} />);
    expect(screen.getByText("7.4/10 totalt")).toBeInTheDocument();
  });

  it("shows category avg score", () => {
    render(<CallAnalysisModal {...DEFAULT_PROPS} analysis={{ ...BASE_ANALYSIS, scorecard: SCORECARD }} />);
    // Opening avg is 8.0
    expect(screen.getByText("8.0/10")).toBeInTheDocument();
  });

  it("expands a category to show sub-questions", async () => {
    const user = userEvent.setup();
    render(<CallAnalysisModal {...DEFAULT_PROPS} analysis={{ ...BASE_ANALYSIS, scorecard: SCORECARD }} />);

    const openingButton = screen.getByRole("button", { name: /Öppning/i });
    await user.click(openingButton);

    expect(screen.getByText("Hälsning och ton")).toBeInTheDocument();
    expect(screen.getByText("Bygger rapport")).toBeInTheDocument();
  });

  it("shows sub-question score and comment when expanded", async () => {
    const user = userEvent.setup();
    render(<CallAnalysisModal {...DEFAULT_PROPS} analysis={{ ...BASE_ANALYSIS, scorecard: SCORECARD }} />);

    const openingButton = screen.getByRole("button", { name: /Öppning/i });
    await user.click(openingButton);

    // Comment text is rendered inside curly-quote marks via &ldquo;...&rdquo;
    expect(screen.getByText(/Trevlig ton/)).toBeInTheDocument();
    // Multiple questions share the same score value — check at least one is present
    expect(screen.getAllByText("4/5").length).toBeGreaterThan(0);
  });

  it("collapses category on second click", async () => {
    const user = userEvent.setup();
    render(<CallAnalysisModal {...DEFAULT_PROPS} analysis={{ ...BASE_ANALYSIS, scorecard: SCORECARD }} />);

    const openingButton = screen.getByRole("button", { name: /Öppning/i });
    await user.click(openingButton);
    expect(screen.getByText("Hälsning och ton")).toBeInTheDocument();

    await user.click(openingButton);
    expect(screen.queryByText("Hälsning och ton")).not.toBeInTheDocument();
  });
});

// ─── Bakåtkompatibilitet (legacy 5-point fallback) ────────────────────────────

describe("legacy 5-point fallback", () => {
  it("renders legacy heading 'Betyg' when scorecard is absent", () => {
    render(<CallAnalysisModal {...DEFAULT_PROPS} />);
    expect(screen.getByText("Betyg")).toBeInTheDocument();
    expect(screen.queryByText("Betyg (25p)")).not.toBeInTheDocument();
  });

  it("renders all legacy 5 ScoreBar categories", () => {
    render(<CallAnalysisModal {...DEFAULT_PROPS} />);
    // Label text for legacy bars
    expect(screen.getByText("Öppning")).toBeInTheDocument();
    expect(screen.getByText("Behovsanalys")).toBeInTheDocument();
    expect(screen.getByText("Pitch")).toBeInTheDocument();
    expect(screen.getByText("Invändningshantering")).toBeInTheDocument();
    expect(screen.getByText("Avslut")).toBeInTheDocument();
  });

  it("shows legacy overall in header", () => {
    render(<CallAnalysisModal {...DEFAULT_PROPS} />);
    expect(screen.getByText("6.6/10 totalt")).toBeInTheDocument();
  });

  it("shows legacy score comments", () => {
    render(<CallAnalysisModal {...DEFAULT_PROPS} />);
    // Comments are wrapped in curly-quote marks via &ldquo;...&rdquo;
    expect(screen.getByText(/Bra öppning/)).toBeInTheDocument();
    expect(screen.getByText(/Stark pitch/)).toBeInTheDocument();
  });

  it("does not render scorecard section when scorecard is absent", () => {
    render(<CallAnalysisModal {...DEFAULT_PROPS} />);
    expect(screen.queryByText("Betyg (25p)")).not.toBeInTheDocument();
    // No expand buttons for scorecard categories
    const expandButtons = screen.queryAllByRole("button", { name: /Behovsanalys/ });
    // Legacy ScoreBar labels are spans, not buttons
    for (const btn of expandButtons) {
      expect(btn).not.toHaveAttribute("aria-expanded");
    }
  });
});

// ─── Talk ratio ───────────────────────────────────────────────────────────────

describe("talk ratio section", () => {
  it("renders 'Talfördelning' heading when talk_ratio is present", () => {
    render(<CallAnalysisModal {...DEFAULT_PROPS} analysis={{ ...BASE_ANALYSIS, talk_ratio: TALK_RATIO_NORMAL }} />);
    expect(screen.getByText("Talfördelning")).toBeInTheDocument();
  });

  it("does not render talk ratio section when absent", () => {
    render(<CallAnalysisModal {...DEFAULT_PROPS} />);
    expect(screen.queryByText("Talfördelning")).not.toBeInTheDocument();
  });

  it("shows seller and customer percentages", () => {
    render(<CallAnalysisModal {...DEFAULT_PROPS} analysis={{ ...BASE_ANALYSIS, talk_ratio: TALK_RATIO_NORMAL }} />);
    expect(screen.getByText("Säljare 50%")).toBeInTheDocument();
    expect(screen.getByText("Kund 50%")).toBeInTheDocument();
  });

  it("renders seller bar with correct width", () => {
    render(<CallAnalysisModal {...DEFAULT_PROPS} analysis={{ ...BASE_ANALYSIS, talk_ratio: TALK_RATIO_NORMAL }} />);
    const sellerBar = screen.getByTestId("seller-bar");
    expect(sellerBar).toHaveStyle({ width: "50%" });
  });

  it("shows longest monolog seconds", () => {
    render(<CallAnalysisModal {...DEFAULT_PROPS} analysis={{ ...BASE_ANALYSIS, talk_ratio: TALK_RATIO_NORMAL }} />);
    expect(screen.getByText(/30s/)).toBeInTheDocument();
  });

  it("shows average turn seconds for seller and customer", () => {
    render(<CallAnalysisModal {...DEFAULT_PROPS} analysis={{ ...BASE_ANALYSIS, talk_ratio: TALK_RATIO_NORMAL }} />);
    expect(screen.getByText(/12s/)).toBeInTheDocument();
    expect(screen.getByText(/11s/)).toBeInTheDocument();
  });

  it("does not show seller warning when seller pct <= 65", () => {
    render(<CallAnalysisModal {...DEFAULT_PROPS} analysis={{ ...BASE_ANALYSIS, talk_ratio: TALK_RATIO_NORMAL }} />);
    expect(screen.queryByTestId("warning-seller-talk")).not.toBeInTheDocument();
  });

  it("shows seller warning when seller pct > 65", () => {
    render(<CallAnalysisModal {...DEFAULT_PROPS} analysis={{ ...BASE_ANALYSIS, talk_ratio: TALK_RATIO_HIGH_SELLER }} />);
    expect(screen.getByTestId("warning-seller-talk")).toBeInTheDocument();
    expect(screen.getByText(/pratar för mycket/)).toBeInTheDocument();
  });

  it("shows monolog warning when longest_monolog_seconds > 60", () => {
    render(<CallAnalysisModal {...DEFAULT_PROPS} analysis={{ ...BASE_ANALYSIS, talk_ratio: TALK_RATIO_HIGH_SELLER }} />);
    const warning = screen.getByTestId("warning-long-monolog");
    expect(warning).toBeInTheDocument();
    expect(warning.textContent).toMatch(/90s/);
  });

  it("does not show monolog warning when longest_monolog_seconds <= 60", () => {
    render(<CallAnalysisModal {...DEFAULT_PROPS} analysis={{ ...BASE_ANALYSIS, talk_ratio: TALK_RATIO_NORMAL }} />);
    expect(screen.queryByTestId("warning-long-monolog")).not.toBeInTheDocument();
  });
});

// ─── Sentiment ────────────────────────────────────────────────────────────────

describe("sentiment section", () => {
  it("renders sentiment section when sentiment is present", () => {
    render(<CallAnalysisModal {...DEFAULT_PROPS} analysis={{ ...BASE_ANALYSIS, sentiment: SENTIMENT_POSITIVE }} />);
    expect(screen.getByText("Sentiment")).toBeInTheDocument();
  });

  it("does not render sentiment section when absent", () => {
    render(<CallAnalysisModal {...DEFAULT_PROPS} />);
    expect(screen.queryByText("Sentiment")).not.toBeInTheDocument();
  });

  it("renders positive emoji and label for POSITIVE sentiment", () => {
    render(<CallAnalysisModal {...DEFAULT_PROPS} analysis={{ ...BASE_ANALYSIS, sentiment: SENTIMENT_POSITIVE }} />);
    expect(screen.getByRole("img", { name: "Positiv" })).toBeInTheDocument();
    // The label "Positiv" appears multiple times (heading + label) — check at least one
    expect(screen.getAllByText("Positiv").length).toBeGreaterThan(0);
  });

  it("renders neutral emoji and label for NEUTRAL sentiment", () => {
    render(<CallAnalysisModal {...DEFAULT_PROPS} analysis={{ ...BASE_ANALYSIS, sentiment: SENTIMENT_NEUTRAL }} />);
    expect(screen.getByRole("img", { name: "Neutral" })).toBeInTheDocument();
    expect(screen.getAllByText("Neutral").length).toBeGreaterThan(0);
  });

  it("renders negative emoji and label for NEGATIVE sentiment", () => {
    render(<CallAnalysisModal {...DEFAULT_PROPS} analysis={{ ...BASE_ANALYSIS, sentiment: SENTIMENT_NEGATIVE }} />);
    expect(screen.getByRole("img", { name: "Negativ" })).toBeInTheDocument();
    expect(screen.getAllByText("Negativ").length).toBeGreaterThan(0);
  });

  it("shows percentage breakdown for positive sentiment", () => {
    render(<CallAnalysisModal {...DEFAULT_PROPS} analysis={{ ...BASE_ANALYSIS, sentiment: SENTIMENT_POSITIVE }} />);
    expect(screen.getByText("65%")).toBeInTheDocument();
    expect(screen.getByText("10%")).toBeInTheDocument();
    expect(screen.getByText("25%")).toBeInTheDocument();
  });

  it("shows percentage breakdown for negative sentiment", () => {
    render(<CallAnalysisModal {...DEFAULT_PROPS} analysis={{ ...BASE_ANALYSIS, sentiment: SENTIMENT_NEGATIVE }} />);
    expect(screen.getByText("60%")).toBeInTheDocument();
    expect(screen.getByText("30%")).toBeInTheDocument();
  });
});

// ─── All sections conditional ─────────────────────────────────────────────────

describe("conditional rendering", () => {
  it("none of the new sections appear when only legacy data is present", () => {
    render(<CallAnalysisModal {...DEFAULT_PROPS} />);
    expect(screen.queryByText("Betyg (25p)")).not.toBeInTheDocument();
    expect(screen.queryByText("Talfördelning")).not.toBeInTheDocument();
    expect(screen.queryByText("Sentiment")).not.toBeInTheDocument();
  });

  it("all new sections appear when all new data is present", () => {
    render(
      <CallAnalysisModal
        {...DEFAULT_PROPS}
        analysis={{
          ...BASE_ANALYSIS,
          scorecard: SCORECARD,
          talk_ratio: TALK_RATIO_NORMAL,
          sentiment: SENTIMENT_POSITIVE,
        }}
      />,
    );
    expect(screen.getByText("Betyg (25p)")).toBeInTheDocument();
    expect(screen.getByText("Talfördelning")).toBeInTheDocument();
    expect(screen.getByText("Sentiment")).toBeInTheDocument();
  });

  it("scorecard section alone renders without talk_ratio or sentiment", () => {
    render(<CallAnalysisModal {...DEFAULT_PROPS} analysis={{ ...BASE_ANALYSIS, scorecard: SCORECARD }} />);
    expect(screen.getByText("Betyg (25p)")).toBeInTheDocument();
    expect(screen.queryByText("Talfördelning")).not.toBeInTheDocument();
    expect(screen.queryByText("Sentiment")).not.toBeInTheDocument();
  });

  it("talk_ratio alone renders without scorecard or sentiment", () => {
    render(<CallAnalysisModal {...DEFAULT_PROPS} analysis={{ ...BASE_ANALYSIS, talk_ratio: TALK_RATIO_NORMAL }} />);
    expect(screen.queryByText("Betyg (25p)")).not.toBeInTheDocument();
    expect(screen.getByText("Talfördelning")).toBeInTheDocument();
    expect(screen.queryByText("Sentiment")).not.toBeInTheDocument();
  });

  it("sentiment alone renders without scorecard or talk_ratio", () => {
    render(<CallAnalysisModal {...DEFAULT_PROPS} analysis={{ ...BASE_ANALYSIS, sentiment: SENTIMENT_POSITIVE }} />);
    expect(screen.queryByText("Betyg (25p)")).not.toBeInTheDocument();
    expect(screen.queryByText("Talfördelning")).not.toBeInTheDocument();
    expect(screen.getByText("Sentiment")).toBeInTheDocument();
  });
});
