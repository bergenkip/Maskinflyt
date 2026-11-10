import { expect, test } from "@playwright/test";

// Search engine basics. CI is not the live site (no VERCEL_ENV=production),
// so here everything must say "stay away"; the live values are unit-tested
// in src/lib/site.test.ts.

test("robots.txt keeps search engines off test copies", async ({ request }) => {
  const res = await request.get("/robots.txt");
  expect(res.status()).toBe(200);
  const body = await res.text();
  expect(body).toMatch(/User-Agent: \*/);
  expect(body).toMatch(/Disallow: \/\s*$/m);
});

test("sitemap lists only the public pages on maskingo.no", async ({ request }) => {
  const res = await request.get("/sitemap.xml");
  expect(res.status()).toBe(200);
  const locs = [...(await res.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  expect(locs).toEqual(["https://maskingo.no", "https://maskingo.no/signup", "https://maskingo.no/login"]);
});

test("home page has title, description, canonical, share picture and structured data", async ({
  page,
  context,
  baseURL,
}) => {
  await context.addCookies([{ name: "NEXT_LOCALE", value: "nb", url: baseURL! }]);
  await page.goto("/");

  await expect(page).toHaveTitle(/^MaskinGo · .+maskinentreprenører$/);
  const description = await page.locator('meta[name="description"]').getAttribute("content");
  expect(description?.length ?? 0).toBeGreaterThan(70);
  expect(description?.length ?? 0).toBeLessThanOrEqual(170);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://maskingo.no");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");

  const image = await page.locator('meta[property="og:image"]').getAttribute("content");
  expect(image).toBe("https://maskingo.no/opengraph-image");
  const picture = await page.request.get("/opengraph-image");
  expect(picture.status()).toBe(200);
  expect(picture.headers()["content-type"]).toBe("image/png");

  const json = await page.locator('script[type="application/ld+json"]').textContent();
  const data = JSON.parse(json ?? "{}");
  const types = data["@graph"].map((item: { "@type": string }) => item["@type"]);
  expect(types).toEqual(["Organization", "WebSite", "SoftwareApplication"]);
});

test("pages outside search keep noindex", async ({ page, request }) => {
  await page.goto("/forgot-password");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);

  const app = await request.get("/app", { maxRedirects: 0 });
  expect(app.headers()["x-robots-tag"]).toBe("noindex, nofollow");
});
