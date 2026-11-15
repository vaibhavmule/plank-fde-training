import { anthropic as anthropicProvider } from "@ai-sdk/anthropic";
import { openai as openaiProvider } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

import { ANTHROPIC_MODELS, OPENAI_MODELS } from "@/lib/providers";

const KEYS = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
} as const;

type ProviderName = keyof typeof KEYS;

/**
 * A model for a CLI command, chosen the way the web chat chooses one:
 * CHAT_PROVIDER picks the provider, and "small" picks its cheapest model.
 * A CLI reads .env.local itself, so this does not use src/lib/config.ts.
 */
export function cliModel(size: "default" | "small" = "default"): {
  model: LanguageModel;
  id: string;
} {
  const provider = (process.env.CHAT_PROVIDER || "anthropic") as ProviderName;
  if (!(provider in KEYS)) {
    throw new Error(
      `Unknown CHAT_PROVIDER "${provider}". Use "anthropic" or "openai".`,
    );
  }

  const key = process.env[KEYS[provider]] ?? "";
  if (!key) {
    throw new Error(`${KEYS[provider]} is not set. Add it to .env.local.`);
  }

  const models = provider === "anthropic" ? ANTHROPIC_MODELS : OPENAI_MODELS;
  const id =
    size === "small"
      ? models[models.length - 1].id
      : process.env.CHAT_MODEL || models[0].id;

  const model =
    provider === "anthropic"
      ? anthropicProvider.languageModel(id)
      : openaiProvider.languageModel(id);

  return { model, id };
}
