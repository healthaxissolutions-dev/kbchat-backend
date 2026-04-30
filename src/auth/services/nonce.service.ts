import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { authConfig } from "../config.js";

const NONCE_TTL_MS = 10 * 60 * 1000;

class NonceService {
  generate(): string {
    const id = randomBytes(16).toString("hex");
    const exp = (Date.now() + NONCE_TTL_MS).toString(36);
    const payload = `${id}.${exp}`;
    const sig = this.sign(payload);
    return Buffer.from(`${payload}.${sig}`).toString("base64url");
  }

  /** Validate and consume a state token (stateless — no store). */
  consume(state: string): boolean {
    try {
      const decoded = Buffer.from(state, "base64url").toString();
      const lastDot = decoded.lastIndexOf(".");
      if (lastDot === -1) return false;

      const payload = decoded.slice(0, lastDot);
      const sig = decoded.slice(lastDot + 1);
      const expected = this.sign(payload);

      const sigBuf = Buffer.from(sig, "hex");
      const expBuf = Buffer.from(expected, "hex");
      if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) return false;

      const dotIdx = payload.indexOf(".");
      const expStr = payload.slice(dotIdx + 1);
      return Date.now() <= parseInt(expStr, 36);
    } catch {
      return false;
    }
  }

  private sign(payload: string): string {
    return createHmac("sha256", authConfig.jwt.secret).update(payload).digest("hex");
  }
}

export const nonceService = new NonceService();
