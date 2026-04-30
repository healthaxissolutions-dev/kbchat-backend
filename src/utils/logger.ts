import pino from "pino";
import { config } from "../config.js";

const isProd = config.server.env === "production";

export const logger = isProd
  ? pino({ level: "info" })
  : pino({
      level: "debug",
      transport: { target: "pino-pretty", options: { colorize: true } },
    });
