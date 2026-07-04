import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AvatarSwitcher } from "./AvatarSwitcher";
import type { User } from "@/lib/types";

const isaac: User = { id: "u1", name: "Isaac", email: "i@x.com", accent: "blue", unit: "kg" };
const sam: User = { id: "u2", name: "Sam", email: "s@x.com", accent: "green", unit: "kg" };

describe("AvatarSwitcher", () => {
  it("shows the current user's initial", () => {
    render(<AvatarSwitcher user={isaac} users={[isaac, sam]} onSwitch={() => {}} />);
    expect(screen.getByRole("button", { name: /signed in as isaac/i })).toHaveTextContent("I");
  });

  it("does not silently switch on tap — it opens a menu of users", async () => {
    const onSwitch = vi.fn();
    render(<AvatarSwitcher user={isaac} users={[isaac, sam]} onSwitch={onSwitch} />);
    // Opening the menu must not, by itself, change identity.
    await userEvent.click(screen.getByRole("button", { name: /switch user/i }));
    expect(onSwitch).not.toHaveBeenCalled();
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: /isaac/i })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("menuitemradio", { name: /sam/i })).toHaveAttribute("aria-checked", "false");
  });

  it("switches only when another user is chosen", async () => {
    const onSwitch = vi.fn();
    render(<AvatarSwitcher user={isaac} users={[isaac, sam]} onSwitch={onSwitch} />);
    await userEvent.click(screen.getByRole("button", { name: /switch user/i }));
    await userEvent.click(screen.getByRole("menuitemradio", { name: /sam/i }));
    expect(onSwitch).toHaveBeenCalledWith("u2");
    // Menu closes after choosing.
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("choosing the already-active user is a no-op", async () => {
    const onSwitch = vi.fn();
    render(<AvatarSwitcher user={isaac} users={[isaac, sam]} onSwitch={onSwitch} />);
    await userEvent.click(screen.getByRole("button", { name: /switch user/i }));
    await userEvent.click(screen.getByRole("menuitemradio", { name: /isaac/i }));
    expect(onSwitch).not.toHaveBeenCalled();
  });

  it("with a single user, the avatar is not a menu and never switches", async () => {
    const onSwitch = vi.fn();
    render(<AvatarSwitcher user={isaac} users={[isaac]} onSwitch={onSwitch} />);
    const btn = screen.getByRole("button", { name: /signed in as isaac/i });
    expect(btn).not.toHaveAttribute("aria-haspopup");
    await userEvent.click(btn);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(onSwitch).not.toHaveBeenCalled();
  });
});
