import { encode } from "uqr";

/**
 * A QR code drawn as one SVG path, so it stays sharp at any size on any TV.
 * Black on white with a quiet border, which is what phone cameras read best
 * from across a room; error correction is set high enough to survive glare.
 */
export function QrCode({ value, className = "" }: { value: string; className?: string }) {
  const { data, size } = encode(value, { ecc: "Q", border: 2 });
  let d = "";
  data.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) d += `M${x} ${y}h1v1h-1z`;
    }),
  );
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`QR code for ${value}`}
      shapeRendering="crispEdges"
      className={className}
    >
      <rect width={size} height={size} fill="#fff" />
      <path d={d} fill="#111" />
    </svg>
  );
}
