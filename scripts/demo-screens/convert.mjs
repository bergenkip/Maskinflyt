// Crops and compresses the screenshots from shoot.spec.ts into public/screens.
import sharp from "sharp";

for (const locale of ["nb", "en", "lt"]) {
  await sharp(`test-results/demo-screens/${locale}-calendar-day-1280.png`)
    .extract({ left: 0, top: 0, width: 2560, height: 1380 })
    .resize(2048)
    .webp({ quality: 82 })
    .toFile(`public/screens/calendar-${locale}.webp`);
  await sharp(`test-results/demo-screens/${locale}-driver-390.png`)
    .resize(780)
    .webp({ quality: 82 })
    .toFile(`public/screens/driver-${locale}.webp`);
}
