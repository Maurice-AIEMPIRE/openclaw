import type { ApplyAuthChoiceParams, ApplyAuthChoiceResult } from "./auth-choice.apply.js";
import type { OpenClawConfig } from "../config/config.js";
import { resolveEnvApiKey } from "../agents/model-auth.js";
import { isLmStudioAvailable } from "../agents/models-config.providers.js";
import {
  formatApiKeyPreview,
  normalizeApiKeyInput,
  validateApiKeyInput,
} from "./auth-choice.api-key.js";
import {
  applyAuthProfileConfig,
  applyMinimaxApiConfig,
  applyMinimaxApiProviderConfig,
  setMinimaxApiKey,
} from "./onboard-auth.js";

/**
 * Budget Local: MiniMax M2.1 as primary brain + LM Studio for free local heartbeats.
 * Configures both the MiniMax API provider and a local LM Studio provider for heartbeats.
 */
export async function applyAuthChoiceBudgetLocal(
  params: ApplyAuthChoiceParams,
): Promise<ApplyAuthChoiceResult | null> {
  if (params.authChoice !== "budget-local") {
    return null;
  }

  let nextConfig = params.config;

  // ── Step 1: Configure MiniMax API key ──
  let hasCredential = false;
  const envKey = resolveEnvApiKey("minimax");
  if (envKey) {
    const useExisting = await params.prompter.confirm({
      message: `Use existing MINIMAX_API_KEY (${envKey.source}, ${formatApiKeyPreview(envKey.apiKey)})?`,
      initialValue: true,
    });
    if (useExisting) {
      await setMinimaxApiKey(envKey.apiKey, params.agentDir);
      hasCredential = true;
    }
  }
  if (!hasCredential) {
    const key = await params.prompter.text({
      message: "Enter MiniMax API key (from your Coding Plan subscription)",
      validate: validateApiKeyInput,
    });
    await setMinimaxApiKey(normalizeApiKeyInput(String(key)), params.agentDir);
  }

  // ── Step 2: Apply MiniMax auth profile ──
  nextConfig = applyAuthProfileConfig(nextConfig, {
    profileId: "minimax:default",
    provider: "minimax",
    mode: "api_key",
  });

  // ── Step 3: Apply MiniMax as primary model ──
  nextConfig = applyMinimaxApiProviderConfig(nextConfig);
  nextConfig = applyMinimaxApiConfig(nextConfig);

  // ── Step 4: Check for LM Studio and configure local heartbeat model ──
  const lmStudioRunning = await isLmStudioAvailable();
  if (lmStudioRunning) {
    await params.prompter.note(
      "LM Studio detected on port 1234. Heartbeats will use local models for free.",
      "LM Studio found",
    );
  } else {
    await params.prompter.note(
      "LM Studio not detected. Install it from https://lmstudio.ai and load a 3-4B model (Qwen 3 4B recommended). " +
        "Heartbeats will use MiniMax until LM Studio is running. " +
        "Once LM Studio is detected, heartbeats switch to local automatically.",
      "LM Studio not running",
    );
  }

  // ── Step 5: Apply LM Studio provider + heartbeat config ──
  nextConfig = applyBudgetLocalHeartbeatConfig(nextConfig);

  return { config: nextConfig };
}

/**
 * Apply LM Studio as the heartbeat model provider and configure heartbeat defaults.
 */
function applyBudgetLocalHeartbeatConfig(cfg: OpenClawConfig): OpenClawConfig {
  const next = structuredClone(cfg);

  // Ensure models.providers.lmstudio exists
  if (!next.models) {
    next.models = {};
  }
  if (!next.models.providers) {
    next.models.providers = {};
  }
  next.models.mode = "merge";

  // Add LM Studio provider if not already configured
  if (!next.models.providers.lmstudio) {
    next.models.providers.lmstudio = {
      baseUrl: "http://127.0.0.1:1234/v1",
      apiKey: "lmstudio",
      api: "openai-responses",
      models: [
        {
          id: "heartbeat-local",
          name: "Local Heartbeat",
          reasoning: false,
          input: ["text"],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 8192,
          maxTokens: 1024,
        },
      ],
    };
  }

  // Configure heartbeat to use local model
  if (!next.agents) {
    next.agents = {};
  }
  if (!next.agents.defaults) {
    next.agents.defaults = {};
  }
  if (!next.agents.defaults.heartbeat) {
    next.agents.defaults.heartbeat = {};
  }
  next.agents.defaults.heartbeat.model = "lmstudio/heartbeat-local";

  return next;
}
