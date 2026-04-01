import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SessionList } from "../session-list";
import type { LoginSession } from "@/api/types";

const mockSessions: LoginSession[] = [
  {
    id: "s1",
    device_type: "desktop",
    browser: "Chrome",
    city: "Stockholm",
    country: "Sverige",
    logged_in_at: "2026-03-31T08:00:00Z",
    last_active_at: new Date().toISOString(),
    force_logged_out: false,
    current: true,
  },
  {
    id: "s2",
    device_type: "smartphone",
    browser: "Safari",
    city: null,
    country: null,
    logged_in_at: "2026-03-30T14:00:00Z",
    last_active_at: "2026-03-30T14:00:00Z",
    force_logged_out: false,
    current: false,
  },
  {
    id: "s3",
    device_type: "tablet",
    browser: "Firefox",
    city: "Göteborg",
    country: "Sverige",
    logged_in_at: "2026-03-29T10:00:00Z",
    last_active_at: "2026-03-29T10:00:00Z",
    force_logged_out: true,
    current: false,
  },
];

describe("SessionList", () => {
  it("renders empty state when no sessions", () => {
    render(<SessionList sessions={[]} />);
    expect(screen.getByText("Inga aktiva sessioner.")).toBeInTheDocument();
  });

  it("renders session table headers", () => {
    render(<SessionList sessions={mockSessions} />);
    expect(screen.getByText("Enhet")).toBeInTheDocument();
    expect(screen.getByText("Webbläsare")).toBeInTheDocument();
    expect(screen.getByText("Plats")).toBeInTheDocument();
    expect(screen.getByText("Senast aktiv")).toBeInTheDocument();
  });

  it("renders browser names", () => {
    render(<SessionList sessions={mockSessions} />);
    expect(screen.getByText("Chrome")).toBeInTheDocument();
    expect(screen.getByText("Safari")).toBeInTheDocument();
    expect(screen.getByText("Firefox")).toBeInTheDocument();
  });

  it("renders location for sessions with city and country", () => {
    render(<SessionList sessions={mockSessions} />);
    expect(screen.getByText("Stockholm, Sverige")).toBeInTheDocument();
    expect(screen.getByText("Göteborg, Sverige")).toBeInTheDocument();
  });

  it("renders 'Okänd plats' for sessions without location", () => {
    render(<SessionList sessions={mockSessions} />);
    expect(screen.getByText("Okänd plats")).toBeInTheDocument();
  });

  it("renders 'Nuvarande' badge for current session", () => {
    render(<SessionList sessions={mockSessions} />);
    expect(screen.getByText("Nuvarande")).toBeInTheDocument();
  });

  it("renders device icons with aria labels", () => {
    render(<SessionList sessions={mockSessions} />);
    expect(screen.getByLabelText("Dator")).toBeInTheDocument();
    expect(screen.getByLabelText("Mobil")).toBeInTheDocument();
    expect(screen.getByLabelText("Surfplatta")).toBeInTheDocument();
  });

  it("renders logout button for non-current sessions when onLogout provided", () => {
    const onLogout = vi.fn();
    render(<SessionList sessions={mockSessions} onLogout={onLogout} />);
    // Should NOT show logout for current session, should show for others
    // s2 is not force_logged_out so it should have logout
    // s3 is force_logged_out so by default (showForceLogout=false) it should not show logout
    const logoutButtons = screen.getAllByText("Logga ut");
    expect(logoutButtons.length).toBe(1);
  });

  it("calls onLogout with session id when logout clicked", () => {
    const onLogout = vi.fn();
    render(<SessionList sessions={mockSessions} onLogout={onLogout} />);
    const logoutButton = screen.getByText("Logga ut");
    fireEvent.click(logoutButton);
    expect(onLogout).toHaveBeenCalledWith("s2");
  });

  it("shows force logged out sessions with showForceLogout", () => {
    const onLogout = vi.fn();
    render(<SessionList sessions={mockSessions} onLogout={onLogout} showForceLogout />);
    const logoutButtons = screen.getAllByText("Logga ut");
    // s2 and s3 both have logout buttons
    expect(logoutButtons.length).toBe(2);
  });

  it("shows 'Utloggad' for force-logged-out sessions without showForceLogout", () => {
    render(<SessionList sessions={mockSessions} onLogout={() => {}} />);
    expect(screen.getByText("Utloggad")).toBeInTheDocument();
  });

  it("does not show logout buttons when onLogout is not provided", () => {
    render(<SessionList sessions={mockSessions} />);
    // Current session should show "Nuvarande", others should not have logout buttons
    expect(screen.queryByRole("button", { name: "Logga ut" })).not.toBeInTheDocument();
  });

  it("renders relative time for last active", () => {
    render(<SessionList sessions={mockSessions} />);
    // Current session has last_active_at set to now, should show "Just nu"
    expect(screen.getByText("Just nu")).toBeInTheDocument();
  });
});
