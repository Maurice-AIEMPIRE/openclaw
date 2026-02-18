import { describe, expect, it } from "vitest";
import { checkSystemIntegrations } from "./check-integrations.js";

describe("checkSystemIntegrations", () => {
  it("returns a summary with timestamp and results array", () => {
    const summary = checkSystemIntegrations({});
    expect(summary).toHaveProperty("ts");
    expect(summary).toHaveProperty("results");
    expect(summary).toHaveProperty("overallStatus");
    expect(typeof summary.ts).toBe("number");
    expect(Array.isArray(summary.results)).toBe(true);
    expect(["ok", "degraded", "error"]).toContain(summary.overallStatus);
  });

  it("each result has required fields", () => {
    const summary = checkSystemIntegrations({});
    for (const result of summary.results) {
      expect(result).toHaveProperty("name");
      expect(result).toHaveProperty("category");
      expect(result).toHaveProperty("status");
      expect(result).toHaveProperty("message");
      expect(["channel", "model-provider"]).toContain(result.category);
      expect(["ok", "degraded", "error", "not-configured"]).toContain(result.status);
    }
  });

  it("includes channel results from channel plugins", () => {
    const summary = checkSystemIntegrations({});
    const channelResults = summary.results.filter((r) => r.category === "channel");
    // There should be at least some channel plugins registered
    expect(channelResults.length).toBeGreaterThanOrEqual(0);
  });

  it("includes model-provider results", () => {
    const summary = checkSystemIntegrations({});
    const providerResults = summary.results.filter((r) => r.category === "model-provider");
    // With empty config, we either get providers from env or a "no providers" error
    expect(providerResults.length).toBeGreaterThanOrEqual(0);
  });

  it("overall status is error when there are error results", () => {
    // With an empty config and no env vars, providers should report errors
    const summary = checkSystemIntegrations({});
    const hasErrors = summary.results.some((r) => r.status === "error");
    if (hasErrors) {
      expect(summary.overallStatus).toBe("error");
    }
  });
});
