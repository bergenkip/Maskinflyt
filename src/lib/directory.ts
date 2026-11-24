// Stage 15d: the free MaskinGo catalog (maskingo.no/finn). Addresses and the
// rules for what a visitor typed, shared by the pages and their tests.
import { isService, services, type Service } from "./company-page";

export const DIRECTORY_PATH = "/finn";
export const MAX_PLACE_LENGTH = 100;

// One Norwegian address per service, e.g. /finn/kranbil.
export const serviceSlugs: Record<Service, string> = {
  crane_truck: "kranbil",
  mobile_crane: "mobilkran",
  excavation: "graving",
  transport: "transport",
  machine_transport: "maskintransport",
  snow_clearing: "broyting",
  demolition: "riving",
  landscaping: "anleggsgartner",
};

export function serviceFromSlug(slug: unknown): Service | null {
  if (typeof slug !== "string") return null;
  return services.find((service) => serviceSlugs[service] === slug) ?? null;
}

// A service from the search form: its address or its key; anything else means all services.
export function wantedService(value: unknown): Service | null {
  return serviceFromSlug(value) ?? (isService(value) ? value : null);
}

// The place a visitor typed, on one line and not too long; empty means anywhere.
export function cleanPlace(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, MAX_PLACE_LENGTH);
}

// The address of a search: the service page, with the place as ?sted=.
export function directoryPath(service: Service | null, place = ""): string {
  const path = service ? `${DIRECTORY_PATH}/${serviceSlugs[service]}` : DIRECTORY_PATH;
  const cleaned = cleanPlace(place);
  return cleaned ? `${path}?${new URLSearchParams({ sted: cleaned })}` : path;
}
