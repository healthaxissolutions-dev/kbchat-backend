// src/middleware/chatRateLimit.js

import rateLimit from "express-rate-limit";

export const chatRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 requests per minute
  standardHeaders: true,
  legacyHeaders: false,

  keyGenerator: (req) => {
    return req.body?.username || req.ip;
  },

  handler: (req, res) => {
    res.status(429).json({
      error: "Too many requests",
      detail: "Please wait a moment before sending another question.",
    });
  },
});
