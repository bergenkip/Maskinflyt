import type en from "../messages/en.json";
import type { Locale } from "./i18n/locale";

// Makes translation keys type-checked: a typo in t("...") fails the build.
declare module "next-intl" {
  interface AppConfig {
    Locale: Locale;
    Messages: typeof en;
  }
}
