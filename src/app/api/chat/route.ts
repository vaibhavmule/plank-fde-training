import { chatModel, handleChat } from "@/lib/chat";
import { visitorId } from "@/lib/visitor";

// A tool loop on the large model can outlast a function's default limit.
export const maxDuration = 60;

export async function POST(request: Request) {
  return handleChat(request, chatModel(), { visitor: await visitorId() });
}
