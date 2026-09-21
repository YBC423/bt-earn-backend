import dotenv from "dotenv";
dotenv.config();
import crypto from "crypto";

const API_KEY = process.env.BINANCE_API_KEY || "";
const API_SECRET = process.env.BINANCE_API_SECRET || "";
const TESTNET = process.env.BINANCE_TESTNET === "true";

const BASE_URL = TESTNET
  ? "https://testnet.binance.vision"
  : "https://api.binance.com";

if (!API_KEY || !API_SECRET) {
  console.warn("⚠️ Binance keys missing in .env");
}

function sign(query: string): string {
  return crypto.createHmac("sha256", API_SECRET).update(query).digest("hex");
}

async function binanceFetch(
  path: string,
  params: Record<string, string | number> = {},
  signed = false,
  method: "GET" | "POST" | "DELETE" = "GET"
) {
  const url = new URL(BASE_URL + path);
  const finalParams: Record<string, string | number> = { ...params };

  if (signed) {
    finalParams.timestamp = Date.now();
    finalParams.recvWindow = 5000;
    const query = new URLSearchParams(
      Object.entries(finalParams).map(([k, v]) => [k, String(v)])
    ).toString();
    const signature = sign(query);
    url.search = query + "&signature=" + signature;
  } else {
    Object.entries(finalParams).forEach(([k, v]) =>
      url.searchParams.append(k, String(v))
    );
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (signed) headers["X-MBX-APIKEY"] = API_KEY;

  const res = await fetch(url.toString(), { method, headers });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(
      `Binance API error ${res.status}: ${JSON.stringify(data)}`
    );
  }
  return data;
}

/** Public — current price */
export async function getPrice(symbol = "BTCUSDT"): Promise<number> {
  const data = await binanceFetch("/api/v3/ticker/price", { symbol });
  return parseFloat(data.price);
}

/** Public — klines (candles) */
export async function getKlines(
  symbol = "BTCUSDT",
  interval = "1m",
  limit = 50
): Promise<{ open: number; high: number; low: number; close: number; time: number }[]> {
  const data = await binanceFetch("/api/v3/klines", { symbol, interval, limit });
  return data.map((k: any[]) => ({
    time: k[0],
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
  }));
}

/** Signed — account info */
export async function getAccount() {
  return binanceFetch("/api/v3/account", {}, true, "GET");
}

/** Signed — place MARKET order */
export async function placeMarketOrder(
  symbol: string,
  side: "BUY" | "SELL",
  quoteOrderQty: number
) {
  return binanceFetch(
    "/api/v3/order",
    {
      symbol,
      side,
      type: "MARKET",
      quoteOrderQty: quoteOrderQty.toFixed(2),
    },
    true,
    "POST"
  );
}

/** Signed — place LIMIT order */
export async function placeLimitOrder(
  symbol: string,
  side: "BUY" | "SELL",
  quantity: number,
  price: number
) {
  return binanceFetch(
    "/api/v3/order",
    {
      symbol,
      side,
      type: "LIMIT",
      timeInForce: "GTC",
      quantity: quantity.toString(),
      price: price.toString(),
    },
    true,
    "POST"
  );
}

/** Signed — cancel order */
export async function cancelOrder(symbol: string, orderId: number) {
  return binanceFetch("/api/v3/order", { symbol, orderId }, true, "DELETE");
}

export const isTestnet = TESTNET;