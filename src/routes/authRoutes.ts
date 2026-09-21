import { Router, Request, Response } from "express";
import User from "../models/User";
import { verifyFirebaseToken } from "../middlewares/authMiddleware";
import { runBtcBot } from "../services/btcBot";

const router = Router();

/* ============================================================
 *  BOT PROFIT CALCULATION (server-side, trusted)
 *  Used only for ETH bot until MT5 is wired.
 * ============================================================ */
function calculateProfitLowRisk(amount: number) {
  const isWin = Math.random() * 100 <= 60;
  if (isWin) {
    const profitPercent = 0.1 + Math.random() * 0.3;
    let profit = amount * (profitPercent / 100);
    if (profit < 0.03 && amount >= 10) profit = 0.03;
    return { profit, isWin: true, percent: profitPercent };
  } else {
    const lossPercent = 0.05 + Math.random() * 0.15;
    let loss = amount * (lossPercent / 100);
    if (loss < 0.02 && amount >= 10) loss = 0.02;
    return { profit: -loss, isWin: false, percent: lossPercent };
  }
}

function calculateProfitMediumRisk(amount: number) {
  const mode = Math.random() * 100 <= 60 ? "highProfit" : "highLoss";
  let isWin: boolean;
  let profitPercent: number;
  let lossPercent: number;

  if (mode === "highProfit") {
    isWin = Math.random() * 100 <= 60;
    profitPercent = 0.3 + Math.random() * 0.9;
    lossPercent = 0.15 + Math.random() * 0.45;
  } else {
    isWin = Math.random() * 100 <= 40;
    profitPercent = 0.15 + Math.random() * 0.45;
    lossPercent = 0.3 + Math.random() * 0.9;
  }

  if (isWin) {
    let profit = amount * (profitPercent / 100);
    if (profit < 0.1 && amount >= 10) profit = 0.1;
    return { profit, isWin: true, percent: profitPercent };
  } else {
    let loss = amount * (lossPercent / 100);
    if (loss < 0.08 && amount >= 10) loss = 0.08;
    return { profit: -loss, isWin: false, percent: lossPercent };
  }
}

/* ============================================================
 *  AUTH ROUTES
 * ============================================================ */

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
      user,
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

