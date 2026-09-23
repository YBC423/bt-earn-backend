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

router
