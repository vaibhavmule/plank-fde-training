import "server-only";

import { z } from "zod";

import { loadPolicies, type Policy } from "@/lib/policies";
import type { ChatMessage, Model, Provider, TokenUsage } from "@/lib/providers";
import { readPage, searchWeb } from "@/lib/web";

export type ResearchEvents = {
  step: (message: string) => void;
  text: (delta: string) => void;
  spend: (model: string, usage: TokenUsage) => void;
};

export type ResearchOptions = {
  braveSearchKey?: string;
  fetch?: typeof globalThis.fetch;
  models?: { planner?: string; writer?: string };
  maxPolicies?: number;
  maxSearches?: number;
};

export type ResearchPlan = {
  policies: string[];
  searches: string[];
};

export type ResearchSource = {
  index: number;
  kind: "policy" | "web";
  title: string;
  slug?: string;
  url?: string;
  text: string;
};

const MAX_POLICIES = 3;
const MAX_SEARCHES = 3;
const PLANNER_MAX_TOKENS = 600;
const EXTRACTOR_MAX_TOKENS = 600;
const WRITER_MAX_TOKENS = 1_200;

const PLANNER_SYSTEM =
  "You plan research for WorkBot, an internal assistant. Choose the smallest set of company policies and web searches that can answer the question. Return JSON only.";

const EXTRACTOR_SYSTEM = `You extract facts for a research answer. Read the question and the source. Return up to 6 bullet points, each starting with "-", that directly help answer the question. Keep numbers, limits, names and dates exactly as written. If the source has nothing relevant, return "- Nothing relevant." Use only the source; do not add outside knowledge.`;

function planSchema(maxPolicies: number, maxSearches: number) {
  return z.object({
    policies: z.array(z.string().trim().min(1)).max(maxPolicies).default([]),
    searches: z
      .array(z.string().trim().min(1).max(400))
      .max(maxSearches)
      .default([]),
  });
}

function extractJson(text: string) {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  if (fenced) return fenced[1].trim();

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  return start >= 0 && end > start ? text.slice(start, end + 1) : text.trim();
}

function parsePlan(
  text: string,
  knownSlugs: ReadonlySet<string>,
  maxPolicies: number,
  maxSearches: number,
): ResearchPlan {
  let value: unknown;
  try {
    value = JSON.parse(extractJson(text)) as unknown;
  } catch {
    throw new Error("The plan was not valid JSON.");
  }

  const parsed = planSchema(maxPolicies, maxSearches).safeParse(value);
  if (!parsed.success) throw new Error(z.prettifyError(parsed.error));

  const unknown = parsed.data.policies.filter((slug) => !knownSlugs.has(slug));
  if (unknown.length > 0) {
    throw new Error(`Unknown policy slugs: ${unknown.join(", ")}.`);
  }

  return {
    policies: [...new Set(parsed.data.policies)],
    searches: [...new Set(parsed.data.searches)],
  };
}

function cheapestModel(models: readonly Model[]) {
  return models.reduce((cheapest, model) =>
    model.pricePerMillionTokens.input < cheapest.pricePerMillionTokens.input
      ? model
      : cheapest,
  );
}

function chooseModels(
  provider: Provider,
  options: ResearchOptions,
): { planner: string; writer: string } {
  if (provider.models.length === 0) {
    throw new Error("The provider has no models.");
  }

  return {
    planner: options.models?.planner ?? cheapestModel(provider.models).id,
    writer: options.models?.writer ?? provider.models[0].id,
  };
}

function plannerPrompt(
  question: string,
  policies: Policy[],
  hasWebSearch: boolean,
  maxPolicies: number,
  maxSearches: number,
) {
  const catalog = policies
    .map((policy) => `- ${policy.slug}: ${policy.title} — ${policy.summary}`)
    .join("\n");

  return `Company policies (use the slug exactly):
${catalog}

Return only a JSON object with two arrays: "policies" (policy slugs) and "searches" (web search queries).

Rules:
- Choose at most ${maxPolicies} policies that could contain the answer.
- ${
    hasWebSearch
      ? `Choose at most ${maxSearches} web searches for current information that the policies cannot answer.`
      : "Do not return web searches; web search is not configured."
  }
- Use only the policy slugs listed above.
- Return JSON only, with no prose or markdown.

Question: ${question}`;
}

async function complete(
  provider: Provider,
  model: string,
  system: string,
  messages: ChatMessage[],
  on: ResearchEvents,
  options: { stream?: boolean; maxTokens: number },
) {
  let text = "";

  const usage = await provider.stream(
    { model, system, messages, maxTokens: options.maxTokens },
    {
      text: (delta) => {
        text += delta;
        if (options.stream) on.text(delta);
      },
      tool: () => {},
    },
  );

  on.spend(model, usage);
  return { text, usage };
}

async function plan(
  question: string,
  provider: Provider,
  plannerModel: string,
  policies: Policy[],
  hasWebSearch: boolean,
  on: ResearchEvents,
  options: ResearchOptions,
) {
  const maxPolicies = options.maxPolicies ?? MAX_POLICIES;
  const maxSearches = options.maxSearches ?? MAX_SEARCHES;
  const knownSlugs = new Set(policies.map((policy) => policy.slug));
  const prompt = plannerPrompt(
    question,
    policies,
    hasWebSearch,
    maxPolicies,
    maxSearches,
  );
  const messages: ChatMessage[] = [{ role: "user", content: prompt }];

  on.step("Planning research");
  const first = await complete(
    provider,
    plannerModel,
    PLANNER_SYSTEM,
    messages,
    on,
    { maxTokens: PLANNER_MAX_TOKENS },
  );

  try {
    return parsePlan(first.text, knownSlugs, maxPolicies, maxSearches);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    on.step("The plan was invalid; asking the planner again");

    messages.push(
      { role: "assistant", content: first.text },
      {
        role: "user",
        content: `That plan was rejected: ${reason}\nReturn only a JSON object with "policies" and "searches". Use the policy slugs from the list.`,
      },
    );

    const second = await complete(
      provider,
      plannerModel,
      PLANNER_SYSTEM,
      messages,
      on,
      { maxTokens: PLANNER_MAX_TOKENS },
    );

    try {
      return parsePlan(second.text, knownSlugs, maxPolicies, maxSearches);
    } catch (retryError) {
      const retryReason =
        retryError instanceof Error ? retryError.message : String(retryError);
      throw new Error(
        `Could not plan the research: ${retryReason}\n\nModel reply:\n${second.text}`,
      );
    }
  }
}

