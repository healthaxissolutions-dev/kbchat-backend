import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import compression from "compression";
import cookieParser from "cookie-parser";
import morgan from "morgan";

import chatRagRoute from "./src/routes/chatRag.js";
import adminServicesRoute from "./src/routes/admin/services.js";
import adminDocumentsRoute from "./src/routes/admin/documents.js";
import adminSystemPromptRoute from "./src/routes/admin/systemPrompt.js";
import documentsRoute from "./src/routes/documents.js";
import authRoutes from "./src/auth/routes.js";
import { authenticate } from "./src/auth/middleware/authenticate.js";
import { authorize } from "./src/auth/middleware/authorize.js";
import { config } from "./src/config.js";
import { validateStorageConfig } from "./src/utils/validateEnv.js";

validateStorageConfig(config);

const app = express();
app.set("trust proxy", 1);

const corsOptions = {
  origin: process.env.FRONTEND_URL || "http://localhost:3000",
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 200,
};

app.use(morgan("dev"));
app.use(cors(corsOptions));
app.use(cookieParser());
app.use(express.json());

app.use(
  compression({
    filter: (req: Request, res: Response) => {
      if (req.path.startsWith("/api/chat")) return false;
      return compression.filter(req, res);
    },
  })
);

app.use("/api/auth", authRoutes);
app.use("/api/chat", chatRagRoute);
app.use("/api/documents", documentsRoute);

app.use("/api/admin/services", authenticate, authorize(["admin"]), adminServicesRoute);
app.use("/api/admin/documents", authenticate, authorize(["admin"]), adminDocumentsRoute);
app.use("/api/admin/system-prompt", authenticate, authorize(["admin"]), adminSystemPromptRoute);

if (config.server.env !== "production") {
  const { default: testBackendRoute } = await import("./src/routes/test/testBackend.js");
  const { default: testDBRoute } = await import("./src/routes/test/testDB.js");
  app.use("/api/test-backend", testBackendRoute);
  app.use("/api/test-db", testDBRoute);
}

const PORT = config.server.port;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
  console.error("❌ [Global Error]:", err.stack);
  res.status(err.status || 500).json({
    error: err.name || "InternalServerError",
    message: err.message,
    ...(process.env.NODE_ENV !== "production" && { stack: err.stack }),
  });
});
