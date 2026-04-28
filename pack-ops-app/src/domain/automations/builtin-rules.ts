import type { AutomationRule, BuiltinAutomationRuleKey } from "@/domain/automations/types";

export const BUILTIN_AUTOMATION_RULE_KEYS: BuiltinAutomationRuleKey[] = [
  "job_no_time_logged_48h",
  "job_ready_to_invoice_24h",
  "job_over_budget",
  "job_stale_7d",
  "invoice_overdue_email",
  "invoice_overdue_7d_task",
  "quote_follow_up_5d",
  "lead_unresponsive_3d",
];

export function isBuiltinAutomationRule(rule: AutomationRule): boolean {
  return rule.isBuiltin && rule.key !== null;
}
