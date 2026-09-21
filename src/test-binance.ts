import dotenv from "dotenv";
dotenv.config();

import { getPrice, getAccount } from "./services/binance";
import { decideBtcSignal } from "./services/btcBot";

async function main() {
  console.log("--- Binance Testnet Check ---");
  console.log("Testnet:", process.env.BINANCE_TESTNET);

  const price = await getPrice("BTCUSDT");
  console.log("BTC price:", price);

  const account = await getAccount();
  console.log(
    "Account balances:",
    account.balances.filter((b: any) => parseFloat(b.free) > 0)
  );

  const signal = await decideBtcSignal();
  console.log("Signal:", signal);
}

main().catch((e) => {
  console.error("Test failed:", e.message);
  process.exit(1);
});