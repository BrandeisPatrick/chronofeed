import { formatYear } from "@/lib/eras";
import { compactNumber } from "@/lib/text";
import type { EraBrief, Persona } from "@/lib/types";
import { Avatar } from "./Avatar";

/** "Happening in <year>", the cast, and the fiction note. Used in the right rail and under the feed. */
export function EraInfo({ year, era, cast }: { year: number; era: EraBrief | null; cast: readonly Persona[] }) {
  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-line" aria-labelledby="trends-heading">
        <h2 id="trends-heading" className="px-4 pt-3 text-[17px] font-bold">
          Happening in {formatYear(year)}
        </h2>
        {era ? (
          <>
            <p className="px-4 pt-1 text-[13px] leading-5 text-muted">
              <span className="font-medium text-fg">{era.label}.</span> {era.summary}
            </p>
            <ul className="mt-2 pb-2">
              {era.trends.map((t) => (
                <li key={t.tag} className="px-4 py-2">
                  <div className="text-[15px] font-semibold break-words">{t.tag}</div>
                  <div className="text-[13px] text-muted">{compactNumber(t.posts)} posts</div>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <div className="space-y-2 px-4 py-3" aria-hidden="true">
            <span className="skeleton block h-3 w-4/5 rounded" />
            <span className="skeleton block h-3 w-3/5 rounded" />
            <span className="skeleton block h-3 w-2/3 rounded" />
          </div>
        )}
      </section>

      {cast.length > 0 && (
        <section className="rounded-2xl border border-line" aria-labelledby="voices-heading">
          <h2 id="voices-heading" className="px-4 pt-3 text-[17px] font-bold">
            Voices
          </h2>
          <ul className="py-2">
            {cast.map((p) => (
              <li key={p.handle} className="flex gap-3 px-4 py-2">
                <Avatar emoji={p.avatar} handle={p.handle} size={36} />
                <div className="min-w-0">
                  <div className="flex min-w-0 items-baseline gap-1">
                    <span className="truncate text-[15px] font-semibold">{p.name}</span>
                    <span className="truncate text-[13px] text-muted">@{p.handle}</span>
                  </div>
                  <p className="text-[13px] leading-5 text-muted">{p.bio}</p>
                  <p className="text-[12px] text-muted">
                    {p.location} · {p.kind === "historical" ? "historical figure (imagined)" : "fictional"}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="rounded-2xl bg-surface px-4 py-3 text-[12px] leading-5 text-muted">
        Everything here is AI-generated fiction. Posts attributed to historical figures are imagined, not real quotes.
      </p>
    </div>
  );
}
