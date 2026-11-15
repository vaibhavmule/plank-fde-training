import { z } from "zod";

import { evaluate } from "@/lib/calculator";
import { customerSections, knowledgeTools } from "@/lib/knowledge-tools";
import { noteInputSchema } from "@/lib/note-model";
import { tool, type Tool } from "@/lib/tool";
import { readPage, searchWeb } from "@/lib/web";

export { tool, type Tool };

const calculatorInput = z.object({
  expression: z
    .string()
    .trim()
    .min(1)
    .max(1_000)
    .describe("The expression to evaluate, for example (1234 * 5678) / 3"),
});

export const calculatorTool = tool({
  name: "calculator",
  description:
    "Evaluate an arithmetic expression exactly. Call this for any calculation, even one you think you can do in your head, so the answer is exact and checked. It supports +, -, *, /, % (remainder), ^ (power), parentheses and decimals.",
  input: calculatorInput,
  run({ expression }) {
    return String(evaluate(expression));
  },
});

const readUrlInput = z.object({
  url: z.url().describe("A public http or https URL"),
});

export function readUrlTool(doFetch?: typeof globalThis.fetch) {
  return tool({
    name: "read_url",
    description:
      "Read a public web page and return its readable text. Call this when the person gives you a link, or when a search result's snippet is not enough to answer. Only public http and https pages work; private, local and internal addresses are refused.",
    input: readUrlInput,
    async run({ url }) {
      const text = await readPage(url, { fetch: doFetch });
      return text || "The page had no readable text.";
    },
  });
}

export const saveNoteTool = tool({
  name: "save_note",
  description:
    "Save a note for later. Call this when the person asks you to remember something, such as a decision, a detail, a preference or a follow-up, or when you need somewhere to keep a finding. Give it a short title and the full text in the body.",
  input: noteInputSchema,
  async run(input) {
    const { saveNote } = await import("@/lib/notes");
    const note = await saveNote(input);
    return note.title
      ? `Saved note "${note.title}" (${note.id}).`
      : `Saved note (${note.id}).`;
  },
});

const webSearchInput = z.object({
  query: z
    .string()
    .trim()
    .min(1)
    .max(400)
    .describe("The search query, written as the person would ask it"),
  count: z
    .number()
    .int()
    .min(1)
    .max(20)
    .default(5)
    .describe("How many results to return"),
});

export function webSearchTool(
  apiKey: string,
  doFetch?: typeof globalThis.fetch,
) {
  return tool({
    name: "web_search",
    description:
      "Search the web for current information. Call this when the answer is not in company documents and the person asks about something recent, public or outside WorkBot. It returns titles, URLs and snippets; use read_url to read a promising page in full.",
    input: webSearchInput,
    async run({ query, count }) {
      const results = await searchWeb(query, {
        apiKey,
        count,
        fetch: doFetch,
      });

      if (results.length === 0) {
        return `No results found for "${query}". Try broadening the search.`;
      }

      return results
        .map(
          (result, index) =>
            `${index + 1}. ${result.title}\n${result.url}\n${result.description}`,
        )
        .join("\n\n");
    },
  });
}

export type ToolOutcome = {
  result: string;
  failed: boolean;
};

function describeInputError(error: z.ZodError) {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`)
    .join("; ");
}

/**
 * Runs one tool call on behalf of a model. Unknown tools, invalid input and
 * thrown errors come back as failed results, never as exceptions, so the model
 * sees what went wrong.
 */
export async function runTool(
  tools: readonly Tool[],
  call: { name: string; input: unknown },
): Promise<ToolOutcome> {
  const found = tools.find((candidate) => candidate.name === call.name);

  if (!found) {
    return {
      result: `Unknown tool "${call.name}". Available tools: ${
        tools.map((candidate) => candidate.name).join(", ") || "none"
      }.`,
      failed: true,
    };
  }

  const parsed = found.input.safeParse(call.input);
  if (!parsed.success) {
    return {
      result: `Invalid input for "${found.name}": ${describeInputError(parsed.error)}`,
      failed: true,
    };
  }

  try {
    return { result: await found.run(parsed.data), failed: false };
  } catch (error) {
    return {
      result: `The ${found.name} tool failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
      failed: true,
    };
  }
}

export type ToolOptions = {
  braveSearchKey?: string;
  fetch?: typeof globalThis.fetch;
};

/**
 * Everything a member of staff may call: the whole knowledge base, the
 * calculator, page reading, notes and web search. Used by the terminal, the
 * investigation agent and the explainer's researcher.
 */
export function employeeTools(options: ToolOptions = {}): Tool[] {
  const registry: Tool[] = [
    ...knowledgeTools(),
    calculatorTool,
    readUrlTool(options.fetch),
    saveNoteTool,
  ];

  if (options.braveSearchKey) {
    registry.push(webSearchTool(options.braveSearchKey, options.fetch));
  }

  return registry;
}

/**
 * Everything a customer may call: the knowledge base narrowed to the sections
 * a customer may read, the calculator and page reading. No notes and no web
 * search, because the web chat is public until Day 30 adds sign-in.
 */
export function customerTools(options: ToolOptions = {}): Tool[] {
  return [
    ...knowledgeTools(customerSections),
    calculatorTool,
    readUrlTool(options.fetch),
  ];
}
