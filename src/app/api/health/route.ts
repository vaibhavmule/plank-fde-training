import { connection } from "next/server";

import { config } from "@/lib/config";
import { query } from "@/lib/db";

export async function GET() {
  await connection();

  try {
    await query("select 1");
  } catch {
    return Response.json(
      { status: "error", database: "unreachable", commit: config.commit },
      { status: 503 },
    );
  }

  return Response.json({ status: "ok", database: "ok", commit: config.commit });
}
