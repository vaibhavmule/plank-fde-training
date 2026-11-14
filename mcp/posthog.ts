import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { posthogServer } from "@/mcp/posthog";

const projectId = process.env.POSTHOG_PROJECT_ID ?? "";
const personalKey = process.env.POSTHOG_PERSONAL_KEY ?? "";
const apiHost = process.env.POSTHOG_API_HOST || "https://us.posthog.com";

if (!projectId || !personalKey) {
  console.error(
    "mcp/posthog: set POSTHOG_PROJECT_ID and POSTHOG_PERSONAL_KEY in .env.local.",
  );
  process.exit(1);
}

async function main() {
  // No `fetch` is passed, so the server uses the real one.
  const server = posthogServer({ apiHost, projectId, personalKey });
  await server.connect(new StdioServerTransport());
}

void main();
