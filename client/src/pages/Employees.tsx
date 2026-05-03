/**
 * Employees — directory + drill-down per person.
 *
 * /employees           → list of all known employees grouped by team
 * /employees/:slug     → individual scorecard for one person
 *
 * Pulls the same data the dashboard already has — no new endpoint required.
 */
import { useMemo } from "react";
import { Link, useRoute } from "wouter";
import { Card, PageHeader, Section, StoplightBadge } from "@/components/dash";
import { useKpi } from "@/components/KpiDataProvider";
import { AlertBanner } from "@/components/AlertBanner";
import { fmtMoney } from "@/lib/useKpiData";
import { ChevronRight, ArrowLeft, Users, Target, HandCoins } from "lucide-react";

interface Person {
  name: string;
  slug: string;
  role: "AQA" | "Lead Manager" | "Leadership";
  team: string;
}

const ROSTER: Person[] = [
  { name: "Korbin",   slug: "korbin",   role: "AQA",          team: "Acquisitions" },
  { name: "TJ",       slug: "tj",       role: "AQA",          team: "Acquisitions" },
  { name: "Ryan",     slug: "ryan",     role: "AQA",          team: "Acquisitions" },
  { name: "Brandon",  slug: "brandon",  role: "Lead Manager", team: "Acquisitions" },
  { name: "Jeff H",   slug: "jeff-h",   role: "Lead Manager", team: "Acquisitions" },
  { name: "Jonathan", slug: "jonathan", role: "Lead Manager", team: "Acquisitions" },
  { name: "Trey",     slug: "trey",     role: "Leadership",   team: "Leadership" },
  { name: "Jordan",   slug: "jordan",   role: "Leadership",   team: "Leadership" },
];

function personFromSlug(slug: string): Person | undefined {
  return ROSTER.find(p => p.slug === slug || p.name.toLowerCase() === slug.toLowerCase());
}

function statusColor(actual: number, target: number, lowerIsBetter = false): string {
  if (target === 0) return "hsl(var(--muted-foreground))";
  const ratio = actual / target;
  if (lowerIsBetter) {
    if (ratio <= 0.9) return "hsl(var(--status-green))";
    if (ratio <= 1.1) return "hsl(var(--status-amber))";
    return "hsl(var(--status-red))";
  }
  if (ratio >= 1.0) return "hsl(var(--status-green))";
  if (ratio >= 0.8) return "hsl(var(--status-amber))";
  return "hsl(var(--status-red))";
}

export default function Employees() {
  const [matchDetail, params] = useRoute("/employees/:slug");
  const slug = matchDetail ? params!.slug : null;

  if (slug) {
    return <EmployeeDetail slug={slug} />;
  }

  return <EmployeeList />;
}

