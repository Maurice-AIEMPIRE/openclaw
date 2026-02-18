import type { OpenClawConfig } from "../config/config.js";
import type { RuntimeEnv } from "../runtime.js";
import { resolveOpenClawAgentDir } from "../agents/agent-paths.js";
import { buildAuthHealthSummary } from "../agents/auth-health.js";
import {
  ensureAuthProfileStore,
  isProfileInCooldown,
  resolveAuthProfileOrder,
  resolveProfileUnusableUntilForDisplay,
} from "../agents/auth-profiles.js";
import { listChannelPlugins } from "../channels/plugins/index.js";
import { loadConfig } from "../config/config.js";
import { info } from "../globals.js";
import { theme } from "../terminal/theme.js";

export type IntegrationCheckResult = {
  name: string;
  category: "channel" | "model-provider";
  status: "ok" | "degraded" | "error" | "not-configured";
  message: string;
  details?: string;
};

export type IntegrationCheckSummary = {
  ts: number;
  results: IntegrationCheckResult[];
  overallStatus: "ok" | "degraded" | "error";
};

function checkChannelIntegrations(cfg: OpenClawConfig): IntegrationCheckResult[] {
  const results: IntegrationCheckResult[] = [];

  for (const plugin of listChannelPlugins()) {
    const accountIds = plugin.config.listAccountIds(cfg);
    if (accountIds.length === 0) {
      results.push({
        name: plugin.meta.label ?? plugin.id,
        category: "channel",
        status: "not-configured",
        message: "No accounts configured",
      });
      continue;
    }

    let configuredCount = 0;
    for (const accountId of accountIds) {
      const account = plugin.config.resolveAccount(cfg, accountId);
      const enabled = plugin.config.isEnabled ? plugin.config.isEnabled(account, cfg) : true;
      if (enabled) {
        configuredCount += 1;
      }
    }

    if (configuredCount === 0) {
      results.push({
        name: plugin.meta.label ?? plugin.id,
        category: "channel",
        status: "error",
        message: `${accountIds.length} account(s) found but none enabled`,
      });
    } else {
      results.push({
        name: plugin.meta.label ?? plugin.id,
        category: "channel",
        status: "ok",
        message: `${configuredCount} account(s) enabled`,
      });
    }
  }

  return results;
}

