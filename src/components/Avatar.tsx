import type { CSSProperties } from "react";
import { avatarHue } from "@/lib/color";

export function Avatar({ emoji, handle, size = 40 }: { emoji: string; handle: string; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="avatar grid shrink-0 place-items-center rounded-full leading-none select-none"
      style={{ "--hue": avatarHue(handle), width: size, height: size, fontSize: size * 0.5 } as CSSProperties}
    >
      {emoji}
    </span>
  );
}
