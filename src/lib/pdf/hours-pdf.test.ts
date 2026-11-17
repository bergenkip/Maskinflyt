import { writeFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { formatHours, hoursPdf } = await import("./hours-pdf");
const { hoursEmail } = await import("../email/hours-email");

const sheet = {
  company: "Fjellkran og Transportservice Vestlandet AS",
  employee_name: "Žydrūnas Ærø-Østby",
  period_from: "2026-11-01",
  period_to: "2026-11-30",
  submitted_at: "2026-11-30T15:04:00Z",
  timezone: "Europe/Oslo",
  overtime_mode: "daily" as "daily" | "clock",
  overtime_from: null as string | null,
  overtime_to: null as string | null,
  overtime2_from: null as string | null,
  overtime2_to: null as string | null,
  overtime_after: 450,
  overtime_percent: 50,
  overtime2_after: 600,
  overtime2_percent: 100,
  worked_minutes: 1500,
  normal_minutes: 1260,
  overtime_minutes: 150,
  overtime2_minutes: 90,
};
const days = [
  { day: "2026-11-02", starts: "07:00:00", ends: "15:00:00", break_minutes: 30, note: null, worked_minutes: 450, normal_minutes: 450, overtime_minutes: 0, overtime2_minutes: 0 },
  { day: "2026-11-03", starts: "06:00:00", ends: "18:00:00", break_minutes: 30, note: "Verksted og kranoppdrag på Lysaker, ventet på mottak av betong", worked_minutes: 690, normal_minutes: 450, overtime_minutes: 150, overtime2_minutes: 90 },
  { day: "2026-11-04", starts: "20:00:00", ends: "02:00:00", break_minutes: 0, note: null, worked_minutes: 360, normal_minutes: 360, overtime_minutes: 0, overtime2_minutes: 0 },
];

describe("hours sheet PDF and e-mail", () => {
  it("formats hours as Norwegian payroll does", () => {
    expect(formatHours(450)).toBe("7,50");
    expect(formatHours(1500)).toBe("25,00");
  });

  it("makes a one-page PDF, also with a long month", async () => {
    const pdf = await hoursPdf(sheet, days);
    if (process.env.PDF_OUT) await writeFile(`${process.env.PDF_OUT}/hours.pdf`, pdf);
    const doc = await PDFDocument.load(pdf);
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getTitle()).toBe("Timeliste Žydrūnas Ærø-Østby 01.11.2026–30.11.2026");

    const month = Array.from({ length: 31 }, (_, i) => ({ ...days[1], day: `2026-12-${String(i + 1).padStart(2, "0")}` }));
    const long = await hoursPdf({ ...sheet, overtime2_after: null, overtime2_percent: null }, month);
    if (process.env.PDF_OUT) await writeFile(`${process.env.PDF_OUT}/hours-long.pdf`, long);
    expect((await PDFDocument.load(long)).getPageCount()).toBe(2);
  });

  it("tells the clock windows when overtime is counted by the time of day", async () => {
    const clock = {
      ...sheet,
      overtime_mode: "clock" as const,
      overtime_after: 480,
      overtime2_after: null,
      overtime_from: "15:00",
      overtime_to: "19:00",
      overtime2_from: "19:00",
      overtime2_to: "06:00",
    };
    const pdf = await hoursPdf(clock, days);
    if (process.env.PDF_OUT) await writeFile(`${process.env.PDF_OUT}/hours-clock.pdf`, pdf);
    expect((await PDFDocument.load(pdf)).getPageCount()).toBe(1);
  });

  it("writes the e-mail to the accountant, with the names escaped", () => {
    const email = hoursEmail({ ...sheet, employee_name: "Ola <b>Nordmann</b>" }, { to: "lonn@regnskap.test", replyTo: "ola@fjellkran.test", testMode: true });
    expect(email.subject).toBe("TEST: Timeliste Ola <b>Nordmann</b> 01.11.2026–30.11.2026");
    expect(email.from).toBe('"Fjellkran og Transportservice Vestlandet AS via MaskinGo" <timeliste@maskingo.no>');
    expect(email.replyTo).toBe("ola@fjellkran.test");
    expect(email.text).toContain("Overtid 100 %: 1,50");
    expect(email.text).toContain("Mottaker: lonn@regnskap.test");
    expect(email.html).toContain("Ola &lt;b&gt;Nordmann&lt;/b&gt;");
    expect(email.html).not.toContain("<b>Nordmann");
  });
});