function EmployeeList() {
  const groups: Record<string, Person[]> = {};
  for (const p of ROSTER) {
    if (!groups[p.team]) groups[p.team] = [];
    groups[p.team].push(p);
  }

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Company → Department → Person" title="Employees" />

      <AlertBanner />

      {Object.entries(groups).map(([team, people]) => (
        <Section key={team} title={team} subtitle={`${people.length} ${people.length === 1 ? "person" : "people"}`}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {people.map(p => (
              <Link key={p.slug} href={`/employees/${p.slug}`}>
                <Card padding="p-4" className="cursor-pointer hover:bg-accent/40 transition-colors">
                  <div className="flex items-center gap-3">
                    <div
                      className="h-10 w-10 rounded-full flex items-center justify-center text-white font-bold"
                      style={{ backgroundColor: "hsl(var(--baby-blue-600))" }}
                    >
                      {p.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm truncate">{p.name}</div>
                      <div className="text-[11px] text-muted-foreground">{p.role}</div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </Section>
      ))}
    </div>
  );
}

function EmployeeDetail({ slug }: { slug: string }) {
  const data = useKpi();
  const person = personFromSlug(slug);

  // Collect data for this person from all sources
  const acqAgent = data.acquisitionsActivity?.agents?.find(
    a => a.agent.toLowerCase() === (person?.name.toLowerCase() || slug.toLowerCase())
  );
  const spendRow = data.marketingSpendDetail?.byAgent?.find(
    s => s.name.toLowerCase() === (person?.name.toLowerCase() || slug.toLowerCase())
  );
  const lmRise = (data.salesWeekly?.leadManagers as any)?.[person?.name || ""] ||
                 (data.salesWeekly?.leadManagers as any)?.[(person?.name || "") + " "];
  const aqRise = (data.salesWeekly?.aqAgents as any)?.[person?.name || ""];

  // KPIs this person owns
  const ownedKpis = useMemo(() => {
    const map = data.kpiOwnership?.map || [];
    if (!person) return [];
    const ownerLower = person.name.toLowerCase();
    return map.filter(k => {
      const o = k.owners.toLowerCase();
      return o.includes(ownerLower) ||
             (person.role === "AQA" && k.team.toLowerCase().includes("aqa")) ||
             (person.role === "Lead Manager" && k.team.toLowerCase().includes("lead manager"));
    });
  }, [data.kpiOwnership, person]);

  if (!person) {
    return (
      <div className="space-y-4">
        <PageHeader title="Not found" />
        <Card>
          <div>Employee "{slug}" not found.</div>
          <Link href="/employees" className="text-primary underline text-sm mt-2 inline-block">← Back to employees</Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link href="/employees" className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-3.5 w-3.5" /> All employees
      </Link>

      <div className="flex items-center gap-4">
        <div
          className="h-16 w-16 rounded-full flex items-center justify-center text-white text-2xl font-bold"
          style={{ backgroundColor: "hsl(var(--baby-blue-600))" }}
        >
          {person.name.charAt(0).toUpperCase()}
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.16em] font-semibold" style={{ color: "hsl(var(--baby-blue-500))" }}>
            {person.role} · {person.team}
          </div>
          <h1 className="text-2xl font-bold">{person.name}</h1>
        </div>
      </div>

      <AlertBanner filterPersons={[person.name]} />

      {/* Activity tile (AQA / Lead Mgr) */}
      {acqAgent && (
        <Section title="Daily Activity (90-day window)">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatTile
              label="Avg Talk Time / Day"
              value={`${acqAgent.avgTalkTime} min`}
              target={acqAgent.target?.talkTime ?? 120}
              actual={acqAgent.avgTalkTime}
            />
            <StatTile
              label="Avg Touch Points / Day"
              value={`${acqAgent.avgTouchPoints}`}
              target={acqAgent.target?.touchPoints ?? 70}
              actual={acqAgent.avgTouchPoints}
            />
            <StatTile
              label="Avg Appts Set / Day"
              value={`${acqAgent.avgApptsSet}`}
              target={acqAgent.target?.apptsSet ?? 2}
              actual={acqAgent.avgApptsSet}
            />
            <StatTile
              label="Days Active"
              value={`${acqAgent.days}`}
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-3">
            <MiniTile icon={<Target className="h-3.5 w-3.5" />} label="Drive (min)"      value={acqAgent.driveTime} />
            <MiniTile icon={<Target className="h-3.5 w-3.5" />} label="Windshield (min)" value={acqAgent.windshieldTime} />
            <MiniTile label="Appts Attended"  value={acqAgent.apptsAttended} />
            <MiniTile label="Offers Made"     value={acqAgent.offers} />
            <MiniTile label="Contracts"       value={acqAgent.contracts} highlight />
          </div>
        </Section>
      )}

      {/* Weekly RISE (LM) */}
      {lmRise && (
        <Section title="Weekly RISE — Lead Manager">
          <Card padding="p-4">
            <RiseTable rise={lmRise} />
          </Card>
        </Section>
      )}

      {/* Weekly RISE (AQ) */}
      {aqRise && (
        <Section title="Weekly RISE — Acquisitions">
          <Card padding="p-4">
            <RiseTable rise={aqRise} />
          </Card>
        </Section>
      )}

      {/* Spend / ROAS (only if attributed) */}
      {spendRow && spendRow.spend > 0 && (
        <Section title="Marketing Attribution">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MiniTile icon={<HandCoins className="h-3.5 w-3.5" />} label="Spend"  value={fmtMoney(spendRow.spend)} />
            <MiniTile label="Profit"     value={fmtMoney(spendRow.profit)} />
            <MiniTile label="Leads Attributed" value={spendRow.leads} />
            <MiniTile label="ROAS"       value={spendRow.roas > 0 ? `${spendRow.roas.toFixed(2)}x` : "—"} highlight />
          </div>
        </Section>
      )}

      {/* KPIs owned */}
      {ownedKpis.length > 0 && (
        <Section title="KPIs This Person Owns" subtitle={`${ownedKpis.length} indicators`}>
          <Card padding="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground border-b">
                    <th className="text-left p-3">KPI</th>
                    <th className="text-left p-3">Cadence</th>
                    <th className="text-left p-3">Target</th>
                    <th className="text-left p-3">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {ownedKpis.map((k, i) => (
                    <tr key={i} className="border-b last:border-b-0">
                      <td className="p-3 font-medium">{k.kpi}</td>
                      <td className="p-3">{k.cadence}</td>
                      <td className="p-3 tabular-nums">{k.target || "—"}</td>
                      <td className="p-3 text-muted-foreground">{k.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </Section>
      )}

      {!acqAgent && !lmRise && !aqRise && !spendRow && (
        <Card><div className="text-sm text-muted-foreground">No detailed metrics available yet for {person.name}.</div></Card>
      )}
    </div>
  );
}

function StatTile({ label, value, actual, target }: { label: string; value: string; actual?: number; target?: number; }) {
  const color = (target && actual !== undefined) ? statusColor(actual, target) : "hsl(var(--foreground))";
  return (
    <Card padding="p-4">
      <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-semibold">{label}</div>
      <div className="text-2xl font-bold mt-1 tabular-nums" style={{ color }}>{value}</div>
      {target !== undefined && (
        <div className="text-[10px] text-muted-foreground mt-1">Target: {target}</div>
      )}
    </Card>
  );
}

function MiniTile({
  icon, label, value, highlight,
}: { icon?: React.ReactNode; label: string; value: any; highlight?: boolean; }) {
  return (
    <Card padding="p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-semibold">
        {icon}{label}
      </div>
      <div className={`text-lg font-semibold mt-1 tabular-nums ${highlight ? "text-primary" : ""}`}>{value}</div>
    </Card>
  );
}

function RiseTable({ rise }: { rise: any }) {
  const entries = Object.entries(rise) as [string, { actual: number; target: number }][];
  const labelMap: Record<string, string> = {
    appts_scheduled: "Appts Scheduled",
    appts_from_old_leads: "Appts from Old Leads",
    appts_cancelled: "Appts Cancelled",
    talk_time_hrs: "Talk Time (hrs)",
    touch_points_new: "Touch Points (New)",
    touch_points_hot: "Touch Points (Hot/Warm)",
    touch_points_followup: "Touch Points (Followup)",
    appts_executed: "Appts Executed",
    offers_made: "Offers Made",
    contracts: "Contracts",
    touch_points: "Touch Points",
    content_video: "Content / Video",
    matterports_missed: "Matterports Missed",
  };
  const lowerBetter = new Set(["appts_cancelled", "matterports_missed"]);

  return (
    <table className="w-full text-[12px]">
      <thead>
        <tr className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground border-b">
          <th className="text-left py-2">Metric</th>
          <th className="text-right py-2">Latest</th>
          <th className="text-right py-2">Target</th>
        </tr>
      </thead>
      <tbody>
        {entries.map(([k, v]) => {
          const color = statusColor(v.actual, v.target, lowerBetter.has(k));
          return (
            <tr key={k} className="border-b last:border-b-0">
              <td className="py-2">{labelMap[k] || k}</td>
              <td className="py-2 text-right tabular-nums font-semibold" style={{ color }}>{v.actual}</td>
              <td className="py-2 text-right tabular-nums opacity-70">{v.target}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
