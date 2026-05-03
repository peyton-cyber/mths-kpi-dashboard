// "So what" hover note for KPIs — Excel-comment style.
// Wrap a label with this component to expose a small (i) icon that reveals an
// explanatory tooltip on hover/focus. Use it next to every KPI title so managers
// understand purpose + significance without leaving the dashboard.
import type { ReactNode } from "react";

export function KpiTooltip({
  label,
  note,
  title,
}: {
  /** The visible KPI label */
  label: ReactNode;
  /** Body of the explanation: why this KPI matters, what number means */
  note: string;
  /** Optional bold heading inside the tooltip; defaults to the label string */
  title?: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span>{label}</span>
      <span className="kpi-tooltip" tabIndex={0} aria-label="What this KPI means">
        <span className="kpi-tooltip-icon" aria-hidden>i</span>
        <span role="tooltip" className="kpi-tooltip-bubble">
          <strong>{title ?? (typeof label === "string" ? label : "About this KPI")}</strong>
          {note}
        </span>
      </span>
    </span>
  );
}

// "So what" copy library — keeps definitions in one place so the team can refine
// them over time. Source: dashboard-design voice note (Trey, 5/2/2026).
export const KPI_NOTES = {
  ytd_revenue:
    "Cumulative gross revenue closed this year. The single largest indicator of company health — sustained shortfalls trigger a companywide Precision Protocol.",
  monthly_revenue:
    "Closed gross revenue for the active month against the Asana sprint goal. Monthly is our shortest cadence for course-correcting before the quarter is at risk.",
  pace_to_goal:
    "Where we'd land if today's pace held through year-end. Yellow/red here is an early warning that the annual revenue goal is slipping.",
  cash_conversion_cycle:
    "Days from lead created to deal closed. Long cycles tie up cash, slow capital recycling, and drag profit per deal. Each stage breakdown shows where deals get stuck.",
  ccc_lead_to_net:
    "Days from a lead first hitting our CRM to it being qualified as a 'net lead'. Long delays here usually mean lead manager response time is slipping.",
  ccc_net_to_apptSet:
    "Days from net lead to appointment scheduled. Reflects lead manager close rate and follow-up cadence — the upstream choke point for the whole pipeline.",
  ccc_apptSet_to_apptExec:
    "Days from appointment scheduled to executed. Long gaps mean we're booking too far out or losing seller confidence between booking and visit.",
  ccc_apptExec_to_uc:
    "Days from appointment executed to under contract. The acquisitions agent's primary close-window — short cycles here drive higher contract velocity.",
  ccc_uc_to_pushed:
    "Days from contract signed to pushed for disposition. Slow handoffs here add holding cost and reduce buyer urgency.",
  ccc_pushed_to_assigned:
    "Days from pushed to assigned to a buyer. Disposition team responsiveness — slow assignment usually means buyer pipeline is thin.",
  ccc_assigned_to_closed:
    "Days from assigned buyer to closing. Transactions team's coordination window — title issues or financing gaps show up here first.",
  appts_set:
    "Total appointments scheduled this period. The leading indicator that determines next month's contracts and revenue. Persistent shortfalls trigger System 60 for the lead manager team.",
  appts_executed:
    "Appointments actually run by an acquisitions agent. The gap between set and executed reveals seller no-shows and rescheduling discipline.",
  contracts:
    "New seller contracts signed. The fundamental output metric — every other downstream KPI depends on contract volume.",
  closed_deals:
    "Deals that closed and produced revenue this period. Lagging metric for everything we did 30-60 days ago.",
  profit_per_deal:
    "Average gross profit per closed deal. Rising = better deal selection or pricing; falling = margin compression we need to investigate.",
  marketing_spend:
    "Total marketing dollars spent this period. The denominator of ROAS and cost-per-appointment — overspend without lead growth is an immediate yellow flag.",
  cost_per_appt:
    "Marketing spend ÷ appointments executed. The cleanest measure of marketing efficiency. Above target sustained = ad creative or channel mix needs review.",
  net_to_appt:
    "% of net leads that convert to a set appointment. Lead manager performance metric — sustained drops trigger a 1-on-1 with the LM owner.",
  appt_to_contract:
    "% of executed appointments that become contracts. Acquisitions agent close rate — the strongest signal for individual coaching.",
  gross_leads:
    "Top-of-funnel lead count regardless of quality. Combined with contact rate, tells us if marketing is delivering volume.",
  net_leads:
    "Qualified leads with seller intent. The real input to the sales process — gross leads matter only insofar as they convert here.",
  contact_rate:
    "% of gross leads we successfully reach. Below target = lead manager dial discipline or speed-to-lead issue.",
  dropped_contracts:
    "Contracts cancelled before closing. Each one represents lost revenue + wasted disposition effort. Persistent drops trigger a transactions/title review.",
  roas:
    "Return on ad spend per channel. Below 3x sustained on a channel = candidate for spend reallocation.",
  contracts_per_aq:
    "Contracts signed per acquisitions agent. The clearest individual output metric — pairs with personal revenue and profit-per-deal in 1-on-1s.",
} as const;

// Hook helper — returns true when a KPI has been red for `threshold` consecutive
// periods. Pass an array of statuses oldest-to-newest. Used to drive the
// kpi-alert-pulse class that visually escalates persistent misses.
export function isRedStreak(
  statusesOldToNew: ("red" | "yellow" | "green" | null | undefined)[],
  threshold = 3,
): boolean {
  if (!statusesOldToNew?.length) return false;
  let streak = 0;
  for (let i = statusesOldToNew.length - 1; i >= 0; i--) {
    if (statusesOldToNew[i] === "red") streak++;
    else break;
  }
  return streak >= threshold;
}
