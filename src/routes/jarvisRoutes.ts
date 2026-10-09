import { Router, Request, Response } from "express";
import User from "../models/User";
import admin from "firebase-admin";
import { requireJarvisKey } from "../middlewares/jarvisMiddleware";

const router = Router();
router.use(requireJarvisKey);

/* ============================================================
 *  Helper — only verified users
 * ============================================================ */
async function getVerifiedUids(uids: string[]): Promise<Set<string>> {
  const verified = new Set<string>();
  const chunks: string[][] = [];
  for (let i = 0; i < uids.length; i += 100) chunks.push(uids.slice(i, i + 100));
  for (const chunk of chunks) {
    try {
      const result = await admin.auth().getUsers(chunk.map((uid) => ({ uid })));
      for (const u of result.users) if (u.emailVerified) verified.add(u.uid);
    } catch (e) {
      console.error("getUsers batch failed:", e);
    }
  }
  return verified;
}

/* ============================================================
 *  GET /api/jarvis/summary — one-shot dashboard snapshot
 * ============================================================ */
router.get("/summary", async (_req: Request, res: Response) => {
  try {
    const allUsers = await User.find({}).select("firebaseUid").lean();
    const uids = allUsers.map((u: any) => u.firebaseUid).filter(Boolean);
    const verifiedSet = await getVerifiedUids(uids);
    const verifiedUids = Array.from(verifiedSet);

    const users = await User.find({ firebaseUid: { $in: verifiedUids } })
      .select("wallets balance status totalProfit")
      .lean();

    let totalUsdt = 0;
    let totalProfit = 0;
    let banned = 0;
    for (const u of users as any[]) {
      totalUsdt += Number(u?.wallets?.usdt || 0);
      totalProfit += Number(u?.totalProfit || 0);
      if (u?.status === "banned") banned++;
    }

    const pendingDep = await User.aggregate([
      { $match: { firebaseUid: { $in: verifiedUids } } },
      { $unwind: "$deposits" },
      { $match: { "deposits.status": "Pending" } },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          total: { $sum: { $ifNull: ["$deposits.amount", 0] } },
        },
      },
    ]);

    const pendingWd = await User.aggregate([
      { $match: { firebaseUid: { $in: verifiedUids } } },
      { $unwind: "$withdrawals" },
      { $match: { "withdrawals.status": "Pending" } },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          total: { $sum: { $ifNull: ["$withdrawals.amount", 0] } },
        },
      },
    ]);

    return res.json({
      success: true,
      summary: {
        totalUsers: verifiedUids.length,
        bannedUsers: banned,
        activeUsers: verifiedUids.length - banned,
        totalUsdt,
        totalProfit,
        pendingDeposits: {
          count: pendingDep[0]?.count || 0,
          total: pendingDep[0]?.total || 0,
        },
        pendingWithdrawals: {
          count: pendingWd[0]?.count || 0,
          total: pendingWd[0]?.total || 0,
        },
      },
    });
  } catch (err: any) {
    console.error("JARVIS summary error:", err);
    return res.status(500).json({ success: false, message: "Failed to load summary" });
  }
});

/* ============================================================
 *  GET /api/jarvis/deposits?status=Pending&limit=20
 * ============================================================ */
router.get("/deposits", async (req: Request, res: Response) => {
  try {
    const status = (req.query.status as string) || "Pending";
    const limit = Math.min(50, parseInt(req.query.limit as string) || 20);

    const pipeline: any[] = [
      { $unwind: "$deposits" },
      {
        $project: {
          firebaseUid: "$firebaseUid",
          userEmail: "$email",
          userName: "$name",
          id: "$deposits.id",
          amount: "$deposits.amount",
          asset: "$deposits.asset",
          network: "$deposits.network",
          status: "$deposits.status",
          dateTime: "$deposits.dateTime",
        },
      },
    ];
    if (status !== "all") pipeline.push({ $match: { status } });
    pipeline.push({ $sort: { id: -1 } }, { $limit: limit });

    const raw = await User.aggregate(pipeline);
    const uids = Array.from(new Set(raw.map((r: any) => r.firebaseUid).filter(Boolean)));
    const verifiedSet = await getVerifiedUids(uids);
    const deposits = raw.filter((r: any) => verifiedSet.has(r.firebaseUid));

    return res.json({ success: true, count: deposits.length, deposits });
  } catch (err: any) {
    console.error("JARVIS deposits error:", err);
    return res.status(500).json({ success: false, message: "Failed to load deposits" });
  }
});

/* ============================================================
 *  GET /api/jarvis/withdrawals?status=Pending&limit=20
 * ============================================================ */
