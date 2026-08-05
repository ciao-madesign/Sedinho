import type { PlayerRole } from "@sedinho/shared";
import { roleStyles } from "../lib/playerFormat.js";

export function PlayerRoleBadge({ role }: { role: PlayerRole }) {
  const style = roleStyles[role];
  return (
    <span
      className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ring-1 ${style.bg} ${style.text} ${style.ring}`}
    >
      {role}
    </span>
  );
}
