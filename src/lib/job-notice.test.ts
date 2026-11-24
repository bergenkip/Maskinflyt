import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { noticeNeeded } = await import("./job-notice");

const job = { status: "planned", starts_at: "2026-12-01T07:00:00Z", ends_at: "2026-12-01T11:00:00Z" };
const told = { starts_at: "2026-12-01T07:00:00.000Z", ends_at: "2026-12-01T11:00:00+00:00", cancelled: false, sent_at: "2026-11-24T10:00:00Z" };

describe("customer notice", () => {
  it("asks to send the time when the customer was never told", () => {
    expect(noticeNeeded(job, null)).toBe("planned");
    expect(noticeNeeded({ ...job, status: "new" }, null)).toBe("planned");
  });

  it("needs nothing while the customer knows the time, however it is written", () => {
    expect(noticeNeeded(job, told)).toBeNull();
  });

  it("asks to send a changed start or end", () => {
    expect(noticeNeeded({ ...job, starts_at: "2026-12-01T08:00:00Z" }, told)).toBe("changed");
    expect(noticeNeeded({ ...job, ends_at: "2026-12-01T12:00:00Z" }, told)).toBe("changed");
  });

  it("asks to tell about a cancellation once, and only a customer who was told a time", () => {
    expect(noticeNeeded({ ...job, status: "cancelled" }, told)).toBe("cancelled");
    expect(noticeNeeded({ ...job, status: "cancelled" }, { ...told, cancelled: true })).toBeNull();
    expect(noticeNeeded({ ...job, status: "cancelled" }, null)).toBeNull();
  });

  it("sends the time again for a job brought back, and nothing for a finished one", () => {
    expect(noticeNeeded(job, { ...told, cancelled: true })).toBe("planned");
    expect(noticeNeeded({ ...job, status: "done", starts_at: "2026-12-02T07:00:00Z" }, told)).toBeNull();
  });
});
