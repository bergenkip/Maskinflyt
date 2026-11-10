import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { body, subject, templates as rawTemplates } from "../../scripts/email-templates.mjs";

const templates = rawTemplates as Record<string, Record<string, Record<string, string>>>;

const names = Object.keys(templates) as string[];
const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

describe("Supabase Auth e-mail templates", () => {
  it.each(names)("%s is generated and up to date", (name) => {
    expect(read(`supabase/templates/${name}.html`)).toBe(body(name));
    expect(read(`supabase/templates/${name}.subject.txt`)).toBe(`${subject(name)}\n`);
  });

  it.each(names)("%s has all three languages, Norwegian last as the fallback", (name) => {
    const html = body(name);
    const lt = html.indexOf('lang="lt"');
    const en = html.indexOf('lang="en"');
    const nb = html.indexOf('lang="nb"');
    expect(lt).toBeGreaterThan(-1);
    expect(en).toBeGreaterThan(lt);
    expect(nb).toBeGreaterThan(en);
    expect(html).toContain('{{ $l := printf "%v" .Data.email_locale }}');
    // Button and copyable link in every language.
    expect(html.match(/\{\{ \.ConfirmationURL \}\}/g)).toHaveLength(9);
  });

  it.each(names)("%s has the same text keys in every language", (name) => {
    const t = templates[name];
    const keys = Object.keys(t.nb).sort();
    for (const locale of ["en", "lt"]) {
      expect(Object.keys(t[locale]).sort()).toEqual(keys);
      for (const key of keys) expect(t[locale][key].trim()).not.toBe("");
    }
  });
});

describe("local Supabase config", () => {
  it.each(names)("uses the %s template and subject", (name) => {
    const config = read("supabase/config.toml");
    expect(config).toContain(`[auth.email.template.${name}]\nsubject = '${subject(name)}'\ncontent_path = "./supabase/templates/${name}.html"`);
  });
});
