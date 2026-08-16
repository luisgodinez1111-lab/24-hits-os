import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Ícono para "Agregar a inicio" en iOS (esquinas las redondea el sistema).
export default function AppleIcon() {
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
          fontSize: 104,
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