router.get("/withdrawals", async (req: Request, res: Response) => {
  try {
    const status = (req.query.status as string) || "Pending";
    const limit = Math.min(50, parseInt(req.query.limit as string) || 20);

    const pipeline: any[] = [
      { $unwind: "$withdrawals" },
      {
        $project: {
          firebaseUid: "$firebaseUid",
          userEmail: "$email",
          userName: "$name",
          id: "$withdrawals.id",
          amount: "$withdrawals.amount",
          asset: "$withdrawals.asset",
          network: "$withdrawals.network",
          address: "$withdrawals.address",
          status: "$withdrawals.status",
          dateTime: "$withdrawals.dateTime",
        },
      },
    ];
    if (status !== "all") pipeline.push({ $match: { status } });
    pipeline.push({ $sort: { id: -1 } }, { $limit: limit });

    const raw = await User.aggregate(pipeline);
    const uids = Array.from(new Set(raw.map((r: any) => r.firebaseUid).filter(Boolean)));
    const verifiedSet = await getVerifiedUids(uids);
    const withdrawals = raw.filter((r: any) => verifiedSet.has(r.firebaseUid));

    return res.json({ success: true, count: withdrawals.length, withdrawals });
  } catch (err: any) {
    console.error("JARVIS withdrawals error:", err);
    return res.status(500).json({ success: false, message: "Failed to load withdrawals" });
  }
});

/* ============================================================
 *  GET /api/jarvis/users?limit=20  (recent signups)
 * ============================================================ */
router.get("/users", async (req: Request, res: Response) => {
  try {
    const limit = Math.min(100, parseInt(req.query.limit as string) || 20);

    const all = await User.find({})
      .sort({ createdAt: -1 })
      .limit(limit * 2)
      .select("name email country status createdAt firebaseUid wallets.usdt")
      .lean();

    const uids = all.map((u: any) => u.firebaseUid).filter(Boolean);
    const verifiedSet = await getVerifiedUids(uids);
    const users = all
      .filter((u: any) => verifiedSet.has(u.firebaseUid))
      .slice(0, limit);

    return res.json({ success: true, count: users.length, users });
  } catch (err: any) {
    console.error("JARVIS users error:", err);
    return res.status(500).json({ success: false, message: "Failed to load users" });
  }
});

/* ============================================================
 *  GET /api/jarvis/user/:email — single user lookup
 * ============================================================ */
router.get("/user/:email", async (req: Request, res: Response) => {
  try {
    const email = String(req.params.email || "").toLowerCase().trim();
    if (!email) return res.status(400).json({ success: false, message: "Email required" });

    const user = await User.findOne({ email }).lean();
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    return res.json({ success: true, user });
  } catch (err: any) {
    console.error("JARVIS user error:", err);
    return res.status(500).json({ success: false, message: "Failed to load user" });
  }
});

/* ============================================================
 *  GET /api/jarvis/bots?limit=20 — recent bot trades
 * ============================================================ */
router.get("/bots", async (req: Request, res: Response) => {
  try {
    const limit = Math.min(100, parseInt(req.query.limit as string) || 20);

    const pipeline: any[] = [
      { $unwind: "$trades" },
      {
        $project: {
          firebaseUid: "$firebaseUid",
          userEmail: "$email",
          id: "$trades.id",
          botName: "$trades.botName",
          asset: "$trades.asset",
          profit: "$trades.profit",
          timestamp: "$trades.timestamp",
        },
      },
      { $sort: { id: -1 } },
      { $limit: limit },
    ];

    const raw = await User.aggregate(pipeline);
    const uids = Array.from(new Set(raw.map((r: any) => r.firebaseUid).filter(Boolean)));
    const verifiedSet = await getVerifiedUids(uids);
    const trades = raw.filter((r: any) => verifiedSet.has(r.firebaseUid));

    return res.json({ success: true, count: trades.length, trades });
  } catch (err: any) {
    console.error("JARVIS bots error:", err);
    return res.status(500).json({ success: false, message: "Failed to load bot trades" });
  }
});

/* ============================================================
 *  GET /api/jarvis/logs?limit=20 — recent admin audit
 * ============================================================ */
router.get("/logs", async (req: Request, res: Response) => {
  try {
    const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
    const AdminLog = (await import("../models/AdminLog")).default;
    const logs = await AdminLog.find({}).sort({ createdAt: -1 }).limit(limit).lean();
    return res.json({ success: true, count: logs.length, logs });
  } catch (err: any) {
    console.error("JARVIS logs error:", err);
    return res.status(500).json({ success: false, message: "Failed to load logs" });
  }
});

export default router;
