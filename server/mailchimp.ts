/**
 * Mailchimp integration — buyer email metrics for the KPI dashboard.
 *
 * Pulls from the primary "My Tennessee Home Solution" audience and the most
 * recent sent campaigns. Surfaces:
 *   - Total subscribers (active + cleaned + unsubscribed)
 *   - Audience-level open and click rates (lifetime, from /lists)
 *   - Campaign volume and recency
 *   - Recent campaign cards (subject, sent count, open/click rate, send date)
 *   - Weekly send volume + weekly aggregate open/click rate (last 12 weeks)
 *
 * Auth: HTTP Basic — username can be anything (we use "mths"), password is
 *       the API key. Server prefix is appended to subdomain (e.g. us14).
 */

const MAILCHIMP_DEFAULT_PREFIX = "us14";

export type MailchimpCampaign = {
  id: string;
  subjectLine: string;
  sendTime: string;
  emailsSent: number;
  opens: number;
  uniqueOpens: number;
  openRate: number;
  clicks: number;
  uniqueClicks: number;
  clickRate: number;
};

export type MailchimpData = {
  audienceName: string;
  totalSubscribers: number;
  activeSubscribers: number;
  unsubscribed: number;
  cleaned: number;
  audienceOpenRate: number; // 0-1
  audienceClickRate: number; // 0-1
  campaignCount: number;
  lastSentAt: string | null;
  recentCampaigns: MailchimpCampaign[]; // last 10 sent
  weeklyVolume: { weekStart: string; campaigns: number; emailsSent: number; avgOpenRate: number; avgClickRate: number }[];
  source: "mailchimp";
  fetchedAt: string;
  error?: string;
};

function authHeader(apiKey: string): string {
  return `Basic ${Buffer.from(`mths:${apiKey}`).toString("base64")}`;
}

function getServerPrefix(apiKey: string): string {
  // Mailchimp keys end with "-{prefix}" (e.g. "...-us14")
  const dashIdx = apiKey.lastIndexOf("-");
  if (dashIdx > 0 && dashIdx < apiKey.length - 1) {
    return apiKey.slice(dashIdx + 1);
  }
  return process.env.MAILCHIMP_SERVER_PREFIX || MAILCHIMP_DEFAULT_PREFIX;
}

function isoWeekStart(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + diff));
  return monday.toISOString().slice(0, 10);
}

