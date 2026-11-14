import { cookies } from "next/headers";

/** Shared by the proxy, which sets it, and the app, which reads it. */
export const VISITOR_COOKIE = "visitor";

/**
 * The browser's anonymous id, or `undefined` for a request without the cookie.
 * Reading the cookie jar is request-time work.
 */
export async function visitorId(): Promise<string | undefined> {
  const value = (await cookies()).get(VISITOR_COOKIE)?.value?.trim();
  return value || undefined;
}
