import { Router, Request, Response } from "express";
import mongoose from "mongoose";
import User from "../models/User";
import AdminLog from "../models/AdminLog";
import { requireAdmin } from "../middlewares/adminMiddleware";

const router = Router();

/* ============================================================
 *  Helpers
 * ============================================================ */
async function writeLog(
  req: Request,
  action: string,
  targetType: "user" | "deposit" | "withdrawal" | "system",
  extra: Partial<{
    targetId: string;
    targetEmail: string;
    amount: number;
    asset: string;
    reason: string;
    metadata: Record<string, any>;
  }> = {}
) {
  try {
    await AdminLog.create({
      adminEmail: req.adminEmail || "unknown",
      adminFirebaseUid: req.adminFirebaseUid || "unknown",
      action,
      targetType,
      targetId: extra.targetId,
      targetEmail: extra.targetEmail,
      amount: extra.amount,
      asset: extra.asset,
      reason: extra.reason,
      metadata: extra.metadata,
      ip: (req.headers["x-forwarded-for"] as string) || req.ip || "",
    });
  } catch (e) {
    console.error("Failed to write admin log:", e);
  }
}

function csvEscape(v: any): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toCsv(rows: any[], headers: string[]): string {
  const headerLine = headers.join(",");
  const body = rows
    .map((r) => headers.map((h) => csvEscape(r[h])).join(","))
    .join("\n");
  return headerLine + "\n" + body;
}

/* ============================================================
 *  Every route below requires a verified Firebase token
 *  with an email in ADMIN_EMAILS
 * ============================================================ */
router.use(requireAdmin);

/* ============================================================
 *  GET /api/admin/me — confirm admin session works
 * ============================================================ */
router.get("/me", (req: Request, res: Response) => {
  return res.json({
    success: true,
    admin: {
      email: req.adminEmail,
      uid: req.adminFirebaseUid,
    },
  });
});

/* ============================================================
 *  GET /api/admin/stats — dashboard summary
 * ============================================================ */
router.get("/stats", async (_req: Request, res: Response) => {
  try {
    const totalUsers = await User.countDocuments({});

    const balanceAgg = await User.aggregate([
      {
        $group: {
          _id: null,
          totalUsdt: { $sum: { $ifNull: ["$wallets.usdt", 0] } },
          totalProfit: { $sum: { $ifNull: ["$totalProfit", 0] } },
        },
      },
    ]);
    const totalUsdt = balanceAgg[0]?.totalUsdt || 0;
    const totalProfit = balanceAgg[0]?.totalProfit || 0;

    const depositAgg = await User.aggregate([
      { $unwind: { path: "$deposits", preserveNullAndEmptyArrays: false } },
      {
        $group: {
          _id: "$deposits.status",
          count: { $sum: 1 },
          total: { $sum: { $ifNull: ["$deposits.amount", 0] } },
        },
      },
    ]);
    const depositStats = { Pending: { count: 0, total: 0 }, Approved: { count: 0, total: 0 }, Rejected: { count: 0, total: 0 } };
    for (const d of depositAgg) {
      if (d._id === "Pending") depositStats.Pending = { count: d.count, total: d.total };
      else if (d._id === "Approved" || d._id === "Completed") depositStats.Approved = { count: d.count, total: d.total };
      else if (d._id === "Rejected") depositStats.Rejected = { count: d.count, total: d.total };
    }

    const withdrawAgg = await User.aggregate([
      { $unwind: { path: "$withdrawals", preserveNullAndEmptyArrays: false } },
      {
        $group: {
          _id: "$withdrawals.status",
          count: { $sum: 1 },
          total: { $sum: { $ifNull: ["$withdrawals.amount", 0] } },
        },
      },
    ]);
    const withdrawStats = { Pending: { count: 0, total: 0 }, Approved: { count: 0, total: 0 }, Rejected: { count: 0, total: 0 } };
    for (const d of withdrawAgg) {
      if (d._id === "Pending") withdrawStats.Pending = { count: d.count, total: d.total };
      else if (d._id === "Approved" || d._id === "Completed") withdrawStats.Approved = { count: d.count, total: d.total };
      else if (d._id === "Rejected") withdrawStats.Rejected = { count: d.count, total: d.total };
    }

    const tradeAgg = await User.aggregate([
      { $unwind: { path: "$trades", preserveNullAndEmptyArrays: false } },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          totalProfit: { $sum: { $ifNull: ["$trades.profit", 0] } },
        },
      },
    ]);
    const totalTrades = tradeAgg[0]?.count || 0;
    const botProfit = tradeAgg[0]?.totalProfit || 0;

    const bannedUsers = await User.countDocuments({ status: "banned" });
    const activeUsers = await User.countDocuments({ status: "active" });

    const recentUsers = await User.find({})
      .sort({ createdAt: -1 })
      .limit(5)
      .select("name email country status createdAt wallets.usdt")
      .lean();

    return res.json({
      success: true,
      stats: {
        totalUsers,
        activeUsers,
        bannedUsers,
        totalUsdt,
        totalProfit,
        botProfit,
        totalTrades,
        deposits: depositStats,
        withdrawals: withdrawStats,
        recentUsers,
      },
    });
  } catch (err: any) {
    console.error("Stats error:", err);
    return res.status(500).json({ success: false, message: "Failed to load stats" });
  }
});

