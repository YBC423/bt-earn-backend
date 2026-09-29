import { Router, Request, Response } from "express";
import admin from "firebase-admin";
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
  const body = rows.map((r) => headers.map((h) => csvEscape(r[h])).join(",")).join("\n");
  return headerLine + "\n" + body;
}

async function getVerifiedUids(uids: string[]): Promise<Set<string>> {
  const verified = new Set<string>();
  const chunks: string[][] = [];
  for (let i = 0; i < uids.length; i += 100) chunks.push(uids.slice(i, i + 100));
  for (const chunk of chunks) {
    try {
      const result = await admin.auth().getUsers(chunk.map((uid) => ({ uid })));
      for (const u of result.users) {
        if (u.emailVerified) verified.add(u.uid);
      }
    } catch (e) {
      console.error("getUsers batch failed:", e);
    }
  }
  return verified;
}

/* ============================================================
 *  All routes require verified admin
 * ============================================================ */
router.use(requireAdmin);

/* ============================================================
 *  GET /api/admin/me
 * ============================================================ */
router.get("/me", (req: Request, res: Response) => {
  return res.json({
    success: true,
    admin: { email: req.adminEmail, uid: req.adminFirebaseUid },
  });
});

/* ============================================================
 *  GET /api/admin/stats — dashboard summary
 * ============================================================ */
