import { type User, type InsertUser, users } from "@shared/schema";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";

// Peyton is always admin
const ADMIN_EMAIL = "peyton@mytennesseehomesolution.com";

const sqlite = new Database("data.db");
sqlite.pragma("journal_mode = WAL");

export const db = drizzle(sqlite);

// Auto-create users table
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    picture TEXT,
    departments TEXT NOT NULL DEFAULT 'all',
    is_admin INTEGER NOT NULL DEFAULT 0,
    last_login TEXT
  )
`);

export interface IStorage {
  getUser(id: number): User | undefined;
  getUserByEmail(email: string): User | undefined;
  getAllUsers(): User[];
  upsertUser(user: { email: string; name: string; picture?: string }): User;
  updateUserDepartments(id: number, departments: string): User | undefined;
  updateUserAdmin(id: number, isAdmin: boolean): User | undefined;
  deleteUser(id: number): void;
}

export class DatabaseStorage implements IStorage {
  getUser(id: number): User | undefined {
    return db.select().from(users).where(eq(users.id, id)).get();
  }

  getUserByEmail(email: string): User | undefined {
    return db.select().from(users).where(eq(users.email, email)).get();
  }

  getAllUsers(): User[] {
    return db.select().from(users).all();
  }

  upsertUser(data: { email: string; name: string; picture?: string }): User {
    const existing = this.getUserByEmail(data.email);
    const now = new Date().toISOString();

    if (existing) {
      // Update name, picture, and last login
      // Also ensure Peyton always has admin
      const ensureAdmin = data.email.toLowerCase() === ADMIN_EMAIL ? 1 : (existing.isAdmin ? 1 : 0);
      sqlite.prepare(
        `UPDATE users SET name = ?, picture = ?, last_login = ?, is_admin = ? WHERE email = ?`
      ).run(data.name, data.picture ?? null, now, ensureAdmin, data.email);
      return this.getUserByEmail(data.email)!;
    }

    // Peyton is always admin; others start with "all" departments but no admin
    const makeAdmin = data.email.toLowerCase() === ADMIN_EMAIL;

    return db.insert(users).values({
      email: data.email,
      name: data.name,
      picture: data.picture ?? null,
      departments: "all",
      isAdmin: makeAdmin,
      lastLogin: now,
    }).returning().get();
  }

  updateUserDepartments(id: number, departments: string): User | undefined {
    sqlite.prepare(`UPDATE users SET departments = ? WHERE id = ?`).run(departments, id);
    return this.getUser(id);
  }

  updateUserAdmin(id: number, isAdmin: boolean): User | undefined {
    sqlite.prepare(`UPDATE users SET is_admin = ? WHERE id = ?`).run(isAdmin ? 1 : 0, id);
    return this.getUser(id);
  }

  deleteUser(id: number): void {
    // SECURITY: Never delete the primary admin at the storage level
    const user = this.getUser(id);
    if (user && user.email.toLowerCase() === ADMIN_EMAIL) {
      throw new Error("Cannot delete primary admin");
    }
    sqlite.prepare(`DELETE FROM users WHERE id = ?`).run(id);
  }
}

export const storage = new DatabaseStorage();