/* ============================================================
 *  GET /api/admin/users — list + search + pagination
 *  Query: ?q=&page=1&limit=25&status=all
 * ============================================================ */
router.get("/users", async (req: Request, res: Response) => {
  try {
    const q = (req.query.q as string || "").trim();
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25));
    const status = (req.query.status as string) || "all";

    const filter: any = {};
    if (q) {
      filter.$or = [
        { email: { $regex: q, $options: "i" } },
        { name: { $regex: q, $options: "i" } },
        { firebaseUid: q },
      ];
    }
    if (status !== "all") filter.status = status;

    const total = await User.countDocuments(filter);
    const users = await User.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select("name email country status firebaseUid wallets balance totalProfit createdAt lastLogin")
      .lean();

    return res.json({
      success: true,
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      users,
    });
  } catch (err: any) {
    console.error("Users list error:", err);
    return res.status(500).json({ success: false, message: "Failed to load users" });
  }
});

/* ============================================================
 *  GET /api/admin/users/export — CSV download
 * ============================================================ */
router.get("/users/export", async (_req: Request, res: Response) => {
  try {
    const users = await User.find({})
      .sort({ createdAt: -1 })
      .select("name email country status firebaseUid wallets balance totalProfit createdAt")
      .lean();

    const rows = users.map((u: any) => ({
      name: u.name,
      email: u.email,
      country: u.country,
      status: u.status,
      firebaseUid: u.firebaseUid,
      usdt: u.wallets?.usdt || 0,
      btc: u.wallets?.btc || 0,
      eth: u.wallets?.eth || 0,
      ngn: u.wallets?.ngn || 0,
      balance: u.balance || 0,
      totalProfit: u.totalProfit || 0,
      createdAt: u.createdAt,
    }));

    const csv = toCsv(rows, [
      "name",
      "email",
      "country",
      "status",
      "firebaseUid",
      "usdt",
      "btc",
      "eth",
      "ngn",
      "balance",
      "totalProfit",
      "createdAt",
    ]);

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename=bt-earn-users-${Date.now()}.csv`);
    return res.send(csv);
  } catch (err: any) {
    console.error("Users export error:", err);
    return res.status(500).json({ success: false, message: "Export failed" });
  }
});

/* ============================================================
 *  GET /api/admin/users/:uid — single user full detail
 * ============================================================ */
router.get("/users/:uid", async (req: Request, res: Response) => {
  try {
    const user = await User.findOne({ firebaseUid: req.params.uid }).lean();
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    return res.json({ success: true, user });
  } catch (err: any) {
    console.error("User detail error:", err);
    return res.status(500).json({ success: false, message: "Failed to load user" });
  }
});

/* ============================================================
 *  POST /api/admin/users/:uid/credit — credit USDT
 *  Body: { amount, reason }
 * ============================================================ */
router.post("/users/:uid/credit", async (req: Request, res: Response) => {
  try {
    const { amount, reason } = req.body || {};
    const amt = Number(amount);
    if (!amt || isNaN(amt) || amt <= 0) {
      return res.status(400).json({ success: false, message: "Valid positive amount required" });
    }

    const user = await User.findOne({ firebaseUid: req.params.uid });
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    const before = Number(user.wallets?.usdt || 0);
    const after = before + amt;

    await User.updateOne(
      { firebaseUid: req.params.uid },
      {
        $inc: { "wallets.usdt": amt, balance: amt },
        $set: { "wallets.usdt": after },
      }
    );
    // Re-read for safety (the $set above ensures the value is exact)
    const updated = await User.findOne({ firebaseUid: req.params.uid });

    await writeLog(req, "CREDIT_USDT", "user", {
      targetId: req.params.uid,
      targetEmail: user.email,
      amount: amt,
      asset: "USDT",
      reason: reason || "",
      metadata: { before, after },
    });

    return res.json({
      success: true,
      message: `Credited $${amt.toFixed(2)} USDT`,
      newBalance: updated?.wallets?.usdt || 0,
    });
  } catch (err: any) {
    console.error("Credit error:", err);
    return res.status(500).json({ success: false, message: "Credit failed" });
  }
});

/* ============================================================
 *  POST /api/admin/users/:uid/debit — debit USDT
 *  Body: { amount, reason }
 * ============================================================ */
router.post("/users/:uid/debit", async (req: Request, res: Response) => {
  try {
    const { amount, reason } = req.body || {};
    const amt = Number(amount);
    if (!amt || isNaN(amt) || amt <= 0) {
      return res.status(400).json({ success: false, message: "Valid positive amount required" });
    }

    const user = await User.findOne({ firebaseUid: req.params.uid });
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    const before = Number(user.wallets?.usdt || 0);
    if (before < amt) {
      return res.status(400).json({
        success: false,
        message: `Insufficient balance. User has $${before.toFixed(2)} USDT.`,
      });
    }
    const after = before - amt;

    await User.updateOne(
      { firebaseUid: req.params.uid },
      {
        $inc: { "wallets.usdt": -amt, balance: -amt },
      }
    );
    const updated = await User.findOne({ firebaseUid: req.params.uid });

    await writeLog(req, "DEBIT_USDT", "user", {
      targetId: req.params.uid,
      targetEmail: user.email,
      amount: amt,
      asset: "USDT",
      reason: reason || "",
      metadata: { before, after },
    });

    return res.json({
      success: true,
      message: `Debited $${amt.toFixed(2)} USDT`,
      newBalance: updated?.wallets?.usdt || 0,
    });
  } catch (err: any) {
    console.error("Debit error:", err);
    return res.status(500).json({ success: false, message: "Debit failed" });
  }
});

/* ============================================================
 *  POST /api/admin/users/:uid/status — ban / unban
 *  Body: { status: "active" | "banned", reason }
 * ============================================================ */
router.post("/users/:uid/status", async (req: Request, res: Response) => {
  try {
    const { status, reason } = req.body || {};
    if (status !== "active" && status !== "banned") {
      return res.status(400).json({ success: false, message: "status must be 'active' or 'banned'" });
    }

    const user = await User.findOne({ firebaseUid: req.params.uid });
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    await User.updateOne({ firebaseUid: req.params.uid }, { $set: { status } });

    await writeLog(req, status === "banned" ? "BAN_USER" : "UNBAN_USER", "user", {
      targetId: req.params.uid,
      targetEmail: user.email,
      reason: reason || "",
      metadata: { previousStatus: user.status, newStatus: status },
    });

    return res.json({ success: true, message: `User status set to ${status}` });
  } catch (err: any) {
    console.error("Status error:", err);
    return res.status(500).json({ success: false, message: "Status update failed" });
  }
});

/* ============================================================
 *  GET /api/admin/deposits — all deposits across all users
 *  Query: ?status=Pending|Approved|Rejected|all&page=1&limit=25
 * ============================================================ */
router.get("/deposits", async (req: Request, res: Response) => {
  try {
    const status = (req.query.status as string) || "all";
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25));

    const pipeline: any[] = [
      { $unwind: "$deposits" },
      {
        $project: {
          _id: 0,
          firebaseUid: "$firebaseUid",
          userName: "$name",
          userEmail: "$email",
          id: "$deposits.id",
          amount: "$deposits.amount",
          asset: "$deposits.asset",
          address: "$deposits.address",
          network: "$deposits.network",
          status: "$deposits.status",
          dateTime: "$deposits.dateTime",
          txId: "$deposits.txId",
        },
      },
    ];
    if (status !== "all") pipeline.push({ $match: { status } });
    pipeline.push({ $sort: { id: -1 } });

    const countPipeline = [...pipeline, { $count: "total" }];
    const countRes = await User.aggregate(countPipeline);
    const total = countRes[0]?.total || 0;

    pipeline.push({ $skip: (page - 1) * limit }, { $limit: limit });
    const deposits = await User.aggregate(pipeline);

    return res.json({
      success: true,
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      deposits,
    });
  } catch (err: any) {
    console.error("Deposits list error:", err);
    return res.status(500).json({ success: false, message: "Failed to load deposits" });
  }
});

/* ============================================================
 *  POST /api/admin/deposits/:uid/:depositId/approve
 *  Body: { reason? }
 *  Sets deposit status → Approved AND credits user's USDT
 * ============================================================ */
router.post("/deposits/:uid/:depositId/approve", async (req: Request, res: Response) => {
  try {
    const depositId = Number(req.params.depositId);
    const user = await User.findOne({ firebaseUid: req.params.uid });
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    const deposit = user.deposits.find((d: any) => Number(d.id) === depositId);
    if (!deposit) return res.status(404).json({ success: false, message: "Deposit not found" });

    if (deposit.status === "Approved") {
      return res.status(400).json({ success: false, message: "Deposit already approved" });
    }

    const amt = Number(deposit.amount || 0);

    await User.updateOne(
      { firebaseUid: req.params.uid, "deposits.id": depositId },
      {
        $set: { "deposits.$.status": "Approved" },
        $inc: { "wallets.usdt": amt, balance: amt },
      }
    );

    const updated = await User.findOne({ firebaseUid: req.params.uid });

    await writeLog(req, "APPROVE_DEPOSIT", "deposit", {
      targetId: String(depositId),
      targetEmail: user.email,
      amount: amt,
      asset: deposit.asset,
      reason: (req.body?.reason as string) || "",
      metadata: { depositId, txId: deposit.txId },
    });

    return res.json({
      success: true,
      message: `Deposit approved. $${amt.toFixed(2)} credited.`,
      newBalance: updated?.wallets?.usdt || 0,
    });
  } catch (err: any) {
    console.error("Approve deposit error:", err);
    return res.status(500).json({ success: false, message: "Approval failed" });
  }
});

/* ============================================================
 *  POST /api/admin/deposits/:uid/:depositId/reject
 *  Body: { reason }
 *  Sets deposit status → Rejected (no balance change)
 * ============================================================ */
router.post("/deposits/:uid/:depositId/reject", async (req: Request, res: Response) => {
  try {
    const depositId = Number(req.params.depositId);
    const user = await User.findOne({ firebaseUid: req.params.uid });
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    const deposit = user.deposits.find((d: any) => Number(d.id) === depositId);
    if (!deposit) return res.status(404).json({ success: false, message: "Deposit not found" });

    if (deposit.status === "Rejected") {
      return res.status(400).json({ success: false, message: "Deposit already rejected" });
    }

    await User.updateOne(
      { firebaseUid: req.params.uid, "deposits.id": depositId },
      { $set: { "deposits.$.status": "Rejected" } }
    );

    await writeLog(req, "REJECT_DEPOSIT", "deposit", {
      targetId: String(depositId),
      targetEmail: user.email,
      amount: Number(deposit.amount || 0),
      asset: deposit.asset,
      reason: (req.body?.reason as string) || "",
      metadata: { depositId, txId: deposit.txId },
    });

    return res.json({ success: true, message: "Deposit rejected" });
  } catch (err: any) {
    console.error("Reject deposit error:", err);
    return res.status(500).json({ success: false, message: "Reject failed" });
  }
});

/* ============================================================
 *  GET /api/admin/withdrawals — all withdrawals across users
 * ============================================================ */
router.get("/withdrawals", async (req: Request, res: Response) => {
  try {
    const status = (req.query.status as string) || "all";
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25));

    const pipeline: any[] = [
      { $unwind: "$withdrawals" },
      {
        $project: {
          _id: 0,
          firebaseUid: "$firebaseUid",
          userName: "$name",
          userEmail: "$email",
          id: "$withdrawals.id",
          amount: "$withdrawals.amount",
          asset: "$withdrawals.asset",
          address: "$withdrawals.address",
          network: "$withdrawals.network",
          fee: "$withdrawals.fee",
          status: "$withdrawals.status",
          dateTime: "$withdrawals.dateTime",
          txId: "$withdrawals.txId",
        },
      },
    ];
    if (status !== "all") pipeline.push({ $match: { status } });
    pipeline.push({ $sort: { id: -1 } });

    const countRes = await User.aggregate([...pipeline, { $count: "total" }]);
    const total = countRes[0]?.total || 0;

    pipeline.push({ $skip: (page - 1) * limit }, { $limit: limit });
    const withdrawals = await User.aggregate(pipeline);

    return res.json({
      success: true,
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      withdrawals,
    });
  } catch (err: any) {
    console.error("Withdrawals list error:", err);
    return res.status(500).json({ success: false, message: "Failed to load withdrawals" });
  }
});

/* ============================================================
 *  POST /api/admin/withdrawals/:uid/:withdrawalId/approve
 *  Already deducted at request time. Just marks Approved.
 * ============================================================ */
router.post("/withdrawals/:uid/:withdrawalId/approve", async (req: Request, res: Response) => {
  try {
    const wid = Number(req.params.withdrawalId);
    const user = await User.findOne({ firebaseUid: req.params.uid });
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    const w = user.withdrawals.find((x: any) => Number(x.id) === wid);
    if (!w) return res.status(404).json({ success: false, message: "Withdrawal not found" });

    if (w.status === "Approved") {
      return res.status(400).json({ success: false, message: "Withdrawal already approved" });
    }

    await User.updateOne(
      { firebaseUid: req.params.uid, "withdrawals.id": wid },
      { $set: { "withdrawals.$.status": "Approved" } }
    );

    await writeLog(req, "APPROVE_WITHDRAWAL", "withdrawal", {
      targetId: String(wid),
      targetEmail: user.email,
      amount: Number(w.amount || 0),
      asset: w.asset,
      reason: (req.body?.reason as string) || "",
      metadata: { withdrawalId: wid, txId: w.txId },
    });

    return res.json({ success: true, message: "Withdrawal approved" });
  } catch (err: any) {
    console.error("Approve withdrawal error:", err);
    return res.status(500).json({ success: false, message: "Approval failed" });
  }
});

/* ============================================================
 *  POST /api/admin/withdrawals/:uid/:withdrawalId/reject
 *  Body: { reason }
 *  Sets status → Rejected AND refunds the USDT back to user.
 * ============================================================ */
router.post("/withdrawals/:uid/:withdrawalId/reject", async (req: Request, res: Response) => {
  try {
    const wid = Number(req.params.withdrawalId);
    const user = await User.findOne({ firebaseUid: req.params.uid });
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    const w = user.withdrawals.find((x: any) => Number(x.id) === wid);
    if (!w) return res.status(404).json({ success: false, message: "Withdrawal not found" });

    if (w.status === "Rejected") {
      return res.status(400).json({ success: false, message: "Withdrawal already rejected" });
    }

    const refundAmount = Number(w.amount || 0);

    await User.updateOne(
      { firebaseUid: req.params.uid, "withdrawals.id": wid },
      {
        $set: { "withdrawals.$.status": "Rejected" },
        $inc: { "wallets.usdt": refundAmount, balance: refundAmount },
      }
    );

    const updated = await User.findOne({ firebaseUid: req.params.uid });

    await writeLog(req, "REJECT_WITHDRAWAL", "withdrawal", {
      targetId: String(wid),
      targetEmail: user.email,
      amount: refundAmount,
      asset: w.asset,
      reason: (req.body?.reason as string) || "",
      metadata: { withdrawalId: wid, txId: w.txId, refunded: true },
    });

    return res.json({
      success: true,
      message: `Withdrawal rejected. $${refundAmount.toFixed(2)} refunded.`,
      newBalance: updated?.wallets?.usdt || 0,
    });
  } catch (err: any) {
    console.error("Reject withdrawal error:", err);
    return res.status(500).json({ success: false, message: "Reject failed" });
  }
});

/* ============================================================
 *  GET /api/admin/bots — all bot trades across all users
 *  Query: ?page=1&limit=50
 * ============================================================ */
router.get("/bots", async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string) || 50));

    const pipeline: any[] = [
      { $unwind: "$trades" },
      {
        $project: {
          _id: 0,
          firebaseUid: "$firebaseUid",
          userName: "$name",
          userEmail: "$email",
          id: "$trades.id",
          botName: "$trades.botName",
          asset: "$trades.asset",
          profit: "$trades.profit",
          timestamp: "$trades.timestamp",
        },
      },
      { $sort: { id: -1 } },
    ];

    const countRes = await User.aggregate([...pipeline, { $count: "total" }]);
    const total = countRes[0]?.total || 0;

    pipeline.push({ $skip: (page - 1) * limit }, { $limit: limit });
    const trades = await User.aggregate(pipeline);

    return res.json({
      success: true,
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      trades,
    });
  } catch (err: any) {
    console.error("Bots list error:", err);
    return res.status(500).json({ success: false, message: "Failed to load bot trades" });
  }
});

/* ============================================================
 *  GET /api/admin/logs — audit trail
 *  Query: ?page=1&limit=50
 * ============================================================ */
router.get("/logs", async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string) || 50));

    const total = await AdminLog.countDocuments({});
    const logs = await AdminLog.find({})
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    return res.json({
      success: true,
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      logs,
    });
  } catch (err: any) {
    console.error("Logs list error:", err);
    return res.status(500).json({ success: false, message: "Failed to load logs" });
  }
});

export default router;
