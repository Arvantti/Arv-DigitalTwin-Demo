export const BLOB_MARKER = "__twin_d1_bytes__";

export function decodeD1Value(value: unknown): unknown {
  if (value && typeof value === "object" && !Array.isArray(value) && BLOB_MARKER in value) {
    const encoded = (value as Record<string, unknown>)[BLOB_MARKER];
    if (typeof encoded !== "string") throw new Error("D1 BLOB parameter is malformed");
    const binary = atob(encoded);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  }
  if (value === null || typeof value === "string" || typeof value === "number") return value;
  if (typeof value === "boolean") return Number(value);
  throw new Error("Unsupported D1 parameter type");
}

export function encodeD1Value(value: unknown): unknown {
  let bytes: Uint8Array | null = null;
  if (value instanceof ArrayBuffer) bytes = new Uint8Array(value);
  else if (ArrayBuffer.isView(value)) bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  // D1 results return BLOB columns as arrays of bytes; scalar SQL values cannot be arrays.
  else if (Array.isArray(value) && value.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255)) {
    bytes = Uint8Array.from(value);
  }
  if (!bytes) return value;

  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return { [BLOB_MARKER]: btoa(binary) };
}
