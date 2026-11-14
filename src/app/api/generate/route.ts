import { handleGenerate } from "@/lib/generate";

export const maxDuration = 60;

export async function POST(request: Request) {
  return handleGenerate(request);
}
