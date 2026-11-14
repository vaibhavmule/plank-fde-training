import { handleChat } from "@/lib/chat";

// A tool loop on the large model can outlast a function's default limit.
export const maxDuration = 60;

export async function POST(request: Request) {
  return handleChat(request);
}
