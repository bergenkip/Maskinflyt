import "server-only";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { decimalHours, type SheetDay } from "../hours";
import { clean, formatDate, loadFonts, wrap } from "./invoice-pdf";

// The PDF of a confirmed hours sheet, made from the sheet kept in the
// database, for the accountant. In Norwegian, like the invoices.

export type ConfirmedSheet = {
  company: string;
  employee_name: string;
  period_from: string;
  period_to: string;
  submitted_at: string;
  timezone: string;
  overtime_after: number;
  overtime_percent: number;
  overtime2_after: number | null;
  overtime2_percent: number | null;
  worked_minutes: number;
  normal_minutes: number;
  overtime_minutes: number;
  overtime2_minutes: number;
};

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 50;
const ink = rgb(0.1, 0.12, 0.16);
const muted = rgb(0.42, 0.45, 0.5);
const rule = rgb(0.85, 0.87, 0.9);

const hoursFormat = new Intl.NumberFormat("nb-NO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const formatHours = (minutes: number) => clean(hoursFormat.format(decimalHours(minutes)));
const hoursText = (minutes: number) => formatHours(minutes).replace(/,00$/, "").replace(/(,\d)0$/, "$1");

export async function hoursPdf(sheet: ConfirmedSheet, days: SheetDay[]): Promise<Uint8Array> {
  const [regularBytes, boldBytes] = await loadFonts();
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const regular = await doc.embedFont(regularBytes, { subset: true });
  const bold = await doc.embedFont(boldBytes, { subset: true });
  doc.setTitle(`Timeliste ${sheet.employee_name} ${formatDate(sheet.period_from)}–${formatDate(sheet.period_to)}`);
  doc.setAuthor(sheet.company);
  doc.setCreator("MaskinGo");
  doc.setProducer("MaskinGo");
  doc.setLanguage("nb-NO");

  const right = A4[0] - MARGIN;
  const width = right - MARGIN;
  let page: PDFPage = doc.addPage(A4);
  let y = A4[1] - MARGIN;
  type Opts = { font?: PDFFont; size?: number; color?: typeof ink };
  const text = (value: string, x: number, at: number, opts: Opts = {}) =>
    page.drawText(clean(value), { x, y: at, font: opts.font ?? regular, size: opts.size ?? 10, color: opts.color ?? ink });
  const textRight = (value: string, x: number, at: number, opts: Opts = {}) => {
    const v = clean(value);
    text(v, x - (opts.font ?? regular).widthOfTextAtSize(v, opts.size ?? 10), at, opts);
  };
  const line = (at: number) => page.drawLine({ start: { x: MARGIN, y: at }, end: { x: right, y: at }, thickness: 0.75, color: rule });

  // The company and "Timeliste"; the employee and the period.
  const companyLines = wrap(sheet.company, bold, 14, width / 2);
  for (const [i, part] of companyLines.entries()) text(part, MARGIN, y - i * 17, { font: bold, size: 14 });
  textRight("Timeliste", right, y - 4, { font: bold, size: 22 });
  const confirmed = new Intl.DateTimeFormat("nb-NO", { dateStyle: "short", timeStyle: "short", timeZone: sheet.timezone }).format(new Date(sheet.submitted_at));
  const facts: [string, string][] = [
    ["Ansatt", sheet.employee_name],
    ["Periode", `${formatDate(sheet.period_from)}–${formatDate(sheet.period_to)}`],
    ["Bekreftet av den ansatte", clean(confirmed)],
  ];
  let fy = y - 40;
  for (const [label, value] of facts) {
    text(label, right - 260, fy, { color: muted });
    textRight(value.length > 34 ? `${value.slice(0, 33)}…` : value, right, fy, { font: bold });
    fy -= 15;
  }
  y = Math.min(y - 17 * companyLines.length, fy) - 14;

  const level1 = `Overtid ${sheet.overtime_percent} %`;
  const level2 = sheet.overtime2_percent === null ? null : `Overtid ${sheet.overtime2_percent} %`;
  const rules =
    `Overtid ${sheet.overtime_percent} % etter ${hoursText(sheet.overtime_after)} timer per dag` +
    (sheet.overtime2_after === null ? "." : `, ${sheet.overtime2_percent} % etter ${hoursText(sheet.overtime2_after)} timer.`);
  for (const part of wrap(rules, regular, 9, width)) {
    text(part, MARGIN, y, { color: muted, size: 9 });
    y -= 12;
  }
  y -= 10;

  // The days: date, from–to, break, hours, and the split.
  const columns = [
    { title: "Dato", x: MARGIN, align: "left" as const },
    { title: "Fra–til", x: MARGIN + 66, align: "left" as const },
    { title: "Pause", x: MARGIN + 180, align: "right" as const },
    { title: "Timer", x: MARGIN + 240, align: "right" as const },
    { title: "Normal", x: MARGIN + 310, align: "right" as const },
    { title: level1, x: MARGIN + 400, align: "right" as const },
    ...(level2 ? [{ title: level2, x: right, align: "right" as const }] : []),
  ];
  // A later page says whose sheet it is.
  const nextPage = () => {
    page = doc.addPage(A4);
    y = A4[1] - MARGIN;
    text(`Timeliste ${sheet.employee_name}, ${formatDate(sheet.period_from)}–${formatDate(sheet.period_to)}`, MARGIN, y, { size: 9, color: muted });
    textRight(`Side ${doc.getPageCount()}`, right, y, { size: 9, color: muted });
    y -= 24;
  };
  const header = () => {
    for (const column of columns) (column.align === "left" ? text : textRight)(column.title, column.x, y, { font: bold, size: 9, color: muted });
    y -= 8;
    line(y);
    y -= 15;
  };
  header();
  for (const day of days) {
    const noteLines = day.note ? wrap(day.note, regular, 9, width - 66) : [];
    if (y - 12 * noteLines.length < MARGIN + 20) {
      nextPage();
      header();
    }
    const cells = [
      formatDate(day.day),
      `${day.starts.slice(0, 5)}–${day.ends.slice(0, 5)}`,
      day.break_minutes ? `${day.break_minutes} min` : "–",
      formatHours(day.worked_minutes),
      formatHours(day.normal_minutes ?? 0),
      formatHours(day.overtime_minutes ?? 0),
      ...(level2 ? [formatHours(day.overtime2_minutes ?? 0)] : []),
    ];
    for (const [i, column] of columns.entries()) (column.align === "left" ? text : textRight)(cells[i], column.x, y);
    for (const part of noteLines) {
      y -= 12;
      text(part, MARGIN + 66, y, { size: 9, color: muted });
    }
    y -= 8;
    line(y);
    y -= 15;
  }

  // The totals, with the closing words, kept together.
  if (y < MARGIN + 60) {
    nextPage();
    header();
  }
  const totals = [
    "Sum",
    "",
    "",
    formatHours(sheet.worked_minutes),
    formatHours(sheet.normal_minutes),
    formatHours(sheet.overtime_minutes),
    ...(level2 ? [formatHours(sheet.overtime2_minutes)] : []),
  ];
  for (const [i, column] of columns.entries()) (column.align === "left" ? text : textRight)(totals[i], column.x, y, { font: bold });
  y -= 30;
  for (const part of wrap(
    `Timene er ført og bekreftet av den ansatte i MaskinGo. Sum timer: ${formatHours(sheet.worked_minutes)}, herav normal ${formatHours(sheet.normal_minutes)}, ${level1.toLowerCase()} ${formatHours(sheet.overtime_minutes)}${level2 ? `, ${level2.toLowerCase()} ${formatHours(sheet.overtime2_minutes)}` : ""}.`,
    regular,
    9,
    width,
  )) {
    if (y < MARGIN) {
      nextPage();
    }
    text(part, MARGIN, y, { size: 9, color: muted });
    y -= 12;
  }
  return doc.save();
}
