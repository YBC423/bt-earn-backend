import { getKlines, placeMarketOrder } from "./binance";

/**
 * MA Crossover strategy:
 *  - MA7 > MA25  → BUY signal
 *  - MA7 < MA25  → SELL signal (if we hold BTC)
 */

function movingAverage(values: number[], period: number): number {
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

export type BotDecision = {
  signal: "BUY" | "SELL" | "HOLD";
  price: number;
  ma7: number;
  ma25: number;
  reason: string;
};

export async function decideBtcSignal(): Promise<BotDecision> {
  const candles = await getKlines("BTCUSDT", "1m", 50);
  const closes = candles.map((c) => c.close);
  const price = closes[closes.length - 1];
  const ma7 = movingAverage(closes, 7);
  const ma25 = movingAverage(closes, 25);

  let signal: "BUY" | "SELL" | "HOLD" = "HOLD";
  let reason = "No clear signal";

  if (ma7 > ma25 * 1.0005) {
    signal = "BUY";
    reason = `MA7 (${ma7.toFixed(2)}) above MA25 (${ma25.toFixed(2)})`;
  } else if (ma7 < ma25 * 0.9995) {
    signal = "SELL";
    reason = `MA7 (${ma7.toFixed(2)}) below MA25 (${ma25.toFixed(2)})`;
  }

  return { signal, price, ma7, ma25, reason };
}

export async function runBtcBot(amountUSDT: number, currentlyHolding: boolean) {
  const decision = await decideBtcSignal();

  if (decision.signal === "BUY" && !currentlyHolding) {
    const order = await placeMarketOrder("BTCUSDT", "BUY", amountUSDT);
    return { executed: true, side: "BUY" as const, order, decision };
  }

  if (decision.signal === "SELL" && currentlyHolding) {
    const order = await placeMarketOrder("BTCUSDT", "SELL", amountUSDT);
    return { executed: true, side: "SELL" as const, order, decision };
  }

  return { executed: false, side: null, order: null, decision };
}