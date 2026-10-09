import { Request, Response, NextFunction } from "express";

declare global {
  namespace Express {
    interface Request {
      isJarvisWrite?: boolean;
    }
  }
}

/**
 * Requires a valid X-Jarvis-Key header AND JARVIS_ALLOW_WRITE=true env.
 * Used only for write routes (approve/reject).
 */
export function requireJarvisWrite(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const expected = process.env.JARVIS_API_KEY;
  const allowWrite = process.env.JARVIS_ALLOW_WRITE === "true";

  if (!expected) {
    return res.status(500).json({
      success: false,
      message: "JARVIS_API_KEY not configured",
    });
  }
  if (!allowWrite) {
    return res.status(403).json({
      success: false,
      message: "JARVIS write access is disabled",
    });
  }

  const provided = (req.headers["x-jarvis-key"] as string) || "";
  if (!provided || provided !== expected) {
    return res.status(401).json({
      success: false,
      message: "Invalid JARVIS key",
    });
  }

  req.isJarvisWrite = true;
  next();
}