type CollectedSource = Omit<ResearchSource, "index">;

async function collectSources(
  planResult: ResearchPlan,
  policies: Policy[],
  options: ResearchOptions,
): Promise<ResearchSource[]> {
  const bySlug = new Map(policies.map((policy) => [policy.slug, policy]));
  const collected: CollectedSource[] = planResult.policies
    .map((slug) => bySlug.get(slug))
    .filter((policy): policy is Policy => policy !== undefined)
    .map((policy) => ({
      kind: "policy",
      title: policy.title,
      slug: policy.slug,
      text: policy.body,
    }));

  if (options.braveSearchKey) {
    const web = await Promise.all(
      planResult.searches.map(
        async (query): Promise<CollectedSource | null> => {
          try {
            const results = await searchWeb(query, {
              apiKey: options.braveSearchKey!,
              count: 1,
              fetch: options.fetch,
            });
            const top = results[0];
            if (!top) return null;

            let text = top.description;
            try {
              const page = await readPage(top.url, { fetch: options.fetch });
              if (page.trim()) text = page;
            } catch {
              // Keep the search snippet when the page cannot be read.
            }

            return { kind: "web", title: top.title, url: top.url, text };
          } catch {
            return null;
          }
        },
      ),
    );

    for (const source of web) if (source) collected.push(source);
  }

  return collected.map((source, index) => ({ ...source, index: index + 1 }));
}

function sourceList(sources: ResearchSource[]) {
  return sources
    .map((source) =>
      source.kind === "policy"
        ? `[${source.index}] ${source.title} (/policies/${source.slug})`
        : `[${source.index}] ${source.title} — ${source.url}`,
    )
    .join("\n");
}

async function extract(
  question: string,
  sources: ResearchSource[],
  provider: Provider,
  writerModel: string,
  on: ResearchEvents,
) {
  return Promise.all(
    sources.map(async (source) => {
      const kindLabel =
        source.kind === "policy" ? "company policy" : "web page";
      const prompt = `Question: ${question}

Source [${source.index}] — ${source.title} (${kindLabel})

${source.text}`;

      const { text } = await complete(
        provider,
        writerModel,
        EXTRACTOR_SYSTEM,
        [{ role: "user", content: prompt }],
        on,
        { maxTokens: EXTRACTOR_MAX_TOKENS },
      );

      return {
        source,
        notes: text.trim() || "- Nothing relevant.",
      };
    }),
  );
}

async function write(
  question: string,
  notes: { source: ResearchSource; notes: string }[],
  provider: Provider,
  writerModel: string,
  on: ResearchEvents,
) {
  const sources = notes.map(({ source }) => source);
  const system = `You write WorkBot answers from research notes. Use only the notes; do not add facts from outside them. Answer the question directly. Put a numbered citation like [1] after every fact. End with a "Sources" section containing exactly this list, one source per line:

${sourceList(sources)}`;

  const body = notes
    .map(
      ({ source, notes: extracted }) =>
        `[${source.index}] ${source.title}\n${extracted}`,
    )
    .join("\n\n");

  const { text } = await complete(
    provider,
    writerModel,
    system,
    [
      {
        role: "user",
        content: `Question: ${question}\n\nNotes:\n${body}\n\nWrite the answer with citations and the Sources section.`,
      },
    ],
    on,
    { stream: true, maxTokens: WRITER_MAX_TOKENS },
  );

  return text;
}

/**
 * Answers a question in four focused calls: plan, read, extract and write.
 * The planner uses the cheapest model and the extraction and writing steps use
 * the provider's default (largest) model.
 */
export async function research(
  question: string,
  provider: Provider,
  on: ResearchEvents,
  options: ResearchOptions = {},
): Promise<string> {
  const cleaned = question.trim();
  if (!cleaned) throw new Error("Ask a research question.");

  const policies = await loadPolicies();
  if (policies.length === 0) throw new Error("No policies are available.");

  const { planner, writer } = chooseModels(provider, options);
  const planResult = await plan(
    cleaned,
    provider,
    planner,
    policies,
    Boolean(options.braveSearchKey),
    on,
    options,
  );

  const policyCount = planResult.policies.length;
  const searchCount = options.braveSearchKey ? planResult.searches.length : 0;
  on.step(
    `Reading ${policyCount} ${policyCount === 1 ? "policy" : "policies"} and ${searchCount} ${searchCount === 1 ? "web result" : "web results"}`,
  );

  const sources = await collectSources(planResult, policies, options);
  if (sources.length === 0) {
    throw new Error("No policies or web pages matched that question.");
  }

  on.step(
    `Extracting facts from ${sources.length} ${sources.length === 1 ? "source" : "sources"}`,
  );
  const notes = await extract(cleaned, sources, provider, writer, on);

  on.step("Writing the answer");
  return write(cleaned, notes, provider, writer, on);
}
