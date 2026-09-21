import { Router, Request, Response } from "express";
import User from "../models/User";
import { verifyFirebaseToken } from "../middlewares/authMiddleware";
import fetch from "node-fetch";

const router = Router();

/* ============================================================
 *  BOT PROFIT CALCULATION (server-side, trusted)
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
 *  BOT RUN — Server-side simulated profit
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

    const isMediumRisk = botName === "ETH DCA Pro";
    const result = isMediumRisk
      ? calculateProfitMediumRisk(amt)
      : calculateProfitLowRisk(amt);

    const trade = {
      id: Date.now(),
      botName: botName || "Unknown Bot",
      asset: asset || "USDT",
      profit: Number(result.profit.toFixed(4)),
      timestamp: new Date().toISOString(),
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
      message: "Bot run recorded",
      trade,
      isWin: result.isWin,
      percent: Number(result.percent.toFixed(4)),
      newBalance: updatedUser?.wallets?.usdt || 0,
    });
  } catch (err: any) {
    console.error("Bot run error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error during bot run",
    });
  }
});

/* ============================================================
 *  PUBLIC MARKET DATA — charts + order book
 *  No auth. Binance first, CoinGecko fallback.
 * ============================================================ */

const chartCache: Record<string, { data: any; time: number }> = {};
const CACHE_TTL = 30000; // 30s

router.get("/chart/:symbol", async (req: Request, res: Response) => {
  try {
    const { symbol } = req.params;
    const interval = (req.query.interval as string) || "1m";
    const limit = parseInt(req.query.limit as string) || 50;

    const cacheKey = `${symbol}-${interval}-${limit}`;
    const cached = chartCache[cacheKey];
    if (cached && Date.now() - cached.time < CACHE_TTL) {
      return res.json({ success: true, source: "cache", candles: cached.data });
    }

    // Try Binance first
    try {
      const binanceUrl = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
      const binanceRes = await fetch(binanceUrl);
      if (binanceRes.ok) {
        const raw: any = await binanceRes.json();
        const candles = raw.map((k: any[]) => ({
          time: k[0],
          open: parseFloat(k[1]),
          high: parseFloat(k[2]),
          low: parseFloat(k[3]),
          close: parseFloat(k[4]),
        }));
        chartCache[cacheKey] = { data: candles, time: Date.now() };
        return res.json({ success: true, source: "binance", candles });
      }
    } catch (e) {
      console.log("Binance chart failed, falling back to CoinGecko");
    }

    // Fallback: CoinGecko
    const coinMap: Record<string, string> = {
      BTCUSDT: "bitcoin",
      ETHUSDT: "ethereum",
      BNBUSDT: "binancecoin",
      SOLUSDT: "solana",
      XRPUSDT: "ripple",
      DOGEUSDT: "dogecoin",
      ADAUSDT: "cardano",
    };
    const coinId = coinMap[symbol] || "bitcoin";
    const days = interval === "1D" ? 30 : interval === "1h" ? 7 : 1;
    const cgUrl = `https://api.coingecko.com/api/v3/coins/${coinId}/ohlc?vs_currency=usd&days=${days}`;
    const cgRes = await fetch(cgUrl);
    const cgRaw: any = await cgRes.json();
    const candles = (cgRaw || []).map((k: any[]) => ({
      time: k[0],
      open: k[1],
      high: k[2],
      low: k[3],
      close: k[4],
    }));
    chartCache[cacheKey] = { data: candles, time: Date.now() };
    return res.json({ success: true, source: "coingecko", candles });
  } catch (err: any) {
    console.error("Chart error:", err);
    return res.status(500).json({ success: false, message: "Chart fetch failed" });
  }
});

router.get("/orderbook/:symbol", async (req: Request, res: Response) => {
  try {
    const { symbol } = req.params;

    // Try Binance public depth
    try {
      const binanceUrl = `https://api.binance.com/api/v3/depth?symbol=${symbol}&limit=10`;
      const binanceRes = await fetch(binanceUrl);
      if (binanceRes.ok) {
        const data: any = await binanceRes.json();
        const bids = (data.bids || []).map((b: string[]) => ({
          price: parseFloat(b[0]),
          qty: parseFloat(b[1]),
        }));
        const asks = (data.asks || []).map((a: string[]) => ({
          price: parseFloat(a[0]),
          qty: parseFloat(a[1]),
        }));
        return res.json({ success: true, source: "binance", bids, asks });
      }
    } catch (e) {
      console.log("Binance orderbook failed");
    }

    // Fallback: synthetic around current price
    const priceRes = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd"
    );
    const priceData: any = await priceRes.json();
    const price = priceData.bitcoin?.usd || 85000;
    const bids: any[] = [];
    const asks: any[] = [];
    for (let i = 0; i < 10; i++) {
      bids.push({
        price: price * (1 - (i + 1) * 0.0002),
        qty: Math.random() * 2,
      });
      asks.push({
        price: price * (1 + (i + 1) * 0.0002),
        qty: Math.random() * 2,
      });
    }
    return res.json({ success: true, source: "synthetic", bids, asks });
  } catch (err: any) {
    console.error("Orderbook error:", err);
    return res.status(500).json({ success: false, message: "Orderbook fetch failed" });
  }
});

router.get("/test", (_req: Request, res: Response) => {
  res.json({ message: "Auth route working!" });
});

export default router;
