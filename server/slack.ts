/**
 * Slack escalation via incoming webhook.
 *
 * Posts red-streak alerts to a dedicated channel (default #mths-kpi-alerts)
 * with @mentions for trey, jordan, and peyton. Configure via env:
 *
 *   SLACK_WEBHOOK_URL          — incoming webhook URL (required to actually send)
 *   SLACK_ALERT_CHANNEL        — channel name for display (default: #mths-kpi-alerts)
 *   SLACK_ALERT_MENTIONS       — Slack member IDs comma-separated, e.g. "U123,U456"
 *                                or @-handles, e.g. "@trey,@jordan,@peyton"
 *
 * If SLACK_WEBHOOK_URL is missing, postSlack logs and returns ok:false skipped:true
 * (no crash). This lets the rest of the pipeline run while Slack is being wired up.
 */

const DEFAULT_CHANNEL = process.env.SLACK_ALERT_CHANNEL || "#mths-kpi-alerts";
const RAW_MENTIONS = (process.env.SLACK_ALERT_MENTIONS || "@peyton,@trey,@jordan")
  .split(",").map(s => s.trim()).filter(Boolean);

function formatMention(m: string): string {
  // Slack member IDs look like U123ABC or W123ABC; wrap as <@USERID>
  if (/^[UW][A-Z0-9]{6,}$/.test(m)) return `<@${m}>`;
  // Otherwise treat as @handle — Slack does NOT auto-link these from webhooks,
  // so render as bold text. User can swap to member IDs for true pings.
  return `*${m.startsWith("@") ? m : "@" + m}*`;
}

export const SLACK_MENTIONS_FORMATTED = RAW_MENTIONS.map(formatMention).join(" ");
export const SLACK_ALERT_CHANNEL = DEFAULT_CHANNEL;

export interface SlackPostResult {
  ok: boolean;
  error?: string;
  skipped?: boolean;
}

/**
 * Post a Block Kit message to the configured webhook.
 */
export async function postSlack(args: {
  text: string;
  blocks?: any[];
}): Promise<SlackPostResult> {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) {
    console.log(`[slack] skipped (SLACK_WEBHOOK_URL not set) → ${args.text.slice(0, 120)}`);
    return { ok: false, skipped: true, error: "SLACK_WEBHOOK_URL not configured" };
  }
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: args.text,
        blocks: args.blocks,
      }),
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      console.error(`[slack] failed ${resp.status}: ${body.slice(0, 300)}`);
      return { ok: false, error: `HTTP ${resp.status}: ${body.slice(0, 200)}` };
    }
    console.log(`[slack] posted → ${args.text.slice(0, 120)}`);
    return { ok: true };
  } catch (err: any) {
    console.error(`[slack] error: ${err.message?.slice(0, 200)}`);
    return { ok: false, error: err.message };
  }
}

/**
 * Compose a Block Kit Slack message for an unacknowledged red-streak alert.
 */
export function composeRedStreakSlack(alert: {
  person: string;
  metric: string;
  target: string;
  streak: number;
  weeksRed: string[];
  latestActual: string;
  severity: string;
}): { text: string; blocks: any[] } {
  const sevLabel = alert.severity === "week3" ? "WEEK-3 RED" : "DAY-3 RED";
  const sevEmoji = alert.severity === "week3" ? ":rotating_light:" : ":warning:";
  const unit = alert.severity === "week3" ? "weeks" : "days";

  const text = `${sevEmoji} ${sevLabel} — ${alert.person}: ${alert.metric} (${alert.streak} ${unit})`;

  const blocks = [
    {
      type: "header",
      text: { type: "plain_text", text: `${sevEmoji} ${sevLabel} — ${alert.person}` },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${alert.metric}* has been red for *${alert.streak} consecutive ${unit}* and is unacknowledged.`,
      },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Latest actual:*\n${alert.latestActual}` },
        { type: "mrkdwn", text: `*Target:*\n${alert.target}` },
        { type: "mrkdwn", text: `*Streak:*\n${alert.streak} ${unit}` },
        { type: "mrkdwn", text: `*Periods red:*\n${alert.weeksRed.join(", ") || "—"}` },
      ],
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${SLACK_MENTIONS_FORMATTED} — please review and acknowledge on the dashboard.`,
      },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Open Dashboard" },
          url: "https://mths-kpi-dashboard.netlify.app/#/acquisitions",
          style: "primary",
        },
      ],
    },
    { type: "context", elements: [{ type: "mrkdwn", text: "Sent automatically by MTHS KPI Dashboard" }] },
  ];

  return { text, blocks };
}
