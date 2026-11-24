// Stage 15a: the company's public page (maskingo.no/firma/<slug>). Form rules
// shared by the server action and the tests; public.save_company_page checks
// the same limits again.
import { normalizeEmail, normalizePhone } from "./customers";

// What a company can say it does (the same list as the database's check).
export const services = [
  "crane_truck",
  "mobile_crane",
  "excavation",
  "transport",
  "machine_transport",
  "snow_clearing",
  "demolition",
  "landscaping",
] as const;
export type Service = (typeof services)[number];

export function isService(value: unknown): value is Service {
  return typeof value === "string" && (services as readonly string[]).includes(value);
}

export const PAGE_PATH = "/firma";
export const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_CITY_LENGTH = 100;
const MAX_AREA_LENGTH = 200;
const MAX_WEBSITE_LENGTH = 200;

export const pagePath = (slug: string) => `${PAGE_PATH}/${slug}`;

const slugPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function isValidSlug(slug: string): boolean {
  return slug.length >= 3 && slug.length <= 60 && slugPattern.test(slug);
}

// "Fjellkran & Søn AS" → "fjellkran-son-as": Norwegian letters spelled out, other accents dropped.
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

// "fjellkran.no" → "https://fjellkran.no". Only https addresses are kept.
export function normalizeWebsite(input: string): string | null | undefined {
  let value = input.trim();
  if (value === "") return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) value = `https://${value}`;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return undefined;
  const text = `https://${url.hostname}${url.pathname === "/" ? "" : url.pathname}${url.search}`;
  return text.length <= MAX_WEBSITE_LENGTH && /^https:\/\/[a-z0-9.-]+\.[a-z]{2,}(\/\S*)?$/.test(text) ? text : undefined;
}

export type CompanyPageValues = {
  slug: string;
  published: boolean;
  description: string;
  services: Service[];
  city: string;
  area: string;
  phone: string;
  email: string;
  website: string;
};

export type CompanyPageFieldError =
  | "slugInvalid"
  | "slugTaken"
  | "descriptionRequired"
  | "descriptionTooLong"
  | "servicesRequired"
  | "cityRequired"
  | "cityTooLong"
  | "areaTooLong"
  | "phoneInvalid"
  | "emailInvalid"
  | "contactRequired"
  | "websiteInvalid";

export type CompanyPageFields = {
  page_slug: string;
  page_published: boolean;
  page_description: string | null;
  page_services: Service[];
  page_city: string | null;
  page_area: string | null;
  page_phone: string | null;
  page_email: string | null;
  page_website: string | null;
};

const text = (formData: FormData, name: string) => String(formData.get(name) ?? "");
const oneLine = (value: string) => value.trim().replace(/\s+/g, " ");

// Checks the form. A page can be saved half-done while hidden; published, it
// needs a description, a city, at least one service and a phone or e-mail.
export function validateCompanyPage(formData: FormData): {
  values: CompanyPageValues;
  fieldErrors: Partial<Record<keyof CompanyPageValues, CompanyPageFieldError>>;
  fields?: CompanyPageFields;
} {
  const values: CompanyPageValues = {
    slug: text(formData, "slug").trim().toLowerCase(),
    published: formData.get("published") === "on",
    description: text(formData, "description").replace(/\r\n?/g, "\n").trim(),
    services: formData.getAll("services").filter(isService),
    city: oneLine(text(formData, "city")),
    area: oneLine(text(formData, "area")),
    phone: text(formData, "phone").trim(),
    email: text(formData, "email").trim(),
    website: text(formData, "website").trim(),
  };
  const fieldErrors: Partial<Record<keyof CompanyPageValues, CompanyPageFieldError>> = {};

  if (!isValidSlug(values.slug)) fieldErrors.slug = "slugInvalid";
  if (values.description.length > MAX_DESCRIPTION_LENGTH) fieldErrors.description = "descriptionTooLong";
  if (values.city.length > MAX_CITY_LENGTH) fieldErrors.city = "cityTooLong";
  if (values.area.length > MAX_AREA_LENGTH) fieldErrors.area = "areaTooLong";
  const phone = normalizePhone(values.phone);
  if (phone === undefined) fieldErrors.phone = "phoneInvalid";
  const email = normalizeEmail(values.email);
  if (email === undefined) fieldErrors.email = "emailInvalid";
  const website = normalizeWebsite(values.website);
  if (website === undefined) fieldErrors.website = "websiteInvalid";

  if (values.published) {
    if (!values.description) fieldErrors.description ??= "descriptionRequired";
    if (values.services.length === 0) fieldErrors.services = "servicesRequired";
    if (!values.city) fieldErrors.city ??= "cityRequired";
    if (!phone && !email && !fieldErrors.phone && !fieldErrors.email) fieldErrors.phone = "contactRequired";
  }

  if (Object.keys(fieldErrors).length > 0) return { values, fieldErrors };
  return {
    values,
    fieldErrors,
    fields: {
      page_slug: values.slug,
      page_published: values.published,
      page_description: values.description || null,
      page_services: [...new Set(values.services)],
      page_city: values.city || null,
      page_area: values.area || null,
      page_phone: phone ?? null,
      page_email: email ?? null,
      page_website: website ?? null,
    },
  };
}
