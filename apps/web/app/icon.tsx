import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

// Ícono de la app (favicon + manifest). Marca 24 HITS en violeta.
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#7c3aed",
          color: "#ffffff",
          fontSize: 300,
          fontWeight: 800,
          letterSpacing: "-0.05em",
        }}
      >
        24
      </div>
    ),
    { ...size }
  );
}
