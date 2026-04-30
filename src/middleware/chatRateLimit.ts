import rateLimit, { ipKeyGenerator } from "express-rate-limit";

export const chatRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req as any),
});
