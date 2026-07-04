import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Sheet } from "./Sheet";

function Harness({ onClose = () => {} }: { onClose?: () => void }) {
  return (
    <>
      <button>outside before</button>
      <Sheet label="Test sheet" onClose={onClose}>
        <button>first</button>
        <button>second</button>
      </Sheet>
      <button>outside after</button>
    </>
  );
}

describe("Sheet (native bottom sheet)", () => {
  it("exposes a labelled modal dialog", () => {
    render(<Harness />);
    const dialog = screen.getByRole("dialog", { name: "Test sheet" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  it("closes on Escape", async () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("traps Tab within the sheet (forward wraps to the first control)", async () => {
    render(<Harness />);
    const first = screen.getByRole("button", { name: "first" });
    const second = screen.getByRole("button", { name: "second" });
    second.focus();
    await userEvent.tab();
    expect(first).toHaveFocus();
    expect(screen.getByRole("button", { name: "outside after" })).not.toHaveFocus();
  });

  it("traps Shift+Tab within the sheet (backward wraps to the last control)", async () => {
    render(<Harness />);
    const first = screen.getByRole("button", { name: "first" });
    const second = screen.getByRole("button", { name: "second" });
    first.focus();
    await userEvent.tab({ shift: true });
    expect(second).toHaveFocus();
  });
});
