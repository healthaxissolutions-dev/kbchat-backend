import { randomUUID } from "crypto";

const NONCE_TTL_MS = 10 * 60 * 1000; // 10 minutes — long enough for a user to complete login

interface NonceEntry {
  expiresAt: number;
}

class NonceService {
  private store = new Map<string, NonceEntry>();

  generate(): string {
    const nonce = randomUUID();
    this.store.set(nonce, { expiresAt: Date.now() + NONCE_TTL_MS });
    this.evictExpired();
    return nonce;
  }

  /** Validate and consume a nonce (one-time use). Returns false if missing or expired. */
  consume(nonce: string): boolean {
    const entry = this.store.get(nonce);
    if (!entry) return false;
    this.store.delete(nonce);
    return Date.now() <= entry.expiresAt;
  }

  private evictExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) this.store.delete(key);
    }
  }
}

export const nonceService = new NonceService();
