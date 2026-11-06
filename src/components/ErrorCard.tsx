import type { ErrorCode } from "@/lib/types";

export function ErrorCard({ code, message, onRetry }: { code: ErrorCode; message: string; onRetry(): void }) {
  return (
    <div role="alert" className="m-4 rounded-2xl border border-line p-4">
      {code === "auth" ? (
        <>
          <h2 className="text-[17px] font-bold">Connect an Anthropic API key</h2>
          <p className="mt-1 text-[15px] leading-6 text-muted">{message}</p>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-[14px] leading-6">
            <li>
              Copy <code className="rounded bg-surface px-1">.env.example</code> to <code className="rounded bg-surface px-1">.env.local</code> and set{" "}
              <code className="rounded bg-surface px-1">ANTHROPIC_API_KEY</code>.
            </li>
            <li>Restart the dev server.</li>
          </ol>
          <p className="mt-3 text-[14px] leading-6 text-muted">
            No key? Run <code className="rounded bg-surface px-1">npm run dev:mock</code> to try the app with template content.
          </p>
        </>
      ) : (
        <>
          <h2 className="text-[17px] font-bold">
            {code === "rate_limit" ? "Slow down a little" : code === "refusal" ? "This era could not be written" : "The agents lost the signal"}
          </h2>
          <p className="mt-1 text-[15px] leading-6 text-muted">{message}</p>
        </>
      )}
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 rounded-full bg-accent px-4 py-1.5 text-[14px] font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
      >
        Try again
      </button>
    </div>
  );
}
