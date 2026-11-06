import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { readModelConfig } from "@/lib/models";
import { buildStreamParams, classifyError, MissingApiKeyError } from "./claude";

const request = { model: "claude-opus-5-5", maxTokens: 16000, system: ["rules", "card"], user: "Year: 1347" };

describe("buildStreamParams", () => {
  it("sends effort, caches the first system block and opts into default fallbacks", () => {
    expect(buildStreamParams(request, readModelConfig({}))).toEqual({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      system: [
        { type: "text", text: "rules", cache_control: { type: "ephemeral" } },
        { type: "text", text: "card" },
      ],
      messages: [{ role: "user", content: "Year: 1347" }],
      output_config: { effort: "low" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
  });

  it("never sends thinking, sampling parameters or tool_choice", () => {
    const params = buildStreamParams(request, readModelConfig({})) as unknown as Record<string, unknown>;
    for (const key of ["thinking", "temperature", "top_p", "top_k", "tool_choice"]) expect(params).not.toHaveProperty(key);
    expect((params.messages as unknown[]).at(-1)).toMatchObject({ role: "user" });
  });

  it("omits fallbacks for Haiku 5.5 and when switched off", () => {
    const haiku = buildStreamParams({ ...request, model: "claude-haiku-5-5" }, readModelConfig({}));
    expect(haiku).not.toHaveProperty("fallbacks");
    expect(haiku).not.toHaveProperty("betas");
    const off = buildStreamParams(request, readModelConfig({ CHRONOFEED_FALLBACKS: "off" }));
    expect(off).not.toHaveProperty("fallbacks");
  });
});

describe("classifyError", () => {
  const headers = new Headers();
  it("maps SDK errors to codes, most specific first", () => {
    expect(classifyError(new MissingApiKeyError()).code).toBe("auth");
    expect(classifyError(new Anthropic.AuthenticationError(401, undefined, "bad key", headers)).code).toBe("auth");
    expect(classifyError(new Anthropic.RateLimitError(429, undefined, "slow", headers)).code).toBe("rate_limit");
    expect(classifyError(new Anthropic.NotFoundError(404, undefined, "model", headers)).code).toBe("not_found");
    expect(classifyError(new Anthropic.InternalServerError(500, undefined, "oops", headers)).code).toBe("upstream");
    expect(classifyError(new Anthropic.APIUserAbortError()).aborted).toBe(true);
    expect(classifyError(new Error("?")).code).toBe("upstream");
  });
});
