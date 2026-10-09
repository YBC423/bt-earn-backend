import { Request, Response, NextFunction } from "express";

declare global {
  namespace Express {
    interface Request {
      isJarvis?: boolean;
    }
  }
}

/**
 * Allows access if request has:
 *   - Valid X-Jarvis-Key header matching JARVIS_API_KEY env
 * Read-only — JARVIS is never allowed to write.
 */
export function requireJarvisKey(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const expected = process.env.JARVIS_API_KEY;
  if (!expected) {
    return res.status(500).json({
      success: false,
      message: "JARVIS_API_KEY not configured on server",
    });
  }

  const provided = (req.headers["x-jarvis-key"] as string) || "";
  if (!provided || provided !== expected) {
    return res.status(401).json({
      success: false,
      message: "Invalid JARVIS key",
    });
  }

  req.isJarvis = true;
  next();
}
