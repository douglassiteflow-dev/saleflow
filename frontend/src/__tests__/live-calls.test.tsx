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
          extension: "100",
          callerid: "+46701234567",
          direction: "out",
          linestatus: "up",
        },
      ]);
      return { leave: vi.fn() };
    });
    render(<LiveCalls />);
    expect(screen.getByText("Pågående samtal")).toBeInTheDocument();
    expect(screen.getByText("Anna")).toBeInTheDocument();
    expect(screen.getByText(/\+46701234567/)).toBeInTheDocument();
    expect(screen.getByText("Medlyssna")).toBeInTheDocument();
  });

  it("renders timer with initial 00:00", () => {
    joinCallsChannelMock.mockImplementation((callback: (calls: unknown[]) => void) => {
      callback([
        {
          user_id: "u1",
          agent_name: "Erik",
          extension: "200",
          callerid: "+46709999999",
          direction: "in",
          linestatus: "ringing",
        },
      ]);
      return { leave: vi.fn() };
    });
    render(<LiveCalls />);
    expect(screen.getByText("00:00")).toBeInTheDocument();
  });

  it("renders direction arrow for outbound call", () => {
    joinCallsChannelMock.mockImplementation((callback: (calls: unknown[]) => void) => {
      callback([
        {
          user_id: "u1",
          agent_name: "Test",
          extension: "100",
          callerid: "0701234567",
          direction: "out",
          linestatus: "up",
        },
      ]);
      return { leave: vi.fn() };
    });
    render(<LiveCalls />);
    expect(screen.getByText(/→/)).toBeInTheDocument();
  });

  it("renders direction arrow for inbound call", () => {
    joinCallsChannelMock.mockImplementation((callback: (calls: unknown[]) => void) => {
      callback([
        {
          user_id: "u1",
          agent_name: "Test",
          extension: "100",
          callerid: "0701234567",
          direction: "in",
          linestatus: "up",
        },
      ]);
      return { leave: vi.fn() };
    });
    render(<LiveCalls />);
    expect(screen.getByText(/←/)).toBeInTheDocument();
  });

  it("calls leave on channel when unmounting", () => {
    const leaveMock = vi.fn();
    joinCallsChannelMock.mockReturnValue({ leave: leaveMock });
    const { unmount } = render(<LiveCalls />);
    unmount();
    expect(leaveMock).toHaveBeenCalled();
  });

  it("renders Medlyssna link pointing to Telavox", () => {
    joinCallsChannelMock.mockImplementation((callback: (calls: unknown[]) => void) => {
      callback([
        {
          user_id: "u1",
          agent_name: "Test",
          extension: "100",
          callerid: "0701234567",
          direction: "out",
          linestatus: "up",
        },
      ]);
      return { leave: vi.fn() };
    });
    render(<LiveCalls />);
    const link = screen.getByText("Medlyssna");
    expect(link).toHaveAttribute("href", "https://home.telavox.se/");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("renders multiple calls", () => {
    joinCallsChannelMock.mockImplementation((callback: (calls: unknown[]) => void) => {
      callback([
        { user_id: "u1", agent_name: "Anna", extension: "100", callerid: "+46701111111", direction: "out", linestatus: "up" },
        { user_id: "u2", agent_name: "Erik", extension: "200", callerid: "+46702222222", direction: "in", linestatus: "ringing" },
      ]);
      return { leave: vi.fn() };
    });
    render(<LiveCalls />);
    expect(screen.getByText("Anna")).toBeInTheDocument();
    expect(screen.getByText("Erik")).toBeInTheDocument();
  });
});
