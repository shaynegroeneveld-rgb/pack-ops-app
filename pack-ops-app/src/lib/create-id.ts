function bytesToUuid(bytes: Uint8Array): string {
  const normalized = Array.from(bytes.slice(0, 16));
  normalized[6] = (normalized[6]! & 0x0f) | 0x40;
  normalized[8] = (normalized[8]! & 0x3f) | 0x80;

  const hex = normalized.map((byte) => byte.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-");
}

export function createId(): string {
  if (typeof globalThis.crypto !== "undefined") {
    if (typeof globalThis.crypto.randomUUID === "function") {
      return globalThis.crypto.randomUUID();
    }

    if (typeof globalThis.crypto.getRandomValues === "function") {
      return bytesToUuid(globalThis.crypto.getRandomValues(new Uint8Array(16)));
    }
  }

  const fallbackBytes = new Uint8Array(16);
  for (let index = 0; index < fallbackBytes.length; index += 1) {
    fallbackBytes[index] = Math.floor(Math.random() * 256);
  }
  return bytesToUuid(fallbackBytes);
}
