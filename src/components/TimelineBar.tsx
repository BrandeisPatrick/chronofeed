"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import {
  addYears,
  adjacentBandYear,
  bandIndexForYear,
  ERAS,
  formatYear,
  MAX_YEAR,
  MIN_YEAR,
  parseYear,
  positionToYear,
  yearParts,
  yearToPosition,
  yearValueText,
} from "@/lib/eras";
import { ChevronLeft, ChevronRight } from "./icons";

/** Keyboard and step-button changes commit this long after the last change. */
const KEYBOARD_COMMIT_MS = 600;

interface TimelineBarProps {
  /** The year the feed is showing. */
  year: number;
  /** A year being previewed (drag or keyboard) but not yet committed. */
  preview: number | null;
  onPreview(year: number | null): void;
  onDraggingChange(dragging: boolean): void;
  /** Travel to a year: starts generation. */
  onCommit(year: number): void;
}

export function TimelineBar({ year, preview, onPreview, onDraggingChange, onCommit }: TimelineBarProps) {
  const shown = preview ?? year;
  const bandIndex = bandIndexForYear(shown);
  const band = ERAS[bandIndex];
  const { numeral, suffix } = yearParts(shown);

  const barRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragYear = useRef<number | null>(null);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [invalid, setInvalid] = useState(false);

  // Publish the bar height so sticky rails can sit below it.
  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => document.documentElement.style.setProperty("--bar-h", `${el.offsetHeight}px`));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const cancelTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const commitNow = (next: number) => {
    cancelTimer();
    onCommit(next);
  };

  const commitSoon = (next: number) => {
    onPreview(next);
    cancelTimer();
    timer.current = setTimeout(() => {
      timer.current = null;
      onCommit(next);
    }, KEYBOARD_COMMIT_MS);
  };

  const yearAt = (clientX: number) => {
    const rect = trackRef.current!.getBoundingClientRect();
    return positionToYear((clientX - rect.left) / rect.width);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    cancelTimer();
    const next = yearAt(e.clientX);
    dragYear.current = next;
    thumbRef.current?.focus({ preventScroll: true });
    onDraggingChange(true);
    onPreview(next);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (dragYear.current === null) return;
    const next = yearAt(e.clientX);
    if (next !== dragYear.current) {
      dragYear.current = next;
      onPreview(next);
    }
  };

  const endDrag = (commit: boolean) => {
    const next = dragYear.current;
    if (next === null) return;
    dragYear.current = null;
    onDraggingChange(false);
    if (commit) commitNow(next);
    else onPreview(null);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 10 : 1;
    let next: number | null = null;
    switch (e.key) {
      case "ArrowLeft":
      case "ArrowDown":
        next = addYears(shown, -step);
        break;
      case "ArrowRight":
      case "ArrowUp":
        next = addYears(shown, step);
        break;
      case "PageUp":
        next = adjacentBandYear(shown, -1);
        break;
      case "PageDown":
        next = adjacentBandYear(shown, 1);
        break;
      case "Home":
        next = MIN_YEAR;
        break;
      case "End":
        next = MAX_YEAR;
        break;
      case "Enter":
        e.preventDefault();
        if (preview !== null) commitNow(preview);
        return;
      default:
        return;
    }
    e.preventDefault();
    commitSoon(next);
  };

  const startEdit = () => {
    setDraft(formatYear(shown));
    setInvalid(false);
    setEditing(true);
  };

  const submitEdit = (): boolean => {
    const parsed = parseYear(draft);
    if (parsed === null) {
      setInvalid(true);
      return false;
    }
    setEditing(false);
    setInvalid(false);
    commitNow(parsed);
    return true;
  };

  return (
    <header ref={barRef} className="sticky top-0 z-30 border-b border-line bg-bg">
      <div className="mx-auto flex max-w-[1265px] flex-wrap items-center gap-x-6 gap-y-1 px-4 py-3 sm:flex-nowrap sm:py-4">
        {/* Year readout (editable) and era name */}
        <div className="min-w-0 shrink-0 sm:w-48">
          {editing ? (
            <input
              autoFocus
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                setInvalid(false);
              }}
              onFocus={(e) => e.currentTarget.select()}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitEdit();
                if (e.key === "Escape") setEditing(false);
              }}
              onBlur={() => {
                if (parseYear(draft) === null) setEditing(false);
                else submitEdit();
              }}
              aria-label="Type a year, e.g. 1347, 44 BCE or 800 CE"
              aria-invalid={invalid}
              className={`w-44 rounded-md border bg-bg px-2 py-0.5 font-serif text-[32px] leading-tight tabular-nums outline-none sm:text-[38px] ${invalid ? "border-red-600" : "border-line-strong focus:border-accent"}`}
            />
          ) : (
            <button
              type="button"
              onClick={startEdit}
              title="Click to type a year"
              aria-label={`${formatYear(shown)}. Click to type a year.`}
              className="flex items-baseline gap-1.5 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <span className="font-serif text-[32px] leading-tight tracking-tight tabular-nums sm:text-[40px]">{numeral}</span>
              <span className="text-[13px] font-medium tracking-wide text-muted">{suffix}</span>
            </button>
          )}
          <div className="truncate text-[13px] font-medium text-accent-ink" aria-live="polite">
            {band.name}
          </div>
        </div>

        {/* Track */}
        <div className="order-3 w-full min-w-0 sm:order-none sm:flex-1">
          <div
            ref={trackRef}
            className="relative h-8 cursor-pointer touch-none select-none"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={() => endDrag(true)}
            onPointerCancel={() => endDrag(false)}
          >
            <div className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-line-strong" />
            <div
              className="absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-accent"
              style={{ left: `${(bandIndex / ERAS.length) * 100}%`, width: `${100 / ERAS.length}%` }}
            />
            {ERAS.slice(1).map((b, i) => (
              <span key={b.id} aria-hidden="true" className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-line-strong" style={{ left: `${((i + 1) / ERAS.length) * 100}%` }} />
            ))}
            <div
              ref={thumbRef}
              role="slider"
              tabIndex={0}
              aria-label="Year"
              aria-orientation="horizontal"
              aria-valuemin={MIN_YEAR}
              aria-valuemax={MAX_YEAR}
              aria-valuenow={shown}
              aria-valuetext={yearValueText(shown)}
              onKeyDown={onKeyDown}
              className="absolute top-1/2 size-[22px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-bg bg-accent outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-bg"
              style={{ left: `${yearToPosition(shown) * 100}%` }}
            />
          </div>

          {/* Band labels: all of them on wide screens, only the active one on narrow ones */}
          <div className="hidden grid-cols-12 min-[1000px]:grid">
            {ERAS.map((b, i) => (
              <button
                key={b.id}
                type="button"
                onClick={() => commitNow(b.signature)}
                title={`${b.name}: jump to ${formatYear(b.signature)}`}
                aria-label={`${b.name}, jump to ${formatYear(b.signature)}`}
                aria-current={i === bandIndex ? "true" : undefined}
                className={`truncate rounded px-0.5 text-center text-[11px] leading-5 outline-none focus-visible:ring-2 focus-visible:ring-accent ${i === bandIndex ? "font-semibold text-accent-ink" : "text-muted hover:text-fg"}`}
              >
                {b.short}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between text-[11px] leading-5 text-muted min-[1000px]:hidden">
            <span>3000 BCE</span>
            <button
              type="button"
              onClick={() => commitNow(band.signature)}
              aria-label={`${band.name}, jump to ${formatYear(band.signature)}`}
              className="rounded px-1 font-semibold text-accent-ink outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {band.name}
            </button>
            <span>2500 CE</span>
          </div>
        </div>

        {/* Step buttons */}
        <div className="ml-auto flex shrink-0 items-center gap-1 sm:ml-0">
          <button
            type="button"
            onClick={(e) => commitSoon(addYears(shown, e.shiftKey ? -10 : -1))}
            aria-label="One year earlier (Shift-click for ten)"
            className="grid size-9 place-items-center rounded-full text-muted outline-none hover:bg-surface hover:text-fg focus-visible:ring-2 focus-visible:ring-accent"
          >
            <ChevronLeft />
          </button>
          <button
            type="button"
            onClick={(e) => commitSoon(addYears(shown, e.shiftKey ? 10 : 1))}
            aria-label="One year later (Shift-click for ten)"
            className="grid size-9 place-items-center rounded-full text-muted outline-none hover:bg-surface hover:text-fg focus-visible:ring-2 focus-visible:ring-accent"
          >
            <ChevronRight />
          </button>
        </div>
      </div>
    </header>
  );
}
