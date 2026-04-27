import type { Express } from "express";
import { createServer, type Server } from "http";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { getKpiData, invalidateCache, waitForBackgroundFetch } from "./sheets";
import {
  isAllowedDomain,
  verifyAccessCode,
  getAccessCode,
  setAccessCode,
  requireAuth,
  requireAdmin,
  createSession,
  destroySession,
} from "./auth";
import { storage } from "./storage";
import { DEPARTMENTS } from "@shared/schema";

// ─── Input validation helpers ───────────────────────────────────────────
const VALID_DEPARTMENTS = new Set(DEPARTMENTS);

function sanitizeDepartments(raw: string): string | null {
  if (typeof raw !== "string" || raw.length > 200) return null;
  const parts = raw
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
  if (parts.length === 0 || !parts.every((d) => VALID_DEPARTMENTS.has(d as any))) {
    return null;
  }
  return parts.join(",");
}

function safeParseId(raw: string): number | null {
  const id = parseInt(raw, 10);
  if (isNaN(id) || id <= 0 || id > 2147483647) return null;
  return id;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // ─── CORS ──────────────────────────────────────────────────────────────
  // When the frontend is hosted on a different origin (Netlify) than the API
  // (Render), the browser sends cross-origin requests that need CORS headers.
  // CORS_ALLOWED_ORIGINS env var is a comma-separated allowlist; if unset, we
  // allow same-origin only (legacy single-origin deploy still works).
  const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (allowedOrigins.length > 0) {
    app.use((req, res, next) => {
      const origin = req.headers.origin;
      if (origin && allowedOrigins.includes(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Vary", "Origin");
        res.setHeader("Access-Control-Allow-Credentials", "true");
        res.setHeader(
          "Access-Control-Allow-Methods",
          "GET,POST,PUT,PATCH,DELETE,OPTIONS"
        );
        res.setHeader(
          "Access-Control-Allow-Headers",
          "Content-Type, Authorization"
        );
        res.setHeader("Access-Control-Max-Age", "86400");
        if (req.method === "OPTIONS") {
          res.status(204).end();
          return;
        }
      }
      next();
    });
    console.log(`[cors] Allowing origins: ${allowedOrigins.join(", ")}`);
  }

  // ─── Security headers via Helmet ────────────────────────────────────
  app.use(
    helmet({
      contentSecurityPolicy: false,
      frameguard: false,
      noSniff: true,
      xssFilter: true,
      hidePoweredBy: true,
      hsts: { maxAge: 31536000, includeSubDomains: true },
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    })
  );

  // ─── Rate limiting ──────────────────────────────────────────────────
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: "Too many login attempts. Please try again later." },
    standardHeaders: true,
    legacyHeaders: false,
  });

  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    message: { error: "Too many requests. Please slow down." },
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.use("/api/", apiLimiter);
  app.use("/api/auth/login", authLimiter);

  // ─── Auth routes ────────────────────────────────────────────────────

  // Login with email + access code → returns bearer token
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, accessCode } = req.body;

      if (!email || typeof email !== "string") {
        res.status(400).json({ error: "Email is required" });
        return;
      }
      if (!accessCode || typeof accessCode !== "string") {
        res.status(400).json({ error: "Access code is required" });
        return;
      }

      const normalizedEmail = email.toLowerCase().trim();
      if (normalizedEmail.length > 254) {
        res.status(400).json({ error: "Invalid email" });
        return;
      }

      if (!isAllowedDomain(normalizedEmail)) {
        res.status(403).json({
          error: "Access restricted to @mytennesseehomesolution.com accounts only",
        });
        return;
      }

      if (!verifyAccessCode(accessCode)) {
        res.status(401).json({ error: "Invalid access code" });
        return;
      }

      // Extract name from email
      const localPart = normalizedEmail.split("@")[0];
      const name = localPart
        .split(/[._-]/)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");

      // Upsert user
      const user = storage.upsertUser({ email: normalizedEmail, name });

      // Create token
      const token = createSession(user.id);

      res.json({
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          picture: user.picture,
          departments: user.departments,
          isAdmin: user.isAdmin,
        },
      });
    } catch (err: any) {
      console.error("Auth error");
      res.status(500).json({ error: "Authentication failed" });
    }
  });

  // Get current user (requires token)
  app.get("/api/auth/me", requireAuth, (req, res) => {
    const user = (req as any).user;
    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        picture: user.picture,
        departments: user.departments,
        isAdmin: user.isAdmin,
      },
    });
  });

  // Logout — destroy token
  app.post("/api/auth/logout", (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      destroySession(authHeader.slice(7));
    }
    res.json({ ok: true });
  });

  // ─── Admin routes ───────────────────────────────────────────────────

  app.get("/api/admin/access-code", requireAuth, requireAdmin, (_req, res) => {
    res.json({ accessCode: getAccessCode() });
  });

  app.post("/api/admin/access-code", requireAuth, requireAdmin, (req, res) => {
    const { accessCode } = req.body;
    if (!accessCode || typeof accessCode !== "string" || accessCode.length < 4 || accessCode.length > 64) {
      res.status(400).json({ error: "Access code must be 4-64 characters" });
      return;
    }
    setAccessCode(accessCode);
    res.json({ ok: true });
  });

  app.get("/api/admin/users", requireAuth, requireAdmin, (_req, res) => {
    const allUsers = storage.getAllUsers();
    res.json(
      allUsers.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        picture: u.picture,
        departments: u.departments,
        isAdmin: u.isAdmin,
        lastLogin: u.lastLogin,
      }))
    );
  });

  app.patch(
    "/api/admin/users/:id/departments",
    requireAuth,
    requireAdmin,
    (req, res) => {
      const id = safeParseId(req.params.id);
      if (!id) { res.status(400).json({ error: "Invalid user ID" }); return; }
      const departments = sanitizeDepartments(req.body.departments);
      if (!departments) {
        res.status(400).json({ error: "Invalid departments." });
        return;
      }
      const user = storage.updateUserDepartments(id, departments);
      if (!user) { res.status(404).json({ error: "User not found" }); return; }
      res.json(user);
    }
  );

  app.patch(
    "/api/admin/users/:id/admin",
    requireAuth,
    requireAdmin,
    (req, res) => {
      const id = safeParseId(req.params.id);
      if (!id) { res.status(400).json({ error: "Invalid user ID" }); return; }
      const targetUser = storage.getUser(id);
      if (!targetUser) { res.status(404).json({ error: "User not found" }); return; }
      if (
        targetUser.email.toLowerCase() === "peyton@mytennesseehomesolution.com" &&
        !req.body.isAdmin
      ) {
        res.status(403).json({ error: "Cannot remove primary admin" });
        return;
      }
      const user = storage.updateUserAdmin(id, !!req.body.isAdmin);
      if (!user) { res.status(404).json({ error: "User not found" }); return; }
      res.json(user);
    }
  );

  app.delete(
    "/api/admin/users/:id",
    requireAuth,
    requireAdmin,
    (req, res) => {
      const id = safeParseId(req.params.id);
      if (!id) { res.status(400).json({ error: "Invalid user ID" }); return; }
      const targetUser = storage.getUser(id);
      if (!targetUser) { res.status(404).json({ error: "User not found" }); return; }
      if (targetUser.email.toLowerCase() === "peyton@mytennesseehomesolution.com") {
        res.status(403).json({ error: "Cannot delete primary admin" });
        return;
      }
      const requestingUser = (req as any).user;
      if (requestingUser?.id === id) {
        res.status(403).json({ error: "Cannot delete yourself" });
        return;
      }
      storage.deleteUser(id);
      res.json({ ok: true });
    }
  );

  // ─── KPI data routes ──────────────────────────────────────────────

  app.get("/api/kpi-data", requireAuth, (_req, res) => {
    try {
      const data = getKpiData();
      if (!data) {
        res.status(503).json({ error: "No data available yet — please try again in a moment" });
        return;
      }
      res.json(data);
    } catch (err: any) {
      console.error("Error fetching KPI data");
      res.status(500).json({ error: "Failed to fetch KPI data" });
    }
  });

  app.post("/api/kpi-data/refresh", requireAuth, async (_req, res) => {
    try {
      // Force a true refresh: invalidate, kick off the background fetch,
      // then WAIT for it to finish so the response carries the new lastUpdated
      // timestamp. Without the await, getKpiData() returns the old cached
      // payload and the UI's "Live · HH:MM" never advances.
      invalidateCache();
      getKpiData(); // triggers startBackgroundFetch() under the hood
      await waitForBackgroundFetch();
      const data = getKpiData();
      res.json(data);
    } catch (err: any) {
      console.error("Error refreshing KPI data");
      res.status(500).json({ error: "Failed to refresh" });
    }
  });

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  return httpServer;
}
