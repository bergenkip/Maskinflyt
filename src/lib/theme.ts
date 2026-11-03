// Light (white) is the default; dark is chosen with the sun/moon button and
// remembered in a cookie on this device, so pages render in it with no flash.
export const THEME_COOKIE = "theme";
export const themes = ["light", "dark"] as const;
export type Theme = (typeof themes)[number];

export function resolveTheme(value: string | undefined): Theme {
  return value === "dark" ? "dark" : "light";
}

// The browser bar colour: the header colour (--surface) of each theme.
export const themeColors: Record<Theme, string> = { light: "#ffffff", dark: "#1b1c1f" };
