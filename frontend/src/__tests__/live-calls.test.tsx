import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { LiveCalls } from "@/components/live-calls";

const joinCallsChannelMock = vi.fn();

vi.mock("@/lib/socket", () => ({
  joinCallsChannel: (...args: unknown[]) => joinCallsChannelMock(...args),
}));

describe("LiveCalls", () => {
  it("renders nothing when there are no calls", () => {
    joinCallsChannelMock.mockReturnValue({ leave: vi.fn() });
    const { container } = render(<LiveCalls />);
    expect(container.innerHTML).toBe("");
  });

  it("renders calls when channel pushes data", () => {
    joinCallsChannelMock.mockImplementation((callback: (calls: unknown[]) => void) => {
      callback([
        {
          user_id: "u1",
          agent_name: "Anna",
          lead_name: "Acme AB",
          phone: "+46701234567",
          started_at: Math.floor(Date.now() / 1000),
        },
      ]);
      return { leave: vi.fn() };
    });
    render(<LiveCalls />);
    expect(screen.getByText(/Pågående samtal/)).toBeInTheDocument();
    expect(screen.getByText("Anna")).toBeInTheDocument();
    expect(screen.getByText(/Acme AB/)).toBeInTheDocument();
  });

  it("renders timer", () => {
    joinCallsChannelMock.mockImplementation((callback: (calls: unknown[]) => void) => {
      callback([
        {
          user_id: "u1",
          agent_name: "Erik",
          lead_name: "Test AB",
          phone: "+46709999999",
          started_at: Math.floor(Date.now() / 1000),
        },
      ]);
      return { leave: vi.fn() };
    });
    render(<LiveCalls />);
    expect(screen.getByText("00:00")).toBeInTheDocument();
  });

  it("renders direction arrow and phone", () => {
    joinCallsChannelMock.mockImplementation((callback: (calls: unknown[]) => void) => {
      callback([
        {
          user_id: "u1",
          agent_name: "Test",
          lead_name: "Company",
          phone: "0701234567",
          started_at: Math.floor(Date.now() / 1000),
        },
      ]);
      return { leave: vi.fn() };
    });
    render(<LiveCalls />);
    expect(screen.getByText(/→.*Company/)).toBeInTheDocument();
  });

  it("calls leave on channel when unmounting", () => {
    const leaveMock = vi.fn();
    joinCallsChannelMock.mockReturnValue({ leave: leaveMock });
    const { unmount } = render(<LiveCalls />);
    unmount();
    expect(leaveMock).toHaveBeenCalled();
  });

  it("renders multiple calls", () => {
    joinCallsChannelMock.mockImplementation((callback: (calls: unknown[]) => void) => {
      callback([
        { user_id: "u1", agent_name: "Anna", lead_name: "Acme", phone: "+46701111111", started_at: Math.floor(Date.now() / 1000) },
        { user_id: "u2", agent_name: "Erik", lead_name: "Beta", phone: "+46702222222", started_at: Math.floor(Date.now() / 1000) },
      ]);
      return { leave: vi.fn() };
    });
    render(<LiveCalls />);
    expect(screen.getByText("Anna")).toBeInTheDocument();
    expect(screen.getByText("Erik")).toBeInTheDocument();
  });
});
