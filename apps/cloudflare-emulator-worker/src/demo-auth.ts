const encoder = new TextEncoder();

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64UrlDecode(value: string): Uint8Array {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function key(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export type DemoClaims = { sub: string; aud: "acueducto-demo"; exp: number };

export async function signDemoToken(secret: string, subject: string, expiresAt: number): Promise<string> {
  const payload: DemoClaims = { sub: subject, aud: "acueducto-demo", exp: expiresAt };
  const encoded = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign("HMAC", await key(secret), encoder.encode(encoded));
  return `${encoded}.${base64UrlEncode(new Uint8Array(signature))}`;
}

export async function verifyDemoToken(secret: string, token: string, now = Math.floor(Date.now() / 1000)): Promise<DemoClaims | null> {
  if (!secret || token.length > 2048) return null;
  const [encoded, signature, extra] = token.split(".");
  if (!encoded || !signature || extra !== undefined) return null;
  try {
    const signatureBytes = base64UrlDecode(signature);
    const signatureBuffer = new ArrayBuffer(signatureBytes.byteLength);
    new Uint8Array(signatureBuffer).set(signatureBytes);
    const valid = await crypto.subtle.verify("HMAC", await key(secret), signatureBuffer, encoder.encode(encoded));
    if (!valid) return null;
    const claims = JSON.parse(new TextDecoder().decode(base64UrlDecode(encoded))) as Partial<DemoClaims>;
    if (typeof claims.sub !== "string" || !claims.sub || claims.aud !== "acueducto-demo" ||
        typeof claims.exp !== "number" || !Number.isInteger(claims.exp) || claims.exp <= now) return null;
    return claims as DemoClaims;
  } catch {
    return null;
  }
}