export async function fetchMailchimpData(apiKey: string): Promise<MailchimpData> {
  const fetchedAt = new Date().toISOString();
  const empty: MailchimpData = {
    audienceName: "",
    totalSubscribers: 0,
    activeSubscribers: 0,
    unsubscribed: 0,
    cleaned: 0,
    audienceOpenRate: 0,
    audienceClickRate: 0,
    campaignCount: 0,
    lastSentAt: null,
    recentCampaigns: [],
    weeklyVolume: [],
    source: "mailchimp",
    fetchedAt,
  };

  if (!apiKey) {
    return { ...empty, error: "MAILCHIMP_API_KEY not configured" };
  }

  const prefix = getServerPrefix(apiKey);
  const base = `https://${prefix}.api.mailchimp.com/3.0`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);

    const headers = {
      Authorization: authHeader(apiKey),
      "Content-Type": "application/json",
    };

    // 1) Audience list (use first/primary list)
    const listsResp = await fetch(
      `${base}/lists?count=1&fields=lists.id,lists.name,lists.stats`,
      { headers, signal: controller.signal },
    );
    if (!listsResp.ok) {
      throw new Error(`Mailchimp /lists ${listsResp.status}: ${await listsResp.text()}`);
    }
    const listsData = await listsResp.json() as {
      lists?: Array<{
        id: string;
        name: string;
        stats?: {
          member_count?: number;
          unsubscribe_count?: number;
          cleaned_count?: number;
          campaign_count?: number;
          campaign_last_sent?: string;
          open_rate?: number;
          click_rate?: number;
        };
      }>;
    };
    const primary = listsData.lists?.[0];
    if (!primary) {
      clearTimeout(timer);
      return { ...empty, error: "No Mailchimp audiences found" };
    }
    const stats = primary.stats || {};
    const active = stats.member_count || 0;
    const unsub = stats.unsubscribe_count || 0;
    const cleaned = stats.cleaned_count || 0;

    // 2) Recent sent campaigns (last 50, we'll keep 10 newest in detail and
    //    aggregate the rest into the weekly bars).
    const campaignsResp = await fetch(
      `${base}/campaigns?count=50&status=sent&sort_field=send_time&sort_dir=DESC` +
        `&fields=campaigns.id,campaigns.settings.subject_line,campaigns.send_time,` +
        `campaigns.emails_sent,campaigns.report_summary`,
      { headers, signal: controller.signal },
    );
    if (!campaignsResp.ok) {
      throw new Error(`Mailchimp /campaigns ${campaignsResp.status}: ${await campaignsResp.text()}`);
    }
    const campaignsData = await campaignsResp.json() as {
      campaigns?: Array<{
        id: string;
        emails_sent?: number;
        send_time?: string;
        settings?: { subject_line?: string };
        report_summary?: {
          opens?: number;
          unique_opens?: number;
          open_rate?: number;
          clicks?: number;
          subscriber_clicks?: number;
          click_rate?: number;
        };
      }>;
    };
    clearTimeout(timer);

    const allCampaigns = (campaignsData.campaigns || []).map((c) => ({
      id: c.id,
      subjectLine: (c.settings?.subject_line || "").replace(/\*\|FNAME\|\*\s*-?\s*/g, "").trim() || "(no subject)",
      sendTime: c.send_time || "",
      emailsSent: c.emails_sent || 0,
      opens: c.report_summary?.opens || 0,
      uniqueOpens: c.report_summary?.unique_opens || 0,
      openRate: c.report_summary?.open_rate || 0,
      clicks: c.report_summary?.clicks || 0,
      uniqueClicks: c.report_summary?.subscriber_clicks || 0,
      clickRate: c.report_summary?.click_rate || 0,
    }));

    const recentCampaigns = allCampaigns.slice(0, 10);

    // Weekly aggregation — last 12 weeks
    const weekMap = new Map<string, { campaigns: number; emailsSent: number; openSum: number; clickSum: number; weight: number }>();
    const cutoff = Date.now() - 12 * 7 * 24 * 3600 * 1000;
    for (const c of allCampaigns) {
      if (!c.sendTime) continue;
      const ts = new Date(c.sendTime).getTime();
      if (isNaN(ts) || ts < cutoff) continue;
      const wk = isoWeekStart(c.sendTime);
      if (!wk) continue;
      const cur = weekMap.get(wk) || { campaigns: 0, emailsSent: 0, openSum: 0, clickSum: 0, weight: 0 };
      cur.campaigns++;
      cur.emailsSent += c.emailsSent;
      // Weight rates by emails sent so larger sends count more
      cur.openSum += c.openRate * c.emailsSent;
      cur.clickSum += c.clickRate * c.emailsSent;
      cur.weight += c.emailsSent;
      weekMap.set(wk, cur);
    }
    const weeklyVolume = Array.from(weekMap.entries())
      .map(([weekStart, s]) => ({
        weekStart,
        campaigns: s.campaigns,
        emailsSent: s.emailsSent,
        avgOpenRate: s.weight > 0 ? s.openSum / s.weight : 0,
        avgClickRate: s.weight > 0 ? s.clickSum / s.weight : 0,
      }))
      .sort((a, b) => a.weekStart.localeCompare(b.weekStart));

    return {
      audienceName: primary.name,
      totalSubscribers: active + unsub + cleaned,
      activeSubscribers: active,
      unsubscribed: unsub,
      cleaned,
      audienceOpenRate: stats.open_rate ? stats.open_rate / 100 : 0, // /lists returns percent (e.g. 33.2)
      audienceClickRate: stats.click_rate ? stats.click_rate / 100 : 0,
      campaignCount: stats.campaign_count || 0,
      lastSentAt: stats.campaign_last_sent || null,
      recentCampaigns,
      weeklyVolume,
      source: "mailchimp",
      fetchedAt,
    };
  } catch (e) {
    return {
      ...empty,
      error: `Mailchimp fetch failed: ${(e as Error).message}`,
    };
  }
}
