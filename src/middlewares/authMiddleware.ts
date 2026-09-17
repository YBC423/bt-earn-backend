import { Request, Response, NextFunction } from "express";
import admin from "firebase-admin";

declare global {
  namespace Express {
    interface Request {
      verifiedFirebaseUid?: string;
      verifiedEmail?: string;
    }
  }
}

export async function verifyFirebaseToken(
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

    const decodedToken = await admin.auth().verifyIdToken(idToken);

    req.verifiedFirebaseUid = decodedToken.uid;
    req.verifiedEmail = decodedToken.email || "";

    next();
  } catch (err: any) {
    console.error("Token verification failed:", err.message);
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
}