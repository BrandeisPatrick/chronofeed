"use client";

import { useId, useState } from "react";
import { POST_MAX_CHARS } from "@/lib/types";
import { Avatar } from "./Avatar";

interface ComposerProps {
  placeholder: string;
  submitLabel: string;
  disabled?: boolean;
  autoFocus?: boolean;
  compact?: boolean;
  onSubmit(text: string): void;
  onCancel?(): void;
}

export function Composer({ placeholder, submitLabel, disabled, autoFocus, compact, onSubmit, onCancel }: ComposerProps) {
  const [text, setText] = useState("");
  const id = useId();
  const length = Array.from(text).length;
  const remaining = POST_MAX_CHARS - length;
  const canSubmit = !disabled && text.trim().length > 0 && remaining >= 0;

  const submit = () => {
    if (!canSubmit) return;
    onSubmit(text.trim());
    setText("");
  };

  return (
    <form
      className={`flex gap-3 ${compact ? "py-2" : "border-b border-line px-4 py-3"}`}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {!compact && <Avatar emoji="🧭" handle="you" />}
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className="sr-only">
          {placeholder}
        </label>
        <textarea
          id={id}
          value={text}
          autoFocus={autoFocus}
          disabled={disabled}
          rows={compact ? 2 : 2}
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
            if (e.key === "Escape" && onCancel) onCancel();
          }}
          className={`block w-full resize-none bg-transparent leading-6 outline-none placeholder:text-muted disabled:opacity-60 ${compact ? "rounded-lg border border-line-strong px-3 py-2 text-[15px] focus:border-accent" : "pt-1.5 text-[17px]"}`}
        />
        <div className="mt-2 flex items-center justify-end gap-3">
          {length > 0 && (
            <span className={`text-[13px] tabular-nums ${remaining < 0 ? "text-red-600" : remaining <= 20 ? "text-accent-ink" : "text-muted"}`} aria-live="polite">
              {remaining}
            </span>
          )}
          {onCancel && (
            <button type="button" onClick={onCancel} className="rounded-full px-3 py-1.5 text-[14px] font-medium text-muted hover:bg-surface hover:text-fg">
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded-full bg-accent px-4 py-1.5 text-[14px] font-semibold text-white outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:opacity-50"
          >
            {submitLabel}
          </button>
        </div>
      </div>
    </form>
  );
}
