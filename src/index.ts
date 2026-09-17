import express, { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import authRoutes from "./routes/auth";
// import adminRoutes from "./routes/admin"; // Uncomment ONLY if ./routes/admin.ts exists

dotenv.config();

const app = express();

/* ============================================================
 *  CORS - allow bt-earn.xyz + GitHub Pages + localhost
 * ============================================================ */
const allowedOrigins = [
  "https://bt-earn.xyz",
  "https://www.bt-earn.xyz",
  "http://localhost:3000",
  "http://localhost:5173",
  "http://127.0.0.1:5500",
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      if (/^https:\/\/[a-z0-9-]+\.github\.io$/i.test(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

/* ============================================================
 *  Body parsers
 * ============================================================ */
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

/* ============================================================
 *  Routes
 * ============================================================ */
app.use("/api/auth", authRoutes);
// app.use("/api/admin", adminRoutes); // Uncomment ONLY if the file exists

/* ============================================================
 *  Health checks
 * ============================================================ */
app.get("/", (_req: Request, res: Response) => {
  res.json({
    status: "BT-Earn API is LIVE - Professional",
    version: "3.0 - BOT-TRADE-DEPLOYED",
    time: new Date(),
  });
});

app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    db:
      mongoose.connection.readyState === 1
        ? "connected"
        : "disconnected",
    time: new Date(),
  });
});

/* ============================================================
 *  404 handler
 * ============================================================ */
app.use((_req: Request, res: Response) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

/* ============================================================
 *  Global error handler
 * ============================================================ */
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error("Unhandled error:", err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal server error",
  });
});

/* ============================================================
 *  Connect to MongoDB and start server
 * ============================================================ */
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error("MONGO_URI is not set in environment variables");
  process.exit(1);
}

mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log("MongoDB Atlas Connected - Professional");
    // ============================================================
    // DEBUG LINES - Check Render logs for these messages
    // ============================================================
    console.log(">>> CONNECTED TO DATABASE:", mongoose.connection.name);
    console.log(">>> USING URI:", MONGO_URI.replace(/:([^@]+)@/, ":****@"));
    console.log(">>> SERVER VERSION: 3.0 - BOT-TRADE-DEPLOYED");
    // ============================================================
    app.listen(PORT, () => console.log(`API running on port ${PORT}`));
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  });

export default app;