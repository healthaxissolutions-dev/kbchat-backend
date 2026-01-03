// src/utils/retry.js

export async function withRetry(fn, options = {}) {
  const {
    retries = 3,
    initialDelayMs = 1000,
    maxDelayMs = 8000,
    retryOn = [429, 500, 502, 503, 504],
  } = options;

  let attempt = 0;
  let delay = initialDelayMs;

  while (true) {
    try {
      return await fn();
    } catch (err) {
      attempt++;

      const status = err?.status || err?.statusCode;

      const shouldRetry =
        attempt <= retries &&
        (retryOn.includes(status) ||
          err?.code === "ETIMEDOUT" ||
          err?.name === "FetchError");

      if (!shouldRetry) {
        throw err;
      }

      console.warn(
        `🔁 Retry ${attempt}/${retries} after ${delay}ms (status=${status})`
      );

      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(delay * 2, maxDelayMs);
    }
  }
}
