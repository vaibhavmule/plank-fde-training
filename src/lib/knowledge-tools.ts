import { z } from "zod";

import { loadPolicy, searchPolicies } from "@/lib/policies";
import { tool, type Tool } from "@/lib/tools";

const searchInput = z.object({
  question: z
    .string()
    .trim()
    .min(1)
    .max(400)
    .describe("The words to look for in the company policies"),
});

const readPolicyInput = z.object({
  slug: z
    .string()
    .trim()
    .min(1)
    .describe("The policy slug, exactly as search_knowledge_base returned it"),
});

/**
 * The company knowledge base, shared by the investigation agent and the
 * explainer pipeline. Both get the same two tools and the same answers.
 */
export const searchKnowledgeBaseTool = tool({
  name: "search_knowledge_base",
  description:
    "Search the company policies for a question. Call this first. It returns the matching policies with their slugs and the lines that matched; read the most promising one with read_policy.",
  input: searchInput,
  async run({ question }) {
    const matches = await searchPolicies(question);
    if (matches.length === 0) {
      return `No policy mentions "${question}". Try different words, or the web when the policies do not cover it.`;
    }

    return matches
      .map(
        (match) =>
          `${match.slug} — ${match.title}: ${match.summary}\n${match.lines
            .map((line) => `  ${line}`)
            .join("\n")}`,
      )
      .join("\n\n");
  },
});

export const readPolicyTool = tool({
  name: "read_policy",
  description:
    "Read one company policy in full by its exact slug. Call this after search_knowledge_base names a policy that could answer the question.",
  input: readPolicyInput,
  async run({ slug }) {
    const policy = await loadPolicy(slug);
    if (!policy) {
      throw new Error(`There is no policy with the slug "${slug}".`);
    }

    return `${policy.title} (${policy.team}, updated ${policy.updatedAt})\nSource: /policies/${policy.slug}\n\n${policy.body}`;
  },
});

export function knowledgeTools(): Tool[] {
  return [searchKnowledgeBaseTool, readPolicyTool];
}
