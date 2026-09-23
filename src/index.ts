import express, { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";
import admin from "firebase-admin";
import path from "path";
import fs from "fs";
import authRoutes from "./routes/authRoutes";

dotenv.config();

const app = express();

/* ============================================================
 *  Firebase Admin Initialization (supports base64 + raw JSON)
 * ============================================================ */
let firebaseServiceAccount: any = null;
const envValue = process.env.FIREBASE_SERVICE_ACCOUNT;

if (envValue) {
  try {
    if (envValue.startsWith("base64:")) {
      const b64 = envValue.slice(7).trim();
      const decoded = Buffer.from(b64, "base64").toString("utf8");
      firebaseServiceAccount = JSON.parse(decoded);
      console.log("Firebase Admin credentials loaded from base64 env var ✅");
    } else {
      try {
        firebaseServiceAccount = JSON.parse(envValue);
        console.log("Firebase Admin credentials loaded from raw JSON env var ✅");
      } catch (e1) {
        try {
          const decoded = Buffer.from(envValue, "base64").toString("utf8");
          firebaseServiceAccount = JSON.parse(decoded);
          console.log("Firebase Admin credentials auto-decoded from base64 ✅");
        } catch (e2) {
          console.error("Could not parse FIREBASE_SERVICE_ACCOUNT env var", e1);
        }
      }
    }
  } catch (e) {
    console.error("Failed to load Firebase creds from env:", e);
  }
}

// Fallback: local file
if (!firebaseServiceAccount) {
  const serviceAccountPath = path.join(__dirname, "..", "serviceAccountKey.json");
  if (fs.existsSync(serviceAccountPath)) {
    try {
      firebaseServiceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));
      console.log("Firebase Admin credentials loaded from local file ✅");
    } catch (e) {
      console.error("Failed to load local serviceAccountKey.json:", e);
    }
  }
}

if (firebaseServiceAccount) {
  admin.initializeApp({
    credential: admin.credential.cert(firebaseServiceAccount),
  });
  console.log("Firebase Admin initialized ✅");
} else {
  console.warn("⚠️ Firebase Admin credentials not found");
}

/* ============================================================
 *  CORS
 * ============================================================ */
const allowedOrigins = [
  "https://bt-earn.xyz",
  "https://www.bt-earn.xyz",
  "https://bt-earn.vercel.app",
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
      if (/^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin)) {
  return callback(null, true);
}
      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

/* ============================================================
 *  Rate Limiting
 * ============================================================ */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: {
    success: false,
    message: "Too many requests. Please try again later.",
  },
});

const tradeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  message: {
    success: false,
    message: "Too many trade requests. Slow down.",
  },
});

app.use("/api/auth/register", authLimiter);
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/withdraw", authLimiter);
app.use("/api/auth/convert", authLimiter);
app.use("/api/auth/bot-trade", tradeLimiter);

/* ============================================================
 *  Routes
 * ============================================================ */
app.use("/api/auth", authRoutes);

/* ============================================================
 *  Health checks
 * ============================================================ */
app.get("/", (_req: Request, res: Response) => {
  res.json({
    status: "BT-Earn API is LIVE - Professional",
    version: "3.1 - PHASE-3-SECURED",
    firebase: firebaseServiceAccount ? "initialized" : "missing",
    time: new Date(),
  });
});

app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    db: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
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
    console.log(">>> CONNECTED TO DATABASE:", mongoose.connection.name);
    console.log(">>> SERVER VERSION: 3.1 - PHASE-3-SECURED");
    app.listen(PORT, () => console.log(`API running on port ${PORT}`));
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  });

export default app;
