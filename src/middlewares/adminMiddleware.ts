import { Request, Response, NextFunction } from "express";
import admin from "firebase-admin";

declare global {
  namespace Express {
    interface Request {
      adminEmail?: string;
      adminFirebaseUid?: string;
    }
  }
}

/**
 * Requires a valid Firebase ID token AND the user's email must be
 * present in the ADMIN_EMAILS env var (comma-separated).
 *
 * Usage: router.get("/something", verifyFirebaseToken, requireAdmin, handler)
 */
export async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Missing or invalid Authorization header",
      });
    }

    const idToken = authHeader.split("Bearer ")[1].trim();
    if (!idToken) {
      return res.status(401).json({
        success: false,
        message: "Empty token",
      });
    }

    const decoded = await admin.auth().verifyIdToken(idToken);
    const email = (decoded.email || "").toLowerCase().trim();

    if (!email) {
      return res.status(403).json({
        success: false,
        message: "Admin account must have an email",
      });
    }

    const rawList = process.env.ADMIN_EMAILS || "";
    const adminEmails = rawList
      .split(",")
      .map((e) => e.toLowerCase().trim())
      .filter(Boolean);

    if (adminEmails.length === 0) {
      console.error("ADMIN_EMAILS env var is not set or empty");
      return res.status(500).json({
        success: false,
        message: "Server misconfigured (no admins)",
      });
    }

    if (!adminEmails.includes(email)) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You are not an admin.",
      });
    }

    req.adminEmail = email;
    req.adminFirebaseUid = decoded.uid;

    next();
  } catch (err: any) {
    console.error("Admin auth failed:", err?.message || err);
    return res.status(401).json({
      success: false,
      message: "Invalid or expired admin token",
    });
  }
}