router.get("/stats", async (_req: Request, res: Response) => {
  try {
    const allUsers = await User.find({}).select("firebaseUid").lean();
    const uids = allUsers.map((u: any) => u.firebaseUid).filter(Boolean);
    const verifiedSet = await getVerifiedUids(uids);
    const verifiedUids = Array.from(verifiedSet);
    const verifiedCount = verifiedUids.length;

    const balanceAgg = await User.aggregate([
      { $match: { firebaseUid: { $in: verifiedUids } } },
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
      { $match: { firebaseUid: { $in: verifiedUids } } },
      { $unwind: { path: "$deposits", preserveNullAndEmptyArrays: false } },
      {
        $group: {
          _id: "$deposits.status",
          count: { $sum: 1 },
          total: { $sum: { $ifNull: ["$deposits.amount", 0] } },
        },
      },
    ]);
    const depositStats = {
      Pending: { count: 0, total: 0 },
      Approved: { count: 0, total: 0 },
      Rejected: { count: 0, total: 0 },
    };
    for (const d of depositAgg) {
      if (d._id === "Pending") depositStats.Pending = { count: d.count, total: d.total };
      else if (d._id === "Approved" || d._id === "Completed")
        depositStats.Approved = { count: d.count, total: d.total };
      else if (d._id === "Rejected")
        depositStats.Rejected = { count: d.count, total: d.total };
    }

    const withdrawAgg = await User.aggregate([
      { $match: { firebaseUid: { $in: verifiedUids } } },
      { $unwind: { path: "$withdrawals", preserveNullAndEmptyArrays: false } },
      {
        $group: {
          _id: "$withdrawals.status",
          count: { $sum: 1 },
          total: { $sum: { $ifNull: ["$withdrawals.amount", 0] } },
        },
      },
    ]);
    const withdrawStats = {
      Pending: { count: 0, total: 0 },
      Approved: { count: 0, total: 0 },
      Rejected: { count: 0, total: 0 },
    };
    for (const d of withdrawAgg) {
      if (d._id === "Pending") withdrawStats.Pending = { count: d.count, total: d.total };
      else if (d._id === "Approved" || d._id === "Completed")
        withdrawStats.Approved = { count: d.count, total: d.total };
      else if (d._id === "Rejected")
        withdrawStats.Rejected = { count: d.count, total: d.total };
    }

    const tradeAgg = await User.aggregate([
      { $match: { firebaseUid: { $in: verifiedUids } } },
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

    const bannedUsers = await User.countDocuments({
      firebaseUid: { $in: verifiedUids },
      status: "banned",
    });
    const activeUsers = verifiedCount - bannedUsers;

    const recentUsers = await User.find({ firebaseUid: { $in: verifiedUids } })
      .sort({ createdAt: -1 })
      .limit(5)
      .select("name email country status createdAt wallets.usdt")
      .lean();

    return res.json({
      success: true,
      stats: {
        totalUsers: verifiedCount,
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
 *  GET /api/admin/stats/wallets
 * ============================================================ */
router.get("/stats/wallets", async (_req: Request, res: Response) => {
  try {
    const allUsers = await User.find({}).select("firebaseUid").lean();
    const uids = allUsers.map((u: any) => u.firebaseUid).filter(Boolean);
    const verifiedSet = await getVerifiedUids(uids);
    const verifiedUids = Array.from(verifiedSet);

    const users = await User.find({ firebaseUid: { $in: verifiedUids } })
      .select("wallets")
      .lean();

    const totals: Record<string, number> = {};
    const holders: Record<string, number> = {};

    for (const u of users) {
      const w = (u as any).wallets || {};
      for (const key of Object.keys(w)) {
        const val = Number(w[key]) || 0;
        totals[key] = (totals[key] || 0) + val;
        if (val > 0) holders[key] = (holders[key] || 0) + 1;
      }
    }

    return res.json({ success: true, totals, holders });
  } catch (err: any) {
    console.error("Wallet totals error:", err);
    return res.status(500).json({ success: false, message: "Failed to load wallet totals" });
  }
});

/* ============================================================
 *  POST /api/admin/sync-users — backfill verified Firebase users into MongoDB
 * ============================================================ */
router.post("/sync-users", async (req: Request, res: Response) => {
  try {
    const created: string[] = [];
    const skipped: string[] = [];
    const errors: string[] = [];
    let totalVerified = 0;

    let nextPageToken: string | undefined;
    do {
      const listResult = await admin.auth().listUsers(1000, nextPageToken);
      for (const fbUser of listResult.users) {
        if (!fbUser.emailVerified) continue;
        totalVerified++;

        // Skip if already in MongoDB
        const exists = await User.findOne({ firebaseUid: fbUser.uid }).lean();
        if (exists) {
          skipped.push(fbUser.email || fbUser.uid);
          continue;
        }

        // Use Firebase displayName, fallback to email prefix, fallback to "User"
        const displayName =
          fbUser.displayName && fbUser.displayName.trim()
            ? fbUser.displayName.trim()
            : (fbUser.email ? fbUser.email.split("@")[0] : "User");

        try {
          await User.create({
            name: displayName,
            email: (fbUser.email || "").toLowerCase().trim(),
            country: "Not set",
            firebaseUid: fbUser.uid,
            balance: 0,
            wallets: { usdt: 0, btc: 0, eth: 0, ngn: 0 },
            deposits: [],
            withdrawals: [],
            converts: [],
            trades: [],
            tradeBots: [],
            loginHistory: [],
            lastLogin: null,
            totalProfit: 0,
            status: "active",
          });
          created.push(fbUser.email || fbUser.uid);
        } catch (e: any) {
          // Handle duplicate key errors gracefully
          if (e?.code === 11000) {
            skipped.push(fbUser.email || fbUser.uid);
          } else {
            console.error("Create user failed:", e);
            errors.push(`${fbUser.email || fbUser.uid}: ${e?.message || e}`);
          }
        }
      }
      nextPageToken = listResult.pageToken;
    } while (nextPageToken);

    await writeLog(req, "SYNC_VERIFIED_USERS", "system", {
      metadata: {
        totalVerified,
        created: created.length,
        skipped: skipped.length,
        errors: errors.length,
      },
      reason: `Backfilled ${created.length} verified user(s) into MongoDB`,
    });

    return res.json({
      success: true,
      message: `Synced ${created.length} new user(s). Skipped ${skipped.length} (already in DB). Total verified: ${totalVerified}.`,
      created,
      skipped,
      errors,
      totalVerified,
    });
  } catch (err: any) {
    console.error("Sync users error:", err);
    return res.status(500).json({ success: false, message: "Sync failed: " + (err?.message || err) });
  }
});

/* ============================================================
 *  GET /api/admin/users
 * ============================================================ */
router.get("/users", async (req: Request, res: Response) => {
  try {
    const q = ((req.query.q as string) || "").trim();
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

    const allCandidates = await User.find(filter)
      .sort({ createdAt: -1 })
      .select("name email country status firebaseUid wallets balance totalProfit createdAt lastLogin")
      .lean();

    const uids = allCandidates.map((u: any) => u.firebaseUid).filter(Boolean);
    const verifiedSet = await getVerifiedUids(uids);

    const verifiedUsers = allCandidates.filter((u: any) => verifiedSet.has(u.firebaseUid));
    const total = verifiedUsers.length;
    const start = (page - 1) * limit;
    const users = verifiedUsers.slice(start, start + limit);

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
 *  GET /api/admin/users/export — CSV
 * ============================================================ */
router.get("/users/export", async (_req: Request, res: Response) => {
  try {
    const all = await User.find({})
      .sort({ createdAt: -1 })
      .select("name email country status firebaseUid wallets balance totalProfit createdAt")
      .lean();

    const uids = all.map((u: any) => u.firebaseUid).filter(Boolean);
    const verifiedSet = await getVerifiedUids(uids);
    const verified = all.filter((u: any) => verifiedSet.has(u.firebaseUid));

    const walletKeys = new Set<string>();
    for (const u of verified) {
      const w = (u as any).wallets || {};
      Object.keys(w).forEach((k) => walletKeys.add(k));
    }
    const walletHeaders = Array.from(walletKeys);

    const rows = verified.map((u: any) => {
      const base: any = {
        name: u.name,
        email: u.email,
        country: u.country,
        status: u.status,
        firebaseUid: u.firebaseUid,
      };
      for (const k of walletHeaders) {
        base[`wallet_${k}`] = (u.wallets && u.wallets[k]) || 0;
      }
      base.balance = u.balance || 0;
      base.totalProfit = u.totalProfit || 0;
      base.createdAt = u.createdAt;
      return base;
    });

    const headers = [
      "name",
      "email",
      "country",
      "status",
      "firebaseUid",
      ...walletHeaders.map((k) => `wallet_${k}`),
      "balance",
      "totalProfit",
      "createdAt",
    ];

    const csv = toCsv(rows, headers);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=bt-earn-users-${Date.now()}.csv`
    );
    return res.send(csv);
  } catch (err: any) {
    console.error("Users export error:", err);
    return res.status(500).json({ success: false, message: "Export failed" });
  }
});

/* ============================================================
 *  GET /api/admin/users/:uid — full user detail
 * ============================================================ */
router.get("/users/:uid", async (req: Request, res: Response) => {
  try {
    try {
      const fbUser = await admin.auth().getUser(req.params.uid);
      if (!fbUser.emailVerified) {
        return res.status(403).json({
          success: false,
          message: "This user has not verified their email. Hidden from admin.",
        });
      }
    } catch (e) {
      return res.status(404).json({
        success: false,
        message: "User not found in Firebase",
      });
    }

    const user = await User.findOne({ firebaseUid: req.params.uid }).lean();
    if (!user)
      return res.status(404).json({ success: false, message: "User not found" });
    return res.json({ success: true, user });
  } catch (err: any) {
    console.error("User detail error:", err);
    return res.status(500).json({ success: false, message: "Failed to load user" });
  }
});

/* ============================================================
 *  DELETE /api/admin/users/:uid
 * ============================================================ */
router.delete("/users/:uid", async (req: Request, res: Response) => {
  try {
    const uid = req.params.uid;

    const mongoUser = await User.findOne({ firebaseUid: uid }).lean();
    if (!mongoUser) {
      return res.status(404).json({ success: false, message: "User not found in MongoDB" });
    }

    const email = (mongoUser as any).email || "";
    const name = (mongoUser as any).name || "";

    try {
      await admin.auth().deleteUser(uid);
    } catch (e: any) {
      if (e?.code !== "auth/user-not-found") {
        console.error("Firebase delete failed:", e);
        return res.status(500).json({
          success: false,
          message: "Failed to delete user from Firebase: " + (e?.message || e),
        });
      }
    }

    try {
      const admin_firestore = require("firebase-admin/firestore");
      const firestore = admin_firestore.getFirestore();
      await firestore.collection("users").doc(uid).delete();
    } catch (e: any) {
      console.warn("Firestore delete failed (continuing):", e?.message || e);
    }

    await User.deleteOne({ firebaseUid: uid });

    await writeLog(req, "DELETE_USER", "user", {
      targetId: uid,
      targetEmail: email,
      metadata: { name, email, deletedFrom: ["firebase", "firestore", "mongodb"] },
    });

    return res.json({
      success: true,
      message: `User ${email} deleted from Firebase, Firestore, and MongoDB. Email can sign up again.`,
    });
  } catch (err: any) {
    console.error("Delete user error:", err);
    return res.status(500).json({ success: false, message: "Delete failed: " + (err?.message || err) });
  }
});

/* ============================================================
 *  POST /api/admin/users/:uid/wallet
 * ============================================================ */
router.post("/users/:uid/wallet", async (req: Request, res: Response) => {
  try {
    const { field, action, amount, reason } = req.body || {};
    if (!field || typeof field !== "string") {
      return res.status(400).json({ success: false, message: "field is required" });
    }
    if (!["credit", "debit", "set"].includes(action)) {
      return res.status(400).json({ success: false, message: "action must be credit|debit|set" });
    }
    const amt = Number(amount);
    if (isNaN(amt) || amt < 0) {
      return res.status(400).json({ success: false, message: "amount must be a non-negative number" });
    }

    const user = await User.findOne({ firebaseUid: req.params.uid });
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    const wallets: any = user.wallets || {};
    const before = Number(wallets[field] || 0);

    let after = before;
    if (action === "credit") after = before + amt;
    else if (action === "debit") {
      if (before < amt) {
        return res.status(400).json({
          success: false,
          message: `Insufficient ${field.toUpperCase()}. User has ${before}.`,
        });
      }
      after = before - amt;
    } else if (action === "set") {
      after = amt;
    }

    wallets[field] = after;
    user.wallets = wallets;
    user.markModified("wallets");

    const balanceBefore = Number(user.balance || 0);
    let balanceAfter = balanceBefore;
    if (field === "usdt") {
      if (action === "credit") balanceAfter = balanceBefore + amt;
      else if (action === "debit") balanceAfter = Math.max(0, balanceBefore - amt);
      else if (action === "set") balanceAfter = amt;
      user.balance = balanceAfter;
    }

    await user.save();

    const actionLabel = action === "credit" ? "CREDIT_WALLET" : action === "debit" ? "DEBIT_WALLET" : "SET_WALLET";

    await writeLog(req, actionLabel, "user", {
      targetId: req.params.uid,
      targetEmail: user.email,
      amount: amt,
      asset: field.toUpperCase(),
      reason: reason || "",
      metadata: {
        field,
        action,
        before,
        after,
        balanceBefore,
        balanceAfter: field === "usdt" ? balanceAfter : undefined,
      },
    });

    return res.json({
      success: true,
      message: `${action.toUpperCase()} ${field.toUpperCase()} — new value: ${after}`,
      wallet: user.wallets,
      balance: user.balance,
    });
  } catch (err: any) {
    console.error("Wallet action error:", err);
    return res.status(500).json({ success: false, message: "Wallet action failed" });
  }
});

/* ============================================================
 *  POST /api/admin/users/:uid/status — ban / unban
 * ============================================================ */
router.post("/users/:uid/status", async (req: Request, res: Response) => {
  try {
    const { status, reason } = req.body || {};
    if (status !== "active" && status !== "banned") {
      return res.status(400).json({ success: false, message: "status must be 'active' or 'banned'" });
    }
    const user = await User.findOne({ firebaseUid: req.params.uid });
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    const previous = user.status;
    user.status = status;
    await user.save();

    await writeLog(req, status === "banned" ? "BAN_USER" : "UNBAN_USER", "user", {
      targetId: req.params.uid,
      targetEmail: user.email,
      reason: reason || "",
      metadata: { previousStatus: previous, newStatus: status },
    });

    return res.json({ success: true, message: `User status set to ${status}` });
  } catch (err: any) {
    console.error("Status error:", err);
    return res.status(500).json({ success: false, message: "Status update failed" });
  }
});

/* ============================================================
 *  GET /api/admin/deposits
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

    const raw = await User.aggregate(pipeline);
    const uids = Array.from(new Set(raw.map((r: any) => r.firebaseUid).filter(Boolean)));
    const verifiedSet = await getVerifiedUids(uids);
    const filtered = raw.filter((r: any) => verifiedSet.has(r.firebaseUid));

    const total = filtered.length;
    const start = (page - 1) * limit;
    const deposits = filtered.slice(start, start + limit);

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
 * ============================================================ */
router.post("/deposits/:uid/:depositId/approve", async (req: Request, res: Response) => {
  try {
    const depositId = Number(req.params.depositId);
    const user = await User.findOne({ firebaseUid: req.params.uid });
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    const deposit: any = (user.deposits || []).find((d: any) => Number(d.id) === depositId);
    if (!deposit) return res.status(404).json({ success: false, message: "Deposit not found" });

    if (deposit.status === "Approved")
      return res.status(400).json({ success: false, message: "Deposit already approved" });
    if (deposit.status === "Rejected")
      return res.status(400).json({ success: false, message: "Deposit was rejected — cannot approve" });

    const amt = Number(deposit.amount || 0);

    deposit.status = "Approved";
    user.markModified("deposits");

    const wallets: any = user.wallets || {};
    const walletBefore = Number(wallets.usdt || 0);
    const walletAfter = walletBefore + amt;
    wallets.usdt = walletAfter;
    user.wallets = wallets;
    user.markModified("wallets");

    const balanceBefore = Number(user.balance || 0);
    const balanceAfter = balanceBefore + amt;
    user.balance = balanceAfter;

    await user.save();

    await writeLog(req, "APPROVE_DEPOSIT", "deposit", {
      targetId: String(depositId),
      targetEmail: user.email,
      amount: amt,
      asset: "USDT",
      reason: (req.body?.reason as string) || "",
      metadata: {
        depositId,
        txId: deposit.txId,
        originalAsset: deposit.asset,
        walletBefore,
        walletAfter,
        balanceBefore,
        balanceAfter,
      },
    });

    return res.json({
      success: true,
      message: `Deposit approved. $${amt.toFixed(2)} credited as USDT.`,
      newUsdt: walletAfter,
      newBalance: balanceAfter,
    });
  } catch (err: any) {
    console.error("Approve deposit error:", err);
    return res.status(500).json({ success: false, message: "Approval failed" });
  }
});

/* ============================================================
 *  POST /api/admin/deposits/:uid/:depositId/reject
 * ============================================================ */
router.post("/deposits/:uid/:depositId/reject", async (req: Request, res: Response) => {
  try {
    const depositId = Number(req.params.depositId);
    const user = await User.findOne({ firebaseUid: req.params.uid });
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    const deposit: any = (user.deposits || []).find((d: any) => Number(d.id) === depositId);
    if (!deposit) return res.status(404).json({ success: false, message: "Deposit not found" });

    if (deposit.status === "Rejected")
      return res.status(400).json({ success: false, message: "Deposit already rejected" });
    if (deposit.status === "Approved")
      return res.status(400).json({ success: false, message: "Deposit was approved — cannot reject" });

    deposit.status = "Rejected";
    user.markModified("deposits");
    await user.save();

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
 *  GET /api/admin/withdrawals
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

    const raw = await User.aggregate(pipeline);
    const uids = Array.from(new Set(raw.map((r: any) => r.firebaseUid).filter(Boolean)));
    const verifiedSet = await getVerifiedUids(uids);
    const filtered = raw.filter((r: any) => verifiedSet.has(r.firebaseUid));

    const total = filtered.length;
    const start = (page - 1) * limit;
    const withdrawals = filtered.slice(start, start + limit);

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
 * ============================================================ */
router.post("/withdrawals/:uid/:withdrawalId/approve", async (req: Request, res: Response) => {
  try {
    const wid = Number(req.params.withdrawalId);
    const user = await User.findOne({ firebaseUid: req.params.uid });
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    const w: any = (user.withdrawals || []).find((x: any) => Number(x.id) === wid);
    if (!w) return res.status(404).json({ success: false, message: "Withdrawal not found" });

    if (w.status === "Approved")
      return res.status(400).json({ success: false, message: "Withdrawal already approved" });
    if (w.status === "Rejected")
      return res.status(400).json({ success: false, message: "Withdrawal was rejected — cannot approve" });

    w.status = "Approved";
    user.markModified("withdrawals");
    await user.save();

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
 * ============================================================ */
router.post("/withdrawals/:uid/:withdrawalId/reject", async (req: Request, res: Response) => {
  try {
    const wid = Number(req.params.withdrawalId);
    const user = await User.findOne({ firebaseUid: req.params.uid });
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    const w: any = (user.withdrawals || []).find((x: any) => Number(x.id) === wid);
    if (!w) return res.status(404).json({ success: false, message: "Withdrawal not found" });

    if (w.status === "Rejected")
      return res.status(400).json({ success: false, message: "Withdrawal already rejected" });
    if (w.status === "Approved")
      return res.status(400).json({ success: false, message: "Withdrawal was approved — cannot reject" });

    const refundAmount = Number(w.amount || 0);

    w.status = "Rejected";
    user.markModified("withdrawals");

    const wallets: any = user.wallets || {};
    const walletBefore = Number(wallets.usdt || 0);
    const walletAfter = walletBefore + refundAmount;
    wallets.usdt = walletAfter;
    user.wallets = wallets;
    user.markModified("wallets");

    const balanceBefore = Number(user.balance || 0);
    const balanceAfter = balanceBefore + refundAmount;
    user.balance = balanceAfter;

    await user.save();

    await writeLog(req, "REJECT_WITHDRAWAL", "withdrawal", {
      targetId: String(wid),
      targetEmail: user.email,
      amount: refundAmount,
      asset: w.asset,
      reason: (req.body?.reason as string) || "",
      metadata: {
        withdrawalId: wid,
        txId: w.txId,
        refunded: true,
        walletBefore,
        walletAfter,
        balanceBefore,
        balanceAfter,
      },
    });

    return res.json({
      success: true,
      message: `Withdrawal rejected. $${refundAmount.toFixed(2)} refunded.`,
      newUsdt: walletAfter,
      newBalance: balanceAfter,
    });
  } catch (err: any) {
    console.error("Reject withdrawal error:", err);
    return res.status(500).json({ success: false, message: "Reject failed" });
  }
});

/* ============================================================
 *  GET /api/admin/converts
 * ============================================================ */
router.get("/converts", async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25));

    const pipeline: any[] = [
      { $unwind: "$converts" },
      {
        $project: {
          _id: 0,
          firebaseUid: "$firebaseUid",
          userName: "$name",
          userEmail: "$email",
          id: "$converts.id",
          fromSymbol: "$converts.fromSymbol",
          toSymbol: "$converts.toSymbol",
          fromAmount: "$converts.fromAmount",
          toAmount: "$converts.toAmount",
          usdValue: "$converts.usdValue",
          fee: "$converts.fee",
          dateTime: "$converts.dateTime",
        },
      },
      { $sort: { id: -1 } },
    ];

    const raw = await User.aggregate(pipeline);
    const uids = Array.from(new Set(raw.map((r: any) => r.firebaseUid).filter(Boolean)));
    const verifiedSet = await getVerifiedUids(uids);
    const filtered = raw.filter((r: any) => verifiedSet.has(r.firebaseUid));

    const total = filtered.length;
    const start = (page - 1) * limit;
    const converts = filtered.slice(start, start + limit);

    return res.json({
      success: true,
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      converts,
    });
  } catch (err: any) {
    console.error("Converts list error:", err);
    return res.status(500).json({ success: false, message: "Failed to load converts" });
  }
});

/* ============================================================
 *  GET /api/admin/bots
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

    const raw = await User.aggregate(pipeline);
    const uids = Array.from(new Set(raw.map((r: any) => r.firebaseUid).filter(Boolean)));
    const verifiedSet = await getVerifiedUids(uids);
    const filtered = raw.filter((r: any) => verifiedSet.has(r.firebaseUid));

    const total = filtered.length;
    const start = (page - 1) * limit;
    const trades = filtered.slice(start, start + limit);

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
