"use client";

import { MAX_COUNT, MIN_COUNT } from "@/lib/schemas";
import { RefreshIcon } from "./icons";

export interface ControlsProps {
  count: number;
  onCountChange(count: number): void;
  live: boolean;
  onLiveChange(live: boolean): void;
  /** Live is on but auto-paused after too many ticks this visit. */
  paused: boolean;
  onResume(): void;
  onRegenerate(): void;
  busy: boolean;
}

export function Controls({ count, onCountChange, live, onLiveChange, paused, onResume, onRegenerate, busy }: ControlsProps) {
  return (
    <div className="space-y-5">
      <div>
        <div className="mb-1.5 text-[13px] font-medium text-muted" id="count-label">
          Posts per era
        </div>
        <div className="inline-flex items-center rounded-full border border-line-strong" role="group" aria-labelledby="count-label">
          <button
            type="button"
            onClick={() => onCountChange(Math.max(MIN_COUNT, count - 1))}
            disabled={count <= MIN_COUNT}
            aria-label="Fewer posts"
            className="grid size-9 place-items-center rounded-full text-[18px] outline-none hover:bg-surface focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40"
          >
            −
          </button>
          <output className="w-8 text-center text-[15px] font-semibold tabular-nums" aria-live="polite">
            {count}
          </output>
          <button
            type="button"
            onClick={() => onCountChange(Math.min(MAX_COUNT, count + 1))}
            disabled={count >= MAX_COUNT}
            aria-label="More posts"
            className="grid size-9 place-items-center rounded-full text-[18px] outline-none hover:bg-surface focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40"
          >
            +
          </button>
        </div>
        <p className="mt-1.5 text-[12px] text-muted">Applies to the next era you generate.</p>
      </div>

      <div>
        <label className="flex cursor-pointer items-center justify-between gap-3">
          <span>
            <span className="block text-[15px] font-medium">Live</span>
            <span className="block text-[12px] text-muted">Agents keep posting while you read</span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={live}
            onClick={() => onLiveChange(!live)}
            className={`relative h-6 w-10 shrink-0 rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg ${live ? "bg-accent" : "bg-line-strong"}`}
          >
            <span className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-white transition-transform ${live ? "translate-x-4" : ""}`} />
            <span className="sr-only">Live updates</span>
          </button>
        </label>
        {live && paused && (
          <p className="mt-2 text-[13px] text-muted">
            Paused to save tokens —{" "}
            <button type="button" onClick={onResume} className="font-medium text-accent-ink underline-offset-2 hover:underline">
              resume
            </button>
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={onRegenerate}
        disabled={busy}
        className="flex items-center gap-2 rounded-full border border-line-strong px-4 py-2 text-[14px] font-medium outline-none hover:bg-surface focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
      >
        <RefreshIcon />
        Regenerate
      </button>
    </div>
  );
}
