import type { Request, Response, NextFunction } from "express";
import { storage } from "./storage";
import crypto from "crypto";

// ─── Configuration ──────────────────────────────────────────────────────
const ALLOWED_DOMAIN = "mytennesseehomesolution.com";

// Company access code — stored in memory, set by admin
let ACCESS_CODE = process.env.ACCESS_CODE || "mths2026";

// ─── Token-based auth (no cookies needed — works in iframes) ────────────
// Map of token → { userId, createdAt }
const sessions = new Map<string, { userId: number; createdAt: number }>();

const MAX_SESSION_AGE = 24 * 60 * 60 * 1000; // 24 hours

// Clean expired sessions every hour
setInterval(() => {
  const now = Date.now();
  for (const [token, session] of sessions) {
    if (now - session.createdAt > MAX_SESSION_AGE) {
      sessions.delete(token);
    }
  }
}, 60 * 60 * 1000);

export function createSession(userId: number): string {
  const token = crypto.randomBytes(48).toString("hex");
  sessions.set(token, { userId, createdAt: Date.now() });
  return token;
}

export function destroySession(token: string): void {
  sessions.delete(token);
}

function getSessionFromRequest(req: Request): { userId: number; createdAt: number } | null {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  const session = sessions.get(token);
  if (!session) return null;
  // Check expiry
  if (Date.now() - session.createdAt > MAX_SESSION_AGE) {
    sessions.delete(token);
    return null;
  }
  return session;
}

// ─── Access code management ─────────────────────────────────────────────
export function getAccessCode(): string {
  return ACCESS_CODE;
}

export function setAccessCode(code: string): void {
  ACCESS_CODE = code;
}

// ─── Domain enforcement ─────────────────────────────────────────────────
export function isAllowedDomain(email: string): boolean {
  const normalizedEmail = email.toLowerCase().trim();
  if (!normalizedEmail.endsWith(`@${ALLOWED_DOMAIN}`)) return false;
  const atCount = (normalizedEmail.match(/@/g) || []).length;
  if (atCount !== 1) return false;
  const localPart = normalizedEmail.split("@")[0];
  if (!localPart || localPart.length === 0 || localPart.length > 64) return false;
  return true;
}

// ─── Verify access code ────────────────────────────────────────────────
export function verifyAccessCode(code: string): boolean {
  return code === ACCESS_CODE;
}

// ─── Auth middleware ─────────────────────────────────────────────────────

/** Require authenticated session (token-based) */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const session = getSessionFromRequest(req);
  if (!session) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const user = storage.getUser(session.userId);
  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }

  // Re-verify domain on every request
  if (!user.email.toLowerCase().endsWith(`@${ALLOWED_DOMAIN}`)) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  (req as any).user = user;
  (req as any).authToken = req.headers.authorization!.slice(7);
  next();
}

/** Require admin role */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user;
  if (!user?.isAdmin) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}