function checkModelProviderIntegrations(cfg: OpenClawConfig): IntegrationCheckResult[] {
  const results: IntegrationCheckResult[] = [];

  try {
    const agentDir = resolveOpenClawAgentDir();
    const authStore = ensureAuthProfileStore(agentDir, { allowKeychainPrompt: false });
    const authHealth = buildAuthHealthSummary({ store: authStore, cfg });

    if (authHealth.providers.length === 0) {
      results.push({
        name: "Model Providers",
        category: "model-provider",
        status: "error",
        message: "No model providers configured",
        details:
          'Run "openclaw onboard" to set up a provider, or add API keys via environment variables.',
      });
      return results;
    }

    for (const providerHealth of authHealth.providers) {
      const profileIds = resolveAuthProfileOrder({
        cfg,
        store: authStore,
        provider: providerHealth.provider,
      });

      let availableProfiles = 0;
      let cooldownProfiles = 0;
      let earliestCooldownUntil: number | undefined;

      for (const profileId of profileIds) {
        if (isProfileInCooldown(authStore, profileId)) {
          cooldownProfiles += 1;
          const unusableUntil = resolveProfileUnusableUntilForDisplay(authStore, profileId);
          if (
            unusableUntil &&
            (earliestCooldownUntil === undefined || unusableUntil < earliestCooldownUntil)
          ) {
            earliestCooldownUntil = unusableUntil;
          }
        } else {
          availableProfiles += 1;
        }
      }

      const totalProfiles = profileIds.length;

      if (totalProfiles === 0) {
        // Provider exists in auth health but has no resolvable profiles
        if (providerHealth.status === "missing") {
          results.push({
            name: providerHealth.provider,
            category: "model-provider",
            status: "error",
            message: "No auth profiles found",
            details: `Add an API key or run "openclaw models auth login --provider ${providerHealth.provider}"`,
          });
        } else {
          results.push({
            name: providerHealth.provider,
            category: "model-provider",
            status: "ok",
            message: `Auth: ${providerHealth.status}`,
          });
        }
      } else if (availableProfiles === 0) {
        const cooldownDetail =
          earliestCooldownUntil && earliestCooldownUntil > Date.now()
            ? `Next available in ~${Math.ceil((earliestCooldownUntil - Date.now()) / 60000)}m`
            : "Waiting for cooldown to expire";
        results.push({
          name: providerHealth.provider,
          category: "model-provider",
          status: "error",
          message: `All ${totalProfiles} profile(s) in cooldown`,
          details: cooldownDetail,
        });
      } else if (cooldownProfiles > 0) {
        results.push({
          name: providerHealth.provider,
          category: "model-provider",
          status: "degraded",
          message: `${availableProfiles}/${totalProfiles} profile(s) available (${cooldownProfiles} in cooldown)`,
        });
      } else {
        results.push({
          name: providerHealth.provider,
          category: "model-provider",
          status: "ok",
          message: `${availableProfiles} profile(s) available`,
        });
      }
    }
  } catch (err) {
    results.push({
      name: "Model Providers",
      category: "model-provider",
      status: "error",
      message: `Failed to check: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  return results;
}

export function checkSystemIntegrations(cfg?: OpenClawConfig): IntegrationCheckSummary {
  const resolvedCfg = cfg ?? loadConfig();
  const channelResults = checkChannelIntegrations(resolvedCfg);
  const providerResults = checkModelProviderIntegrations(resolvedCfg);
  const results = [...channelResults, ...providerResults];

  const hasError = results.some((r) => r.status === "error");
  const hasDegraded = results.some((r) => r.status === "degraded");
  const overallStatus = hasError ? "error" : hasDegraded ? "degraded" : "ok";

  return {
    ts: Date.now(),
    results,
    overallStatus,
  };
}

export async function checkIntegrationsCommand(opts: { json?: boolean }, runtime: RuntimeEnv) {
  const cfg = loadConfig();
  const summary = checkSystemIntegrations(cfg);

  if (opts.json) {
    runtime.log(JSON.stringify(summary, null, 2));
    return;
  }

  const overallLabel =
    summary.overallStatus === "ok"
      ? theme.success("OK")
      : summary.overallStatus === "degraded"
        ? theme.warn("DEGRADED")
        : theme.error("ERROR");

  runtime.log(info(`System Integration Check: ${overallLabel}`));
  runtime.log("");

  const channels = summary.results.filter((r) => r.category === "channel");
  const providers = summary.results.filter((r) => r.category === "model-provider");

  if (channels.length > 0) {
    runtime.log(info("Channels:"));
    for (const result of channels) {
      const statusIcon =
        result.status === "ok"
          ? theme.success("ok")
          : result.status === "degraded"
            ? theme.warn("degraded")
            : result.status === "not-configured"
              ? theme.muted("not configured")
              : theme.error("error");
      runtime.log(`  ${result.name}: ${statusIcon} - ${result.message}`);
      if (result.details) {
        runtime.log(`    ${theme.muted(result.details)}`);
      }
    }
    runtime.log("");
  }

  if (providers.length > 0) {
    runtime.log(info("Model Providers:"));
    for (const result of providers) {
      const statusIcon =
        result.status === "ok"
          ? theme.success("ok")
          : result.status === "degraded"
            ? theme.warn("degraded")
            : theme.error("error");
      runtime.log(`  ${result.name}: ${statusIcon} - ${result.message}`);
      if (result.details) {
        runtime.log(`    ${theme.muted(result.details)}`);
      }
    }
  }

  if (summary.overallStatus === "error") {
    runtime.exit(1);
  }
}
