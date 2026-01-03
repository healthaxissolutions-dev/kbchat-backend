// src/middleware/chatRateLimit.js

import rateLimit, { ipKeyGenerator } from "express-rate-limit";

export const chatRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,

  // ✅ FIX: IPv4 + IPv6 safe
  keyGenerator: (req) => ipKeyGenerator(req)
});
