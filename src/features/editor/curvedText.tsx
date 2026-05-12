// Curved text helper. Renders plain text along a circular arc by positioning
// each character absolutely + rotated. Uses CSS only, no SVG <textPath>.
//
// Design constraints:
//   • Works for horizontal runs only (not combined with writing-mode vertical).
//   • Ignores inline text-runs (styled selections) — curved text implies a
//     single visual style; the toolbar disables the curve option when a slot
//     uses rich runs.
//   • Skeleton-safe: returns a flat <span>{text}</span> when curveDegrees=0.

import type { CSSProperties, ReactNode } from "react";

interface CurvedTextProps {
  text: string;
  curveDegrees: number;
  fontSize: number;
  letterSpacing?: number;
  style?: CSSProperties;
  className?: string;
}

function layoutArc(text: string, curveDegrees: number, fontSize: number, letterSpacing: number) {
  const chars = Array.from(text);
  const count = chars.length;
  if (count === 0) return { chars, positions: [] as Array<{ x: number; y: number; rot: number }> };

  const approxCharWidth = fontSize * 0.6 + letterSpacing;
  const arcLength = approxCharWidth * count;
  const curve = Math.max(-170, Math.min(170, curveDegrees));
  const arcRad = (curve * Math.PI) / 180;
  // Avoid divide-by-zero near 0°.
  const radius = Math.abs(arcRad) > 0.0001 ? Math.abs(arcLength / arcRad) : 0;
  const direction = curve >= 0 ? 1 : -1;

  const positions = chars.map((_, i) => {
    // angle per char, centred around 0.
    const totalAngle = arcRad;
    const charAngle = totalAngle * (i / Math.max(count - 1, 1) - 0.5);
    const x = radius * Math.sin(charAngle);
    const y = direction * (radius - radius * Math.cos(charAngle));
    const rot = (charAngle * 180) / Math.PI;
    return { x, y, rot };
  });

  return { chars, positions, radius, arcLength };
}

export function CurvedText({
  text,
  curveDegrees,
  fontSize,
  letterSpacing = 0,
  style,
  className,
}: CurvedTextProps): ReactNode {
  if (!text) return null;
  if (!curveDegrees || Math.abs(curveDegrees) < 0.5) {
    return (
      <span className={className} style={style}>
        {text}
      </span>
    );
  }
  const { chars, positions } = layoutArc(text, curveDegrees, fontSize, letterSpacing);
  return (
    <span
      className={className}
      style={{
        display: "inline-block",
        position: "relative",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {chars.map((ch, i) => {
        const p = positions[i];
        return (
          <span
            key={i}
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              transform: `translate(${p.x}px, ${p.y}px) translate(-50%, -50%) rotate(${p.rot}deg)`,
              transformOrigin: "center",
            }}
          >
            {ch === " " ? "\u00A0" : ch}
          </span>
        );
      })}
      {/* Invisible spacer to size the wrapper correctly. */}
      <span style={{ visibility: "hidden", whiteSpace: "nowrap" }}>{text}</span>
    </span>
  );
}
