import type { Industry } from "@/lib/industries";

// One photo per trade (public/photos, 1536×1024). Made with an image generator
// from Li's prompts: no brand names, logos or readable plates (small text that
// the generator invented was blurred). Not real customers or real machines.
export const industryPhotos: Record<Industry, string> = {
  kranbil: "/photos/kranbil-fjord.webp",
  maskinentreprenor: "/photos/gravemaskin.webp",
  transport: "/photos/tippbil.webp",
};

export const industryPhotoSize = { width: 1536, height: 1024 } as const;
