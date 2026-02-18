import { describe, expect, it } from "vitest";
import { buildAllModelsFailedMessage } from "./agent-runner-execution.js";

describe("buildAllModelsFailedMessage", () => {
  it("produces a rate-limit message when all providers are in cooldown", () => {
    const raw =
      "All models failed (3): moonshot/kimi-k2.5: Provider moonshot is in cooldown (all profiles unavailable) (rate_limit) | ollama/qwen3:8b: Provider ollama is in cooldown (all profiles unavailable) (rate_limit) | ollama/qwen3-coder:latest: Provider ollama is in cooldown (all profiles unavailable) (rate_limit)";
    const result = buildAllModelsFailedMessage(raw);
    expect(result).toContain("rate-limited");
    expect(result).toContain("moonshot");
    expect(result).toContain("ollama");
    expect(result).not.toContain("Provider moonshot is in cooldown");
  });

  it("produces a billing message when all providers have billing issues", () => {
    const raw =
      "All models failed (2): anthropic/claude-haiku-4-5: Insufficient credits (billing) | openai/gpt-4.1: Insufficient credits (billing)";
    const result = buildAllModelsFailedMessage(raw);
    expect(result).toContain("billing");
    expect(result).toContain("anthropic");
    expect(result).toContain("openai");
  });

  it("produces an auth message when all providers have auth failures", () => {
    const raw =
      "All models failed (2): anthropic/claude-haiku-4-5: 401 Unauthorized (auth) | openai/gpt-4.1: 401 Unauthorized (auth)";
    const result = buildAllModelsFailedMessage(raw);
    expect(result).toContain("Authentication failed");
    expect(result).toContain("anthropic");
    expect(result).toContain("openai");
  });

  it("produces a generic message for mixed failure types", () => {
    const raw =
      "All models failed (2): anthropic/claude-haiku-4-5: 401 Unauthorized (auth) | ollama/qwen3:8b: Provider ollama is in cooldown (all profiles unavailable) (rate_limit)";
    const result = buildAllModelsFailedMessage(raw);
    expect(result).toContain("All AI models failed");
    expect(result).toContain("anthropic");
    expect(result).toContain("ollama");
    expect(result).toContain("openclaw models list --check");
  });

  it("handles image model failure messages", () => {
    const raw =
      "All image models failed (1): anthropic/claude-sonnet-4-5: Provider anthropic is in cooldown (all profiles unavailable) (rate_limit)";
    // The function is called after checking isAllImageModelsFailed, the raw message still gets parsed
    const result = buildAllModelsFailedMessage(raw);
    expect(result).toContain("rate-limited");
    expect(result).toContain("anthropic");
  });

  it("deduplicates provider names", () => {
    const raw =
      "All models failed (2): ollama/qwen3:8b: Provider ollama is in cooldown (rate_limit) | ollama/qwen3-coder:latest: Provider ollama is in cooldown (rate_limit)";
    const result = buildAllModelsFailedMessage(raw);
    // "ollama" should appear once in the provider list, not twice
    const providerListMatch = result.match(/\(([^)]+)\)/);
    expect(providerListMatch).toBeTruthy();
    const providerList = providerListMatch![1];
    const providers = providerList.split(", ");
    expect(providers.filter((p) => p === "ollama").length).toBe(1);
  });

  it("shows extracted provider name even for unknown segments", () => {
    const raw = "All models failed (0): unknown";
    const result = buildAllModelsFailedMessage(raw);
    // "unknown" is extracted as a provider name from the segment
    expect(result).toContain("All AI models failed");
    expect(result).toContain("openclaw models list --check");
  });
});
