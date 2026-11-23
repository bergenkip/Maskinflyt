import type { HourRules } from "@/lib/hours";
import { decimalHours, hasLevel2 } from "@/lib/hours";

type RulesKey = "rules" | "rules2" | "rulesClock" | "rulesClock2";

// "Overtime: after 8 h a day +50 %, after 10 h +100 %", or by the clock
// "Overtime: 15:00–19:00 +50 %, 19:00–06:00 +100 %", in the reader's language.
export function rulesText(
  t: (key: RulesKey, values: { after?: string; from?: string; to?: string; percent: number }) => string,
  rules: HourRules,
  number: (value: number) => string,
) {
  const second = hasLevel2(rules);
  if (rules.overtime_mode === "clock") {
    const first = t("rulesClock", { from: rules.overtime_from ?? "", to: rules.overtime_to ?? "", percent: rules.overtime_percent });
    if (!second) return first;
    return `${first}, ${t("rulesClock2", { from: rules.overtime2_from ?? "", to: rules.overtime2_to ?? "", percent: rules.overtime2_percent! })}`;
  }
  const first = t("rules", { after: number(decimalHours(rules.overtime_after)), percent: rules.overtime_percent });
  if (!second) return first;
  return `${first}, ${t("rules2", { after: number(decimalHours(rules.overtime2_after!)), percent: rules.overtime2_percent! })}`;
}
