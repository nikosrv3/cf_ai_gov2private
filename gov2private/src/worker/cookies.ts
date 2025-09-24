// Minimal, unsigned cookie helpers for demo.
// Swap for HMAC-signed cookies later using Web Crypto.

import type { Context } from "hono";

const COOKIE = "uid";

export function getOrSetUid(c: Context, fallback = "demo-user"): string {
  const cookie = c.req.header("Cookie") ?? "";
  const match = cookie.match(new RegExp(`${COOKIE}=([^;]+)`));
  if (match) return decodeURIComponent(match[1]);

  const uid = fallback;
  // httpOnly is fine for API-only demo; adjust SameSite/Secure per your domain
  c.header("Set-Cookie", `${COOKIE}=${encodeURIComponent(uid)}; Path=/; HttpOnly; SameSite=Lax`);
  return uid;
}
