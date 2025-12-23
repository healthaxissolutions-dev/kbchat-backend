import express from "express";
import cors from "cors";

import chatRoute from "./src/routes/chat.js";
import servicesRoute from "./src/routes/services.js";
import testBackendRoute from "./src/routes/test/testBackend.js";
import testDBRoute from "./src/routes/test/testDB.js";

import { config } from "./src/config.js";
import { validateStorageConfig } from "./src/utils/validateEnv.js";

validateStorageConfig(config);

const app = express();
app.use(cors());
app.use(express.json());

// Routes
app.use("/api/chat", chatRoute);
app.use("/api/services", servicesRoute);
app.use("/api/test-backend", testBackendRoute);
app.use("/api/test-db", testDBRoute);

// Server port comes from config.js now
const PORT = config.server.port;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
