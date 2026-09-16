import { Router, Request, Response } from "express";
import User from "../models/User";

const router = Router();

/**
 * POST /api/auth/register
 * Body: { name, email, country, firebaseUid }
 * Called by signup.html right after createUserWithEmailAndPassword().
 */
router.post("/register", async (req: Request, res: Response) => {
  try {
    const { name, email, country, firebaseUid } = req.body || {};

    // ===== Validation =====
    if (!name || !email || !country || !firebaseUid) {
      return res.status(400).json({
        success: false,
        message: "name, email, country and firebaseUid are required",
      });
    }

    const normalizedEmail = String(email).toLowerCase().trim();

    // ===== Already registered? =====
    const existing = await User.findOne({
      $or: [{ email: normalizedEmail }, { firebaseUid }],
    });

    if (existing) {
      // If it's the same Firebase user retrying, treat as idempotent
      if (existing.firebaseUid === firebaseUid) {
        return res.status(200).json({
          success: true,
          message: "User already registered",
          user: existing,
        });
      }
      return res.status(409).json({
        success: false,
        message: "A user with this email or Firebase UID already exists",
      });
    }

    // ===== Create user =====
    const user = await User.create({
      name: String(name).trim(),
      email: normalizedEmail,
      country: String(country).trim(),
      firebaseUid,
      balance: 0,
      wallets: { usdt: 0, btc: 0, eth: 0, ngn: 0 },
      deposits: [],
      withdrawals: [],
      trades: [],
      tradeBots: [],
      loginHistory: [],
      lastLogin: new Date(),
      totalProfit: 0,
      status: "active",
    });

    return res.status(201).json({
      success: true,
      message: "User registered successfully",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        country: user.country,
        firebaseUid: user.firebaseUid,
        balance: user.balance,
        wallets: user.wallets,
        deposits: user.deposits,
        withdrawals: user.withdrawals,
        tradeBots: user.tradeBots,
        lastLogin: user.lastLogin,
        createdAt: user.createdAt,
      },
    });
  } catch (err: any) {
    console.error("Register error:", err);
    // Duplicate key (unique email/firebaseUid index)
    if (err?.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "User already exists",
      });
    }
    return res.status(500).json({
      success: false,
      message: "Server error during registration",
    });
  }
});

/**
 * POST /api/auth/login
 * Body: { firebaseUid }
 * Called after Firebase signInWithEmailAndPassword() succeeds.
 * Updates lastLogin and returns the MongoDB user document.
 */
router.post("/login", async (req: Request, res: Response) => {
  try {
    const { firebaseUid } = req.body || {};
    if (!firebaseUid) {
      return res.status(400).json({
        success: false,
        message: "firebaseUid is required",
      });
    }

    const user = await User.findOneAndUpdate(
      { firebaseUid },
      {
        $set: { lastLogin: new Date() },
        $push: { loginHistory: { date: new Date() } },
      },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found in database",
      });
    }

    return res.json({ success: true, user });
  } catch (err: any) {
    console.error("Login error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error during login",
    });
  }
});

/**
 * GET /api/auth/me?firebaseUid=...
 * Fetch the current user's data from MongoDB.
 * Use this from the frontend to poll balance / deposits / withdrawals.
 */
router.get("/me", async (req: Request, res: Response) => {
  try {
    const firebaseUid = String(req.query.firebaseUid || "");
    if (!firebaseUid) {
      return res.status(400).json({
        success: false,
        message: "firebaseUid query param is required",
      });
    }

    const user = await User.findOne({ firebaseUid });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.json({ success: true, user });
  } catch (err: any) {
    console.error("Me error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

/**
 * GET /api/auth/test
 * Simple health check for the auth router.
 */
router.get("/test", (_req: Request, res: Response) => {
  res.json({ message: "Auth route working!" });
});

export default router;