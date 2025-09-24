// Signed cookie helpers for anonymous uid via HMAC (Web Crypto).
// References (Cloudflare):
// - Web Crypto HMAC in Workers: importKey/sign/verify examples in "Sign requests" docs
//   (crypto.subtle.importKey, .sign, .verify) – use HMAC + SHA-256. 
// - WAF "HMAC token generation" points to the Workers JS/TS example.
// See citations in commit message / PR description.

// No Node 'Buffer' here (Workers web runtime). Use web-safe base64url helpers.

const enc = new TextEncoder();

/** Convert bytes -> base64url string (no padding). */
function toBase64url(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  // Convert to binary string, then base64, then make it URL-safe
  let bin = "";
  for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
  const b64 = btoa(bin);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}


async function importHmacKey(secret: string): Promise<CryptoKey> {
  // Cloudflare Workers Web Crypto: HMAC + SHA-256 key import (sign + verify).
  // Example pattern matches docs: crypto.subtle.importKey("raw", ..., { name:"HMAC", hash:"SHA-256" }, false, ["sign","verify"])
  // (See Cloudflare "Sign requests" example.)
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

/** Sign a uid with HMAC-SHA256 (base64url). */
export async function signUid(uid: string, secret: string): Promise<string> {
  const key = await importHmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(uid)); // per Cloudflare docs (Web Crypto HMAC)
  return toBase64url(sig);
}

/** Verify a uid + base64url signature using constant-time string comparison. */
export async function verifyUid(uid: string, sigB64Url: string, secret: string): Promise<boolean> {
  if (!uid || !sigB64Url) return false;
  const expected = await signUid(uid, secret); // base64url
  // Constant-time compare (string XOR); avoids early-bail timing leaks.
  if (expected.length !== sigB64Url.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ sigB64Url.charCodeAt(i);
  }
  return diff === 0;
}

/** Parse Cookie header -> { name: value } */
export function parseCookieHeader(header: string | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  const parts = header.split(/; */);
  for (const p of parts) {
    const i = p.indexOf("=");
    if (i === -1) continue;
    const k = decodeURIComponent(p.slice(0, i).trim());
    const v = decodeURIComponent(p.slice(i + 1).trim());
    if (k) out[k] = v;
  }
  return out;
}

/** Serialize a Set-Cookie line with secure defaults. */
function serializeCookie(name: string, value: string, opts?: {
  httpOnly?: boolean; secure?: boolean; sameSite?: "Lax" | "Strict" | "None"; path?: string; maxAge?: number;
}): string {
  const parts = [`${encodeURIComponent(name)}=${encodeURIComponent(value)}`];
  const o = opts ?? {};
  parts.push(`Path=${o.path ?? "/"}`);
  parts.push(`SameSite=${o.sameSite ?? "Lax"}`);
  parts.push(`Max-Age=${o.maxAge ?? 31536000}`); // 1 year
  if (o.httpOnly !== false) parts.push(`HttpOnly`);
  if (o.secure !== false) parts.push(`Secure`);
  return parts.join("; ");
}

/** 128-bit random uid as hex string. */
export function randomUid(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return Array.from(b, x => x.toString(16).padStart(2, "0")).join("");
}

/**
 * Ensure a valid uid/sig pair based on HMAC (Workers Web Crypto).
 * If missing/invalid, issues new cookies.
 */
export async function ensureUidFromCookieHeader(appSecret: string, cookieHeader: string | null | undefined): Promise<{
  uid: string;
  setCookies: string[];
}> {
  const cookies = parseCookieHeader(cookieHeader);
  const uid = cookies["uid"];
  const sig = cookies["uid_sig"];

  if (uid && sig) {
    const ok = await verifyUid(uid, sig, appSecret);
    if (ok) return { uid, setCookies: [] };
  }

  // Issue new pair
  const newUid = randomUid();
  const newSig = await signUid(newUid, appSecret);

  const common = { httpOnly: true, secure: true, sameSite: "Lax" as const, path: "/", maxAge: 31536000 };
  const setCookies = [
    serializeCookie("uid", newUid, common),
    serializeCookie("uid_sig", newSig, common),
  ];
  return { uid: newUid, setCookies };
}
