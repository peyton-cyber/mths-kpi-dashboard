/**
 * Email escalation via Resend HTTP API.
 *
 * Resend is preferred over SendGrid because it has zero SDK weight and
 * a simple JSON POST works from any host. Set RESEND_API_KEY in env;
 * if it's missing, sendEmail logs and returns false (no crash).
 *
 * Recipients for red-streak escalation: trey, jordan, peyton.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

const ESCALATION_FROM = process.env.ESCALATION_FROM || "MTHS KPI Bot <onboarding@resend.dev>";
export const ESCALATION_RECIPIENTS = (process.env.ESCALATION_RECIPIENTS ||
  "trey@mytennesseehomesolution.com,jordan@mytennesseehomesolution.com,peyton@mytennesseehomesolution.com")
  .split(",").map(s => s.trim()).filter(Boolean);

export interface EmailResult {
  ok: boolean;
  id?: string;
  error?: string;
  skipped?: boolean;
}

export async function sendEmail(args: {
  to: string[];
  subject: string;
  html: string;
  text?: string;
}): Promise<EmailResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`[email] skipped (RESEND_API_KEY not set) → ${args.to.join(", ")}: ${args.subject}`);
    return { ok: false, skipped: true, error: "RESEND_API_KEY not configured" };
  }
  try {
    const resp = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: ESCALATION_FROM,
        to: args.to,
        subject: args.subject,
        html: args.html,
        text: args.text || args.html.replace(/<[^>]+>/g, ""),
      }),
    });
    const body: any = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      console.error(`[email] failed ${resp.status}: ${JSON.stringify(body).slice(0, 300)}`);
      return { ok: false, error: body?.message || `HTTP ${resp.status}` };
    }
    console.log(`[email] sent → ${args.to.join(", ")}: ${args.subject} (id=${body.id})`);
    return { ok: true, id: body.id };
  } catch (err: any) {
    console.error(`[email] error: ${err.message?.slice(0, 200)}`);
    return { ok: false, error: err.message };
  }
}

/**
 * Compose escalation email for an unacknowledged red-streak alert.
 */
export function composeRedStreakEmail(alert: {
  person: string;
  metric: string;
  target: string;
  streak: number;
  weeksRed: string[];
  latestActual: string;
  severity: string;
}): { subject: string; html: string } {
  const sevLabel = alert.severity === "week3" ? "WEEK-3 RED" : "DAY-3 RED";
  const subject = `[${sevLabel}] ${alert.person} — ${alert.metric} (${alert.streak} consecutive)`;
  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f8fafc">
      <div style="background:#fff;border-radius:12px;padding:24px;border-left:4px solid #dc2626">
        <div style="text-transform:uppercase;letter-spacing:1.5px;font-size:11px;color:#dc2626;font-weight:700">${sevLabel} ALERT</div>
        <h1 style="margin:8px 0 16px;font-size:20px;color:#0f172a">${alert.person} — ${alert.metric}</h1>
        <table style="width:100%;border-collapse:collapse;font-size:14px;color:#334155">
          <tr><td style="padding:6px 0;color:#64748b">Streak</td><td style="font-weight:600;color:#0f172a">${alert.streak} consecutive ${alert.severity === "week3" ? "weeks" : "days"} below target</td></tr>
          <tr><td style="padding:6px 0;color:#64748b">Latest actual</td><td style="font-weight:600;color:#0f172a">${alert.latestActual}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b">Target</td><td style="font-weight:600;color:#0f172a">${alert.target}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b">Periods red</td><td style="color:#0f172a">${alert.weeksRed.join(", ")}</td></tr>
        </table>
        <div style="margin-top:20px;padding:14px;background:#fef2f2;border-radius:8px;font-size:13px;color:#991b1b">
          ⚠ This metric has been red for ${alert.streak} ${alert.severity === "week3" ? "weeks" : "days"} in a row and has not been acknowledged on the dashboard.
        </div>
        <a href="https://mths-kpi-dashboard.netlify.app/acquisitions"
           style="display:inline-block;margin-top:20px;padding:10px 20px;background:#0ea5e9;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">
          Open dashboard →
        </a>
        <p style="margin-top:24px;font-size:12px;color:#94a3b8">Sent automatically by MTHS KPI Dashboard. Acknowledge the alert on the dashboard to stop future escalations for this streak.</p>
      </div>
    </div>
  `.trim();
  return { subject, html };
}
