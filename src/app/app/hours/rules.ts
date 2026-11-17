import type { HourRules } from "@/lib/hours";
import { decimalHours } from "@/lib/hours";

// "Overtime: after 8 h a day +50 %, after 10 h +100 %", in the reader's language.
export function rulesText(
  t: (key: "rules" | "rules2", values: { after: string; percent: number }) => string,
  rules: HourRules,
  number: (value: number) => string,
) {
  const first = t("rules", { after: number(decimalHours(rules.overtime_after)), percent: rules.overtime_percent });
  if (rules.overtime2_after === null || rules.overtime2_percent === null) return first;
  return `${first}, ${t("rules2", { after: number(decimalHours(rules.overtime2_after)), percent: rules.overtime2_percent })}`;
}
