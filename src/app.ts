import fs from "fs";
import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import helmet from "helmet";
import morgan from "morgan";
import authRoutes from "./routes/authRoutes";
import videoRoutes from "./routes/videoRoutes";
import adminRoutes from "./routes/adminRoutes";
import env from "./config/env";
import { getErrorMessage } from "./utils/errors";

fs.mkdirSync(env.uploadDir, { recursive: true });

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(morgan("dev"));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});
app.use("/api/auth", authRoutes);
app.use("/api/videos", videoRoutes);
app.use("/api/admin", adminRoutes);

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const status = typeof error?.status === "number" ? error.status : 500;
  res.status(status).json({ message: getErrorMessage(error) });
};

app.use(errorHandler);

export default app;
