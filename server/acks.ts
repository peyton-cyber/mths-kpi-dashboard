/**
 * Acknowledgement workflow for KPI red-streak alerts.
 *
 * When a metric is flagged as Day-3 or Week-3 red, the dashboard surfaces
 * an Acknowledge button. Clicking it stores an ack record (who, when,
 * what, optional note) so we know the owner has seen the issue.
 *
 * If no ack arrives within ACK_DEADLINE_HRS hours of detection, the
 * email-escalation cron sends a follow-up to leadership.
 */
import Database from "better-sqlite3";

const sqlite = new Database("data.db");
sqlite.pragma("journal_mode = WAL");

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS kpi_acks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    alert_key TEXT NOT NULL UNIQUE,
    person TEXT NOT NULL,
    metric TEXT NOT NULL,
    severity TEXT NOT NULL,
    streak INTEGER NOT NULL,
    acknowledged_by TEXT NOT NULL,
    acknowledged_by_email TEXT NOT NULL,
    note TEXT,
    acknowledged_at TEXT NOT NULL
  )
`);

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS escalation_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    alert_key TEXT NOT NULL,
    sent_to TEXT NOT NULL,
    sent_at TEXT NOT NULL,
    subject TEXT
  )
`);

export interface Ack {
  alertKey: string;
  person: string;
  metric: string;
  severity: string;
  streak: number;
  acknowledgedBy: string;
  acknowledgedByEmail: string;
  note: string | null;
  acknowledgedAt: string;
}

export function alertKey(person: string, metric: string, severity: string): string {
  return `${severity}::${person.trim().toLowerCase()}::${metric.trim().toLowerCase()}`;
}

export function listAcks(): Ack[] {
  const rows = sqlite.prepare(`SELECT * FROM kpi_acks ORDER BY acknowledged_at DESC`).all() as any[];
  return rows.map(r => ({
    alertKey: r.alert_key,
    person: r.person,
    metric: r.metric,
    severity: r.severity,
    streak: r.streak,
    acknowledgedBy: r.acknowledged_by,
    acknowledgedByEmail: r.acknowledged_by_email,
    note: r.note,
    acknowledgedAt: r.acknowledged_at,
  }));
}

export function getAck(alertKey: string): Ack | null {
  const r = sqlite.prepare(`SELECT * FROM kpi_acks WHERE alert_key = ?`).get(alertKey) as any;
  if (!r) return null;
  return {
    alertKey: r.alert_key,
    person: r.person,
    metric: r.metric,
    severity: r.severity,
    streak: r.streak,
    acknowledgedBy: r.acknowledged_by,
    acknowledgedByEmail: r.acknowledged_by_email,
    note: r.note,
    acknowledgedAt: r.acknowledged_at,
  };
}

export function ackAlert(args: {
  alertKey: string;
  person: string;
  metric: string;
  severity: string;
  streak: number;
  acknowledgedBy: string;
  acknowledgedByEmail: string;
  note?: string;
}): Ack {
  const now = new Date().toISOString();
  sqlite.prepare(`
    INSERT INTO kpi_acks (alert_key, person, metric, severity, streak, acknowledged_by, acknowledged_by_email, note, acknowledged_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(alert_key) DO UPDATE SET
      acknowledged_by = excluded.acknowledged_by,
      acknowledged_by_email = excluded.acknowledged_by_email,
      note = excluded.note,
      acknowledged_at = excluded.acknowledged_at,
      streak = excluded.streak
  `).run(
    args.alertKey,
    args.person,
    args.metric,
    args.severity,
    args.streak,
    args.acknowledgedBy,
    args.acknowledgedByEmail,
    args.note ?? null,
    now,
  );
  return getAck(args.alertKey)!;
}

export function recordEscalation(alertKey: string, sentTo: string, subject: string) {
  sqlite.prepare(`
    INSERT INTO escalation_log (alert_key, sent_to, sent_at, subject)
    VALUES (?, ?, ?, ?)
  `).run(alertKey, sentTo, new Date().toISOString(), subject);
}

export function recentEscalation(alertKey: string, withinHrs = 24): boolean {
  const cutoff = new Date(Date.now() - withinHrs * 3600 * 1000).toISOString();
  const r = sqlite.prepare(
    `SELECT 1 FROM escalation_log WHERE alert_key = ? AND sent_at > ? LIMIT 1`
  ).get(alertKey, cutoff);
  return !!r;
}
