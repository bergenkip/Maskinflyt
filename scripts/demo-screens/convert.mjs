// Crops and compresses the screenshots from shoot.spec.ts into public/screens.
// Light and dark (DEMO_THEME=dark) shots; whichever were taken are converted.
import { existsSync } from "node:fs";
import sharp from "sharp";

const dir = "test-results/demo-screens";
for (const locale of ["nb", "en", "lt"]) {
  for (const suffix of ["", "-dark"]) {
    const calendar = `${dir}/${locale}-calendar-day-1280${suffix}.png`;
    if (existsSync(calendar)) {
      await sharp(calendar)
        .extract({ left: 0, top: 0, width: 2560, height: 1380 })
        .resize(2048)
        .webp({ quality: 82 })
        .toFile(`public/screens/calendar-${locale}${suffix}.webp`);
    }
    const driver = `${dir}/${locale}-driver-390${suffix}.png`;
    if (existsSync(driver)) {
      await sharp(driver)
        .resize(780)
        .webp({ quality: 82 })
        .toFile(`public/screens/driver-${locale}${suffix}.webp`);
    }
  }
}