router.get("/me", verifyFirebaseToken, async (req: Request, res: Response) => {
  try {
    const firebaseUid = req.verifiedFirebaseUid!;
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

router.post("/deposit", verifyFirebaseToken, async (req: Request, res: Response) => {
  try {
    const firebaseUid = req.verifiedFirebaseUid!;
    const { amount, asset, address, network } = req.body || {};
    if (!amount) {
      return res.status(400).json({ success: false, message: "amount is required" });
    }

    const user = await User.findOne({ firebaseUid });
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
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

    await User.updateOne({ firebaseUid }, { $push: { deposits: deposit } });

    return res.json({ success: true, message: "Deposit intent recorded", deposit });
  } catch (err: any) {
    console.error("Deposit error:", err);
    return res.status(500).json({ success: false, message: "Server error during deposit" });
  }
});

router.post("/withdraw", verifyFirebaseToken, async (req: Request, res: Response) => {
  try {
    const firebaseUid = req.verifiedFirebaseUid!;
    const { amount, asset, address, network, txId, fee } = req.body || {};
    if (!amount) {
      return res.status(400).json({ success: false, message: "amount is required" });
    }

    const user = await User.findOne({ firebaseUid });
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
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

    return res.json({ success: true, message: "Withdrawal request recorded", withdrawal });
  } catch (err: any) {
    console.error("Withdraw error:", err);
    return res.status(500).json({ success: false, message: "Server error during withdrawal" });
  }
});

/* ============================================================
 *  BOT RUN — BTC uses REAL Binance testnet. ETH still simulated.
 *  Body: { botName, asset, amountPerTrade }
 * ============================================================ */
router.post("/bot-run", verifyFirebaseToken, async (req: Request, res: Response) => {
  try {
    const firebaseUid = req.verifiedFirebaseUid!;
    const { botName, asset, amountPerTrade } = req.body || {};

    if (!botName || !amountPerTrade) {
      return res.status(400).json({
        success: false,
        message: "botName and amountPerTrade are required",
      });
    }

    const amt = Number(amountPerTrade);
    if (isNaN(amt) || amt <= 0) {
      return res.status(400).json({ success: false, message: "Invalid amountPerTrade" });
    }

    const user = await User.findOne({ firebaseUid });
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if ((user.wallets.usdt || 0) < amt) {
      return res.status(400).json({
        success: false,
        message: "Insufficient balance to run bot trade",
        newBalance: user.wallets.usdt || 0,
      });
    }

    /* ---------- BTC BOT → REAL BINANCE TESTNET ---------- */
    if (botName === "Bitcoin Accumulation") {
      const currentlyHolding = (user.wallets.btc || 0) > 0;

      const result = await runBtcBot(amt, currentlyHolding);

      // No actionable signal → log a HOLD trade, no balance change
      if (!result.executed) {
        const trade = {
          id: Date.now(),
          botName,
          asset: asset || "BTC",
          profit: 0,
          side: null,
          price: result.decision.price,
          signal: result.decision.signal,
          reason: result.decision.reason,
          timestamp: new Date().toISOString(),
          exchange: "binance-testnet",
        };

        await User.updateOne({ firebaseUid }, { $push: { trades: trade } });

        return res.json({
          success: true,
          message: "No actionable signal — HOLD",
          trade,
          isWin: false,
          percent: 0,
          newBalance: user.wallets.usdt || 0,
          holding: currentlyHolding,
          signal: result.decision.signal,
          reason: result.decision.reason,
        });
      }

      // Real order was placed on Binance testnet
      const order = result.order;
      const filledPrice = parseFloat(
        order.fills?.[0]?.price || result.decision.price.toString()
      );
      const executedQty = parseFloat(order.executedQty || "0");
      const quoteQty = parseFloat(order.cummulativeQuoteQty || "0");

      let profit = 0;
      const side: "BUY" | "SELL" = result.side!;

      if (side === "BUY") {
        await User.updateOne(
          { firebaseUid },
          {
            $inc: {
              "wallets.usdt": -quoteQty,
              "wallets.btc": executedQty,
              balance: -quoteQty,
            },
            $push: {
              trades: {
                id: Date.now(),
                botName,
                asset: asset || "BTC",
                profit: 0,
                side: "BUY",
                price: filledPrice,
                quantity: executedQty,
                quoteQty,
                orderId: order.orderId,
                signal: result.decision.signal,
                reason: result.decision.reason,
                timestamp: new Date().toISOString(),
                exchange: "binance-testnet",
              },
            },
          }
        );
      } else {
        const avgCost = (user as any).avgBtcCost || filledPrice;
        profit = (filledPrice - avgCost) * executedQty;

        await User.updateOne(
          { firebaseUid },
          {
            $inc: {
              "wallets.usdt": quoteQty,
              "wallets.btc": -executedQty,
              balance: quoteQty,
              totalProfit: profit,
            },
            $push: {
              trades: {
                id: Date.now(),
                botName,
                asset: asset || "BTC",
                profit: Number(profit.toFixed(4)),
                side: "SELL",
                price: filledPrice,
                quantity: executedQty,
                quoteQty,
                orderId: order.orderId,
                signal: result.decision.signal,
                reason: result.decision.reason,
                timestamp: new Date().toISOString(),
                exchange: "binance-testnet",
              },
            },
          }
        );
      }

      const updatedUser = await User.findOne({ firebaseUid });

      return res.json({
        success: true,
        message: `${side} order executed on Binance testnet`,
        trade: {
          side,
          price: filledPrice,
          quantity: executedQty,
          profit: Number(profit.toFixed(4)),
          orderId: order.orderId,
        },
        isWin: profit >= 0,
        percent:
          quoteQty > 0
            ? Number(((profit / quoteQty) * 100).toFixed(4))
            : 0,
        newBalance: updatedUser?.wallets?.usdt || 0,
        holding: (updatedUser?.wallets?.btc || 0) > 0,
        signal: result.decision.signal,
        reason: result.decision.reason,
      });
    }

    /* ---------- ETH BOT → still simulated (until MT5) ---------- */
    const isMediumRisk = botName === "ETH DCA Pro";
    const fakeResult = isMediumRisk
      ? calculateProfitMediumRisk(amt)
      : calculateProfitLowRisk(amt);

    const trade = {
      id: Date.now(),
      botName: botName || "Unknown Bot",
      asset: asset || "USDT",
      profit: Number(fakeResult.profit.toFixed(4)),
      timestamp: new Date().toISOString(),
      exchange: "simulated",
    };

    const updatedUser = await User.findOneAndUpdate(
      { firebaseUid },
      {
        $push: { trades: trade },
        $inc: {
          "wallets.usdt": trade.profit,
          balance: trade.profit,
          totalProfit: trade.profit,
        },
      },
      { new: true }
    );

    return res.json({
      success: true,
      message: "Bot run recorded (simulated — ETH pending MT5)",
      trade,
      isWin: fakeResult.isWin,
      percent: Number(fakeResult.percent.toFixed(4)),
      newBalance: updatedUser?.wallets?.usdt || 0,
    });
  } catch (err: any) {
    console.error("Bot run error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Server error during bot run",
    });
  }
});

router.get("/test", (_req: Request, res: Response) => {
  res.json({ message: "Auth route working!" });
});

export default router;