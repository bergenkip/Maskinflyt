import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import messages from "../../messages/nb.json";

// The picture shown when a link to maskingo.no is shared (Facebook, LinkedIn,
// Messenger, Slack, iMessage). Norwegian, because that is the main market;
// it is built once at build time, not on every share.
export const alt = messages.Metadata.ogAlt;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  const logo = await readFile(join(process.cwd(), "public/brand/maskingo-logo-full.png"));
  const logoSrc = `data:image/png;base64,${logo.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: "#ffffff",
          borderBottom: "16px solid #0068d9",
        }}
      >
        <img src={logoSrc} width={494} height={160} alt="" />
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 60, fontWeight: 700, color: "#012042", lineHeight: 1.1 }}>
            {messages.Home.title}
          </div>
          <div style={{ fontSize: 32, color: "#536173", lineHeight: 1.35 }}>
            {messages.Metadata.description.split(". ")[0] + "."}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
