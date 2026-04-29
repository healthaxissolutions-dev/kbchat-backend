import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import morgan from "morgan";

import chatRagRoute from "./src/routes/chatRag.js";
import adminServicesRoute from "./src/routes/admin/services.js";
import adminDocumentsRoute from "./src/routes/admin/documents.js";
import adminSystemPromptRoute from "./src/routes/admin/systemPrompt.js";
import documentsRoute from "./src/routes/documents.js";

// Auth module: TypeScript source in dev, compiled output in prod
const isProd = process.env.NODE_ENV === "production";

const authRoutes = isProd
  ? (await import("./dist/auth/routes.js")).default
  : (await import("./src/auth/routes.ts")).default;

const { authenticate } = isProd
  ? await import("./dist/auth/middleware/authenticate.js")
  : await import("./src/auth/middleware/authenticate.ts");

const { authorize } = isProd
  ? await import("./dist/auth/middleware/authorize.js")
  : await import("./src/auth/middleware/authorize.ts");

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

// Auth routes (must be before protected routes)
app.use("/api/auth", authRoutes);

// Public routes
app.use("/api/chat", chatRagRoute);
app.use("/api/documents", documentsRoute);

// Admin routes — require authentication and the "admin" role
app.use("/api/admin/services", authenticate, authorize(["admin"]), adminServicesRoute);
app.use("/api/admin/documents", authenticate, authorize(["admin"]), adminDocumentsRoute);
app.use("/api/admin/system-prompt", authenticate, authorize(["admin"]), adminSystemPromptRoute);

// Test/debug routes — development only
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

// Global error handler
app.use((err, req, res, next) => {
  console.error("❌ [Global Error]:", err.stack);
  res.status(err.status || 500).json({
    error: err.name || "InternalServerError",
    message: err.message,
    ...(process.env.NODE_ENV !== "production" && { stack: err.stack }),
  });
});
