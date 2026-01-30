import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import morgan from "morgan";

import chatRoute from "./src/routes/chat.js";
import adminServicesRoute from "./src/routes/admin/services.js";
import adminDocumentsRoute from "./src/routes/admin/documents.js";
import testBackendRoute from "./src/routes/test/testBackend.js";
import testDBRoute from "./src/routes/test/testDB.js";

// Import auth routes (src in dev, dist in prod)
const authRoutes = process.env.NODE_ENV === "production"
  ? (await import("./dist/auth/routes.js")).default
  : (await import("./src/auth/routes.ts")).default;

import { config } from "./src/config.js";
import { validateStorageConfig } from "./src/utils/validateEnv.js";

validateStorageConfig(config);

const app = express();
app.set("trust proxy", 1);

// CORS configuration that supports credentials
const corsOptions = {
  origin: process.env.FRONTEND_URL || "http://localhost:3000",
  credentials: true, // Allow cookies to be sent/received
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 200,
};

app.use(morgan("dev"));
app.use(cors(corsOptions));
app.use(cookieParser());
app.use(express.json());

// Authentication Routes (must be before protected routes)
app.use("/api/auth", authRoutes);

// Application Routes
app.use("/api/chat", chatRoute);
app.use("/api/admin/services", adminServicesRoute);
app.use("/api/admin/documents", adminDocumentsRoute);
app.use("/api/test-backend", testBackendRoute);
app.use("/api/test-db", testDBRoute);

// Server port comes from config.js now
const PORT = config.server.port;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error("❌ [Global Error]:", err.stack);
  res.status(err.status || 500).json({
    error: err.name || "InternalServerError",
    message: err.message,
    ...(process.env.NODE_ENV !== "production" && { stack: err.stack }),
  });
});
