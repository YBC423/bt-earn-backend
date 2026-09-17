import { Router, Request, Response } from "express";
import User from "../models/User";

const router = Router();

/**
 * POST /api/auth/register
 */
router.post("/register", async (req: Request, res: Response) => {
  try {
    const { name, email, country, firebaseUid } = req.body || {};

    if (!name || !email || !country || !firebaseUid) {
      return res.status(400).json({
        success: false,
        message: "name, email, country and firebaseUid are required",
      });
    }

    const normalizedEmail = String(email).toLowerCase().trim();

    const existing = await User.findOne({
      $or: [{ email: normalizedEmail }, { firebaseUid }],
    });

    if (existing) {
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
 * POST /api/auth/deposit
 * Body: { firebaseUid, amount, asset, address, network }
 */
router.post("/deposit", async (req: Request, res: Response) => {
  try {
    const { firebaseUid, amount, asset, address, network } = req.body || {};
    if (!firebaseUid || !amount) {
      return res.status(400).json({
        success: false,
        message: "firebaseUid and amount are required",
      });
    }

    const user = await User.findOne({ firebaseUid });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const deposit = {
      id: Date.now(),
      amount: Number(amount),
      asset: asset || "USDT",
      address: address || "N/A",
      network: network || "TRC20",
      status: "Pending",
      dateTime: new Date().toLocaleString(),
      txId: "DEP-" + Date.now(),
    };

    await User.updateOne(
      { firebaseUid },
      { $push: { deposits: deposit } }
    );

    return res.json({
      success: true,
      message: "Deposit intent recorded",
      deposit,
    });
  } catch (err: any) {
    console.error("Deposit error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error during deposit",
    });
  }
});

/**
 * POST /api/auth/withdraw
 * Body: { firebaseUid, amount, asset, address, network, txId, fee }
 */
router.post("/withdraw", async (req: Request, res: Response) => {
  try {
    const { firebaseUid, amount, asset, address, network, txId, fee } = req.body || {};
    if (!firebaseUid || !amount) {
      return res.status(400).json({
        success: false,
        message: "firebaseUid and amount are required",
      });
    }

    const user = await User.findOne({ firebaseUid });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const withdrawal = {
      id: Date.now(),
      amount: Number(amount),
      asset: asset || "USDT",
      address: address || "N/A",
      network: network || "TRC20",
      txId: txId || "WDR-" + Date.now(),
      fee: Number(fee) || 0.2,
      status: "Pending",
      dateTime: new Date().toLocaleString(),
    };

    await User.updateOne(
      { firebaseUid },
      {
        $push: { withdrawals: withdrawal },
        $inc: { "wallets.usdt": -Number(amount), balance: -Number(amount) },
      }
    );

    return res.json({
      success: true,
      message: "Withdrawal request recorded",
      withdrawal,
    });
  } catch (err: any) {
    console.error("Withdraw error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error during withdrawal",
    });
  }
});

/**
 * POST /api/auth/bot-trade
 * Body: { firebaseUid, botName, asset, profit, timestamp }
 * This is NEW - records bot profits to MongoDB and updates balance
 */
router.post("/bot-trade", async (req: Request, res: Response) => {
  try {
    const { firebaseUid, botName, asset, profit, timestamp } = req.body || {};
    if (!firebaseUid || profit === undefined) {
      return res.status(400).json({
        success: false,
        message: "firebaseUid and profit are required",
      });
    }

    const user = await User.findOne({ firebaseUid });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const trade = {
      id: Date.now(),
      botName: botName || "Unknown Bot",
      asset: asset || "USDT",
      profit: Number(profit),
      timestamp: timestamp || new Date().toISOString(),
    };

    // Update balance & wallets with profit (can be negative for loss)
    const updatedUser = await User.findOneAndUpdate(
      { firebaseUid },
      {
        $push: { trades: trade },
        $inc: {
          "wallets.usdt": Number(profit),
          balance: Number(profit),
          totalProfit: Number(profit),
        },
      },
      { new: true }
    );

    return res.json({
      success: true,
      message: "Bot trade recorded",
      trade,
      newBalance: updatedUser?.wallets?.usdt || 0,
    });
  } catch (err: any) {
    console.error("Bot trade error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error during bot trade",
    });
  }
});

/**
 * GET /api/auth/test
 */
router.get("/test", (_req: Request, res: Response) => {
  res.json({ message: "Auth route working!" });
});

export default router;