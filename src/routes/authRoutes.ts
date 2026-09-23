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
 *  YAHOO TICKER MAP
 *  Most coins use "SYMBOL-USD". Some need custom tickers.
 * ============================================================ */
const YAHOO_TICKER_MAP: Record<string, string> = {
  BTC: "BTC-USD", ETH: "ETH-USD", BNB: "BNB-USD", SOL: "SOL-USD",
  XRP: "XRP-USD", DOGE: "DOGE-USD", ADA: "ADA-USD", AVAX: "AVAX-USD",
  DOT: "DOT-USD", TRX: "TRX-USD", LINK: "LINK-USD", MATIC: "MATIC-USD",
  SHIB: "SHIB-USD", LTC: "LTC-USD", BCH: "BCH-USD", NEAR: "NEAR-USD",
  ATOM: "ATOM-USD", ALGO: "ALGO-USD", VET: "VET-USD", FIL: "FIL-USD",
  ICP: "ICP-USD", APT: "APT-USD", ARB: "ARB-USD", OP: "OP-USD",
  SUI: "SUI-USD", STX: "STX-USD", MKR: "MKR-USD", AAVE: "AAVE-USD",
  UNI: "UNI-USD", CRV: "CRV-USD", SNX: "SNX-USD", COMP: "COMP-USD",
  LDO: "LDO-USD", GRT: "GRT-USD", SAND: "SAND-USD", MANA: "MANA-USD",
  GALA: "GALA-USD", AXS: "AXS-USD", ENJ: "ENJ-USD", CHZ: "CHZ-USD",
  KAVA: "KAVA-USD", ZEC: "ZEC-USD", DASH: "DASH-USD", XTZ: "XTZ-USD",
  EOS: "EOS-USD", NEO: "NEO-USD", IOTA: "IOTA-USD", XMR: "XMR-USD",
  ETC: "ETC-USD", FLOW: "FLOW-USD", HBAR: "HBAR-USD", KAS: "KAS-USD",
  SEI: "SEI-USD", TIA: "TIA-USD", INJ: "INJ-USD", RUNE: "RUNE-USD",
  QNT: "QNT-USD", FTM: "FTM-USD", IMX: "IMX-USD", EGLD: "EGLD-USD",
  MINA: "MINA-USD", ZIL: "ZIL-USD", HOT: "HOT-USD", BAT: "BAT-USD",
  ZRX: "ZRX-USD", KNC: "KNC-USD", BAL: "BAL-USD", YFI: "YFI-USD",
  "1INCH": "1INCH-USD", CELO: "CELO-USD", ANKR: "ANKR-USD", SKL: "SKL-USD",
  COTI: "COTI-USD", FET: "FET-USD", OCEAN: "OCEAN-USD", CFX: "CFX-USD",
  NEXO: "NEXO-USD", CRO: "CRO-USD", OKB: "OKB-USD", LEO: "LEO-USD",
  CAKE: "CAKE-USD", DAI: "DAI-USD", TUSD: "TUSD-USD", LUNC: "LUNC-USD",
  LUNA: "LUNA-USD", AMP: "AMP-USD", RVN: "RVN-USD", SC: "SC-USD",
  XLM: "XLM-USD", XDC: "XDC-USD", DCR: "DCR-USD", WAVES: "WAVES-USD",
  ONT: "ONT-USD", IOST: "IOST-USD", WAXP: "WAXP-USD", KDA: "KDA-USD",
  AR: "AR-USD", STORJ: "STORJ-USD", DYDX: "DYDX-USD", GMX: "GMX-USD",
  WOO: "WOO-USD", RPL: "RPL-USD", FXS: "FXS-USD", CVX: "CVX-USD",
  ENS: "ENS-USD", MASK: "MASK-USD", LRC: "LRC-USD", RNDR: "RNDR-USD",
  PEPE: "PEPE24478-USD", TON: "TON11419-USD",
  WIF: "WIF-USD", BONK: "BONK-USD", FLOKI: "FLOKI-USD",
};

function getYahooTicker(baseSymbol: string): string {
  const upper = baseSymbol.toUpperCase();
  if (YAHOO_TICKER_MAP[upper]) return YAHOO_TICKER_MAP[upper];
  return `${upper}-USD`;
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
      converts: [],
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
 *  CONVERT — swap one coin to another using live Yahoo price
 *  Fee: $0.05 flat. Min: $3.
 * ============================================================ */
router.post("/convert", verifyFirebaseToken, async (req: Request, res: Response) => {
  try {
    const firebaseUid = req.verifiedFirebaseUid!;
    const { fromSymbol, toSymbol, usdAmount } = req.body || {};

    if (!fromSymbol || !toSymbol || !usdAmount) {
      return res.status(400).json({
        success: false,
        message: "fromSymbol, toSymbol, and usdAmount are required",
      });
    }

    const from = String(fromSymbol).toUpperCase().trim();
    const to = String(toSymbol).toUpperCase().trim();
    const amt = Number(usdAmount);

    if (from === to) {
      return res.status(400).json({
        success: false,
        message: "From and To must be different",
      });
    }

    if (isNaN(amt) || amt < 3) {
      return res.status(400).json({
        success: false,
        message: "Minimum convert is $1",
      });
    }

    const user = await User.findOne({ firebaseUid });
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const FEE = 0.05;

    async function fetchYahooPrice(sym: string): Promise<number> {
      if (sym === "USDT") return 1;
      const ticker = getYahooTicker(sym);
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1m&range=1d`;
      const r = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; BT-EARN/1.0)" },
      });
      if (!r.ok) return 0;
      const data: any = await r.json();
      const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
      return Number(price) || 0;
    }

    const fromPrice = await fetchYahooPrice(from);
    const toPrice = await fetchYahooPrice(to);

    if (!fromPrice || !toPrice) {
      return res.status(400).json({
        success: false,
        message: `Price unavailable for ${!fromPrice ? from : to}`,
      });
    }

    const wallets: any = user.wallets || {};
    const fromKey = from === "USDT" ? "usdt" : from.toLowerCase();
    const toKey = to === "USDT" ? "usdt" : to.toLowerCase();

    const fromBalance = Number(wallets[fromKey] || 0);
    const fromAmount = amt / fromPrice;

    if (fromBalance < fromAmount) {
      return res.status(400).json({
        success: false,
        message: `Insufficient ${from} balance. You have ${fromBalance} ${from}.`,
      });
    }

    const usableUsd = amt - FEE;
    const toAmount = usableUsd / toPrice;

    wallets[fromKey] = fromBalance - fromAmount;
    wallets[toKey] = Number(wallets[toKey] || 0) + toAmount;

    const convert = {
      id: Date.now(),
      fromSymbol: from,
      toSymbol: to,
      fromAmount: Number(fromAmount.toFixed(8)),
      toAmount: Number(toAmount.toFixed(8)),
      usdValue: Number(amt.toFixed(2)),
      fee: FEE,
      dateTime: new Date().toLocaleString(),
    };

    user.wallets = wallets;
    user.markModified("wallets");
    if (!user.converts) user.converts = [];
    user.converts.push(convert);
    await user.save();

    return res.json({
      success: true,
      message: "Convert successful",
      convert,
      wallets: user.wallets,
    });
  } catch (err: any) {
    console.error("Convert error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error during convert",
    });
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
 *  PUBLIC MARKET DATA — charts + order book + batch prices
 * ============================================================ */

const chartCache: Record<string, { data: any; time: number }> = {};
const CACHE_TTL = 30000;

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

    const base = symbol.replace(/USDT$/i, "").toUpperCase();
    const yahooSymbol = getYahooTicker(base);

    const yahooInterval =
      interval === "1m" ? "1m" :
      interval === "5m" ? "5m" :
      interval === "15m" ? "15m" :
      interval === "30m" ? "30m" :
      interval === "1h" ? "60m" :
      interval === "1D" ? "1d" : "1m";

    const yahooRange =
      interval === "1m" ? "1d" :
      interval === "5m" ? "5d" :
      interval === "15m" ? "5d" :
      interval === "30m" ? "1mo" :
      interval === "1h" ? "1mo" :
      interval === "1D" ? "1y" : "1d";

    try {
      const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=${yahooInterval}&range=${yahooRange}`;
      const yahooRes = await fetch(yahooUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; BT-EARN/1.0)" },
      });
      if (yahooRes.ok) {
        const yahooData: any = await yahooRes.json();
        const result = yahooData?.chart?.result?.[0];
        const timestamps = result?.timestamp || [];
        const quote = result?.indicators?.quote?.[0] || {};
        const opens = quote.open || [];
        const highs = quote.high || [];
        const lows = quote.low || [];
        const closes = quote.close || [];

        const candles: any[] = [];
        for (let i = 0; i < timestamps.length; i++) {
          if (opens[i] == null || closes[i] == null) continue;
          candles.push({
            time: timestamps[i] * 1000,
            open: opens[i],
            high: highs[i],
            low: lows[i],
            close: closes[i],
          });
        }

        if (candles.length > 0) {
          const trimmed = candles.slice(-limit);
          chartCache[cacheKey] = { data: trimmed, time: Date.now() };
          return res.json({ success: true, source: "yahoo", candles: trimmed });
        }
      } else {
        console.log("Yahoo chart HTTP error:", yahooRes.status);
      }
    } catch (e: any) {
      console.log("Yahoo chart threw:", e?.message || e);
    }

    const basePrice = symbol.startsWith("BTC") ? 85000
      : symbol.startsWith("ETH") ? 2000
      : symbol.startsWith("BNB") ? 580
      : symbol.startsWith("SOL") ? 145
      : 100;

    const now = Date.now();
    const intervalMs =
      interval === "1m" ? 60000 :
      interval === "5m" ? 300000 :
      interval === "15m" ? 900000 :
      interval === "30m" ? 1800000 :
      interval === "1h" ? 3600000 :
      interval === "1D" ? 86400000 : 60000;

    const candles = [];
    let price = basePrice;
    for (let i = limit; i > 0; i--) {
      const open = price;
      const close = open * (1 + (Math.random() - 0.5) * 0.002);
      const high = Math.max(open, close) * (1 + Math.random() * 0.001);
      const low = Math.min(open, close) * (1 - Math.random() * 0.001);
      candles.push({ time: now - i * intervalMs, open, high, low, close });
      price = close;
    }
    return res.json({ success: true, source: "synthetic", candles });
  } catch (err: any) {
    console.error("Chart fatal error:", err?.message || err);
    return res.status(500).json({ success: false, message: "Chart fetch failed" });
  }
});

router.get("/orderbook/:symbol", async (req: Request, res: Response) => {
  try {
    const { symbol } = req.params;

    try {
      const bybitUrl = `https://api.bybit.com/v5/market/orderbook?category=spot&symbol=${symbol}&limit=10`;
      const bybitRes = await fetch(bybitUrl);
      if (bybitRes.ok) {
        const bybitData: any = await bybitRes.json();
        const b = bybitData?.result?.b || [];
        const a = bybitData?.result?.a || [];
        if (b.length > 0 && a.length > 0) {
          const bids = b.map((x: string[]) => ({
            price: parseFloat(x[0]),
            qty: parseFloat(x[1]),
          }));
          const asks = a.map((x: string[]) => ({
            price: parseFloat(x[0]),
            qty: parseFloat(x[1]),
          }));
          return res.json({ success: true, source: "bybit", bids, asks });
        }
      } else {
        console.log("Bybit orderbook HTTP error:", bybitRes.status);
      }
    } catch (e: any) {
      console.log("Bybit orderbook threw:", e?.message || e);
    }

    const basePrice = symbol.startsWith("BTC") ? 85000
      : symbol.startsWith("ETH") ? 2000
      : symbol.startsWith("BNB") ? 580
      : symbol.startsWith("SOL") ? 145
      : 100;

    const bids: any[] = [];
    const asks: any[] = [];
    for (let i = 0; i < 10; i++) {
      bids.push({
        price: basePrice * (1 - (i + 1) * 0.0002),
        qty: Math.random() * 2,
      });
      asks.push({
        price: basePrice * (1 + (i + 1) * 0.0002),
        qty: Math.random() * 2,
      });
    }
    return res.json({ success: true, source: "synthetic", bids, asks });
  } catch (err: any) {
    console.error("Orderbook fatal error:", err?.message || err);
    return res.status(500).json({ success: false, message: "Orderbook fetch failed" });
  }
});

/* ============================================================
 *  BATCH PRICES — one call for many coins (via Yahoo)
 *  With 10-second cache
 * ============================================================ */
const priceCache: { data: Record<string, any>; time: number } = { data: {}, time: 0 };
const PRICE_CACHE_TTL = 10000;

router.get("/prices", async (req: Request, res: Response) => {
  try {
    const symbolsParam = (req.query.symbols as string) || "BTC,ETH,BNB,SOL";
    const symbols = symbolsParam.split(",").map(s => s.trim().toUpperCase()).filter(Boolean);

    if (symbols.length === 0) {
      return res.status(400).json({ success: false, message: "No symbols provided" });
    }

    if (Date.now() - priceCache.time < PRICE_CACHE_TTL && Object.keys(priceCache.data).length > 0) {
      const cachedSubset: Record<string, any> = {};
      for (const sym of symbols) {
        if (priceCache.data[sym]) cachedSubset[sym] = priceCache.data[sym];
      }
      if (Object.keys(cachedSubset).length > 0) {
        return res.json({ success: true, source: "cache", prices: cachedSubset });
      }
    }

    const priceData: Record<string, { usd: number; usd_24h_change: number }> = {};

    const fetchPromises = symbols.map(async (sym) => {
      try {
        const ticker = sym === "USDT" ? "USDT-USD" : getYahooTicker(sym);
        const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1m&range=1d`;
        const yahooRes = await fetch(yahooUrl, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; BT-EARN/1.0)" },
        });
        if (!yahooRes.ok) return;
        const data: any = await yahooRes.json();
        const meta = data?.chart?.result?.[0]?.meta;
        if (!meta) return;
        const price = meta.regularMarketPrice;
        const prevClose = meta.chartPreviousClose || meta.previousClose || price;
        const changePercent = prevClose ? ((price - prevClose) / prevClose) * 100 : 0;
        priceData[sym] = {
          usd: price,
          usd_24h_change: changePercent,
        };
      } catch (e: any) {
        console.log(`Yahoo price failed for ${sym}:`, e?.message || e);
      }
    });

    await Promise.all(fetchPromises);

    priceCache.data = { ...priceCache.data, ...priceData };
    priceCache.time = Date.now();

    return res.json({ success: true, source: "yahoo", prices: priceData });
  } catch (err: any) {
    console.error("Batch prices error:", err?.message || err);
    return res.status(500).json({ success: false, message: "Prices fetch failed" });
  }
});

router.get("/test", (_req: Request, res: Response) => {
  res.json({ message: "Auth route working!" });
});

export default router;
