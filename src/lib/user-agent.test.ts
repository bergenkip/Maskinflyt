import { describe, expect, it } from "vitest";
import { describeUserAgent } from "./user-agent";

describe("describeUserAgent", () => {
  it("names common browsers and devices", () => {
    expect(
      describeUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1",
      ),
    ).toBe("Safari, iPhone");
    expect(
      describeUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
      ),
    ).toBe("Chrome, Mac");
    expect(
      describeUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0",
      ),
    ).toBe("Edge, Windows");
    expect(describeUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) CriOS/141.0 Mobile Safari/604.1")).toBe(
      "Chrome, iPhone",
    );
  });

  it("returns null when nothing is recognised", () => {
    expect(describeUserAgent("")).toBeNull();
    expect(describeUserAgent(null)).toBeNull();
    expect(describeUserAgent("curl/8.0")).toBeNull();
  });
});
