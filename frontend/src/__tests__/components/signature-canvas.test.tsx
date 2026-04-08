import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SignatureCanvas } from "@/components/signature-canvas";

// ---------------------------------------------------------------------------
// Canvas stub: jsdom does not implement canvas, so we stub getContext.
// ---------------------------------------------------------------------------

beforeEach(() => {
  // Provide a minimal canvas 2D context stub so drawing calls don't throw
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    clearRect: vi.fn(),
    strokeStyle: "",
    lineWidth: 0,
    lineCap: "",
    lineJoin: "",
  }) as unknown as typeof HTMLCanvasElement.prototype.getContext;

  HTMLCanvasElement.prototype.toDataURL = vi
    .fn()
    .mockReturnValue("data:image/png;base64,MOCK");
});

describe("SignatureCanvas", () => {
  // 1. Renders canvas element
  it("renders a canvas element", () => {
    const onSignatureChange = vi.fn();
    render(<SignatureCanvas onSignatureChange={onSignatureChange} />);
    expect(document.querySelector("canvas")).toBeInTheDocument();
  });

  // 2. "Rensa" button is visible only after drawing — initially hidden
  it("does not render 'Rensa' button before any drawing", () => {
    const onSignatureChange = vi.fn();
    render(<SignatureCanvas onSignatureChange={onSignatureChange} />);
    expect(screen.queryByRole("button", { name: "Rensa" })).not.toBeInTheDocument();
  });

  // 3. After drawing, "Rensa" appears and clicking it calls onSignatureChange(null)
  it("shows 'Rensa' button after drawing and clicking it calls onSignatureChange(null)", () => {
    const onSignatureChange = vi.fn();
    render(<SignatureCanvas onSignatureChange={onSignatureChange} />);

    const canvas = document.querySelector("canvas") as HTMLCanvasElement;

    // Simulate a draw stroke: mousedown → mousemove → mouseup
    fireEvent.mouseDown(canvas, { clientX: 10, clientY: 10 });
    fireEvent.mouseMove(canvas, { clientX: 20, clientY: 20 });
    fireEvent.mouseUp(canvas);

    // After mouseUp, onSignatureChange should have been called with a data URL
    expect(onSignatureChange).toHaveBeenCalledWith("data:image/png;base64,MOCK");

    // "Rensa" button should now appear
    const rensaBtn = screen.getByRole("button", { name: "Rensa" });
    expect(rensaBtn).toBeInTheDocument();

    // Click "Rensa" — should call onSignatureChange(null)
    fireEvent.click(rensaBtn);
    expect(onSignatureChange).toHaveBeenCalledWith(null);
  });

  // 4. Canvas has correct default dimensions
  it("canvas has default width=400 and height=150", () => {
    const onSignatureChange = vi.fn();
    render(<SignatureCanvas onSignatureChange={onSignatureChange} />);

    const canvas = document.querySelector("canvas") as HTMLCanvasElement;
    expect(canvas.width).toBe(400);
    expect(canvas.height).toBe(150);
  });

  // 5. Canvas respects custom dimensions
  it("canvas uses custom width and height props", () => {
    const onSignatureChange = vi.fn();
    render(
      <SignatureCanvas onSignatureChange={onSignatureChange} width={600} height={200} />,
    );

    const canvas = document.querySelector("canvas") as HTMLCanvasElement;
    expect(canvas.width).toBe(600);
    expect(canvas.height).toBe(200);
  });
});
