"use client";

import { useUser } from "@/state/UserContext";
import { AvatarSwitcher } from "./AvatarSwitcher";

export function AppHeader({ title, sub }: { title?: string; sub?: string }) {
  const { user, users, switchUser } = useUser();

  return (
    <header className="mb-4 flex items-center justify-between pt-2">
      <div>
        {title ? (
          <h1 className="disp text-[21px]">{title}</h1>
        ) : (
          <h1 className="disp text-[21px]">
            RAMPSET<span className="text-accent">.</span>
          </h1>
        )}
        {sub && <p className="mono mt-0.5 text-xs text-ink-faint">{sub}</p>}
      </div>
      <AvatarSwitcher user={user} users={users} onSwitch={switchUser} />
    </header>
  );
}
