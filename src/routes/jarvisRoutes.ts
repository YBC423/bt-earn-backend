import { Router, Request, Response } from "express";
import User from "../models/User";
import { requireJarvisKey } from "../middlewares/jarvisMiddleware";
import { requireJarvisWrite } from "../middlewares/jarvisWriteMiddleware";

const router = Router();
router.use(requireJarvisKey);

/* ============================================================
 *  GET /api/jarvis/summary
 * ============================================================ */
router.get("/summary", async (_req: Request, res: Response) => {
  try {
    const users = await User.find({})
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
        totalUsers: (users as any[]).length,
        bannedUsers: banned,
        activeUsers: (users as any[]).length - banned,
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
 *  GET /api/jarvis/deposits
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

    const deposits = await User.aggregate(pipeline);

    return res.json({ success: true, count: deposits.length, deposits });
  } catch (err: any) {
    console.error("JARVIS deposits error:", err);
    return res.status(500).json({ success: false, message: "Failed to load deposits" });
  }
});

/* ============================================================
 *  GET /api/jarvis/withdrawals
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

    const withdrawals = await User.aggregate(pipeline);

    return res.json({ success: true, count: withdrawals.length, withdrawals });
  } catch (err: any) {
    console.error("JARVIS withdrawals error:", err);
    return res.status(500).json({ success: false, message: "Failed to load withdrawals" });
  }
});

/* ============================================================
 *  GET /api/jarvis/users
 * ============================================================ */
router.get("/users", async (req: Request, res: Response) => {
  try {
    const limit = Math.min(100, parseInt(req.query.limit as string) || 20);

    const users = await User.find({})
      .sort({ createdAt: -1 })
      .limit(limit)
      .select("name email country status createdAt firebaseUid wallets.usdt")
      .lean();

    return res.json({ success: true, count: users.length, users });
  } catch (err: any) {
    console.error("JARVIS users error:", err);
    return res.status(500).json({ success: false, message: "Failed to load users" });
  }
});

/* ============================================================
 *  GET /api/jarvis/user/:email
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
 *  GET /api/jarvis/bots
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

    const trades = await User.aggregate(pipeline);

    return res.json({ success: true, count: trades.length, trades });
  } catch (err: any) {
    console.error("JARVIS bots error:", err);
    return res.status(500).json({ success: false, message: "Failed to load bot trades" });
  }
});

/* ============================================================
 *  GET /api/jarvis/logs
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

/* ============================================================
 *  WRITE ROUTES — approve / reject
 * ============================================================ */

router.post(
  "/deposits/:uid/:depositId/approve",
  requireJarvisWrite,
  async (req: Request, res: Response) => {
    try {
      const depositId = Number(req.params.depositId);
      const user = await User.findOne({ firebaseUid: req.params.uid });
      if (!user) return res.status(404).json({ success: false, message: "User not found" });

      const deposit: any = (user.deposits || []).find(
        (d: any) => Number(d.id) === depositId
      );
      if (!deposit) return res.status(404).json({ success: false, message: "Deposit not found" });
      if (deposit.status === "Approved")
        return res.status(400).json({ success: false, message: "Deposit already approved" });
      if (deposit.status === "Rejected")
        return res.status(400).json({ success: false, message: "Deposit was rejected" });

      const amt = Number(deposit.amount || 0);
      deposit.status = "Approved";
      user.markModified("deposits");

      const wallets: any = user.wallets || {};
      wallets.usdt = Number(wallets.usdt || 0) + amt;
      user.wallets = wallets;
      user.markModified("wallets");
      user.balance = Number(user.balance || 0) + amt;

      await user.save();

      return res.json({
        success: true,
        message: `Deposit approved. $${amt.toFixed(2)} credited as USDT.`,
        amount: amt,
        userEmail: user.email,
      });
    } catch (err: any) {
      console.error("JARVIS approve deposit error:", err);
      return res.status(500).json({ success: false, message: "Approval failed" });
    }
  }
);

router.post(
  "/deposits/:uid/:depositId/reject",
  requireJarvisWrite,
  async (req: Request, res: Response) => {
    try {
      const depositId = Number(req.params.depositId);
      const user = await User.findOne({ firebaseUid: req.params.uid });
      if (!user) return res.status(404).json({ success: false, message: "User not found" });

      const deposit: any = (user.deposits || []).find(
        (d: any) => Number(d.id) === depositId
      );
      if (!deposit) return res.status(404).json({ success: false, message: "Deposit not found" });
      if (deposit.status === "Rejected")
        return res.status(400).json({ success: false, message: "Already rejected" });
      if (deposit.status === "Approved")
        return res.status(400).json({ success: false, message: "Was approved" });

      const amt = Number(deposit.amount || 0);
      deposit.status = "Rejected";
      user.markModified("deposits");
      await user.save();

      return res.json({
        success: true,
        message: `Deposit rejected.`,
        amount: amt,
        userEmail: user.email,
      });
    } catch (err: any) {
      console.error("JARVIS reject deposit error:", err);
      return res.status(500).json({ success: false, message: "Reject failed" });
    }
  }
);

router.post(
  "/withdrawals/:uid/:withdrawalId/approve",
  requireJarvisWrite,
  async (req: Request, res: Response) => {
    try {
      const wid = Number(req.params.withdrawalId);
      const user = await User.findOne({ firebaseUid: req.params.uid });
      if (!user) return res.status(404).json({ success: false, message: "User not found" });

      const w: any = (user.withdrawals || []).find(
        (x: any) => Number(x.id) === wid
      );
      if (!w) return res.status(404).json({ success: false, message: "Withdrawal not found" });
      if (w.status === "Approved")
        return res.status(400).json({ success: false, message: "Already approved" });
      if (w.status === "Rejected")
        return res.status(400).json({ success: false, message: "Was rejected" });

      w.status = "Approved";
      user.markModified("withdrawals");
      await user.save();

      return res.json({
        success: true,
        message: `Withdrawal approved.`,
        amount: Number(w.amount || 0),
        userEmail: user.email,
      });
    } catch (err: any) {
      console.error("JARVIS approve withdrawal error:", err);
      return res.status(500).json({ success: false, message: "Approval failed" });
    }
  }
);

router.post(
  "/withdrawals/:uid/:withdrawalId/reject",
  requireJarvisWrite,
  async (req: Request, res: Response) => {
    try {
      const wid = Number(req.params.withdrawalId);
      const user = await User.findOne({ firebaseUid: req.params.uid });
      if (!user) return res.status(404).json({ success: false, message: "User not found" });

      const w: any = (user.withdrawals || []).find(
        (x: any) => Number(x.id) === wid
      );
      if (!w) return res.status(404).json({ success: false, message: "Withdrawal not found" });
      if (w.status === "Rejected")
        return res.status(400).json({ success: false, message: "Already rejected" });
      if (w.status === "Approved")
        return res.status(400).json({ success: false, message: "Was approved" });

      const refundAmount = Number(w.amount || 0);
      w.status = "Rejected";
      user.markModified("withdrawals");

      const wallets: any = user.wallets || {};
      wallets.usdt = Number(wallets.usdt || 0) + refundAmount;
      user.wallets = wallets;
      user.markModified("wallets");
      user.balance = Number(user.balance || 0) + refundAmount;

      await user.save();

      return res.json({
        success: true,
        message: `Withdrawal rejected. $${refundAmount.toFixed(2)} refunded.`,
        amount: refundAmount,
        userEmail: user.email,
      });
    } catch (err: any) {
      console.error("JARVIS reject withdrawal error:", err);
      return res.status(500).json({ success: false, message: "Reject failed" });
    }
  }
);

export default router;
