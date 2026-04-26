// SmartSpacing: hiển thị khoảng cách giữa element đang kéo và các element lân cận,
// giống Canva smart spacing indicators.
import type { DesignElement } from "@/models";

interface SpacingLine {
  axis: "x" | "y";
  from: number;
  to: number;
  pos: number;
  gap: number;
}

export function computeSpacingLines(
  moving: DesignElement,
  others: DesignElement[],
  threshold = 4,
): SpacingLine[] {
  const lines: SpacingLine[] = [];

  const mLeft = moving.x;
  const mRight = moving.x + moving.width;
  const mTop = moving.y;
  const mBottom = moving.y + moving.height;
  const mCenterX = moving.x + moving.width / 2;
  const mCenterY = moving.y + moving.height / 2;

  for (const other of others) {
    if (other.hidden) continue;
    const oLeft = other.x;
    const oRight = other.x + other.width;
    const oTop = other.y;
    const oBottom = other.y + other.height;
    const oCenterX = other.x + other.width / 2;
    const oCenterY = other.y + other.height / 2;

    // Horizontal gaps
    // Moving left edge to other right edge
    if (Math.abs(mLeft - oRight) < threshold) {
      lines.push({ axis: "x", from: oRight, to: mLeft, pos: Math.max(mTop, oTop), gap: mLeft - oRight });
    }
    // Moving right edge to other left edge
    if (Math.abs(mRight - oLeft) < threshold) {
      lines.push({ axis: "x", from: mRight, to: oLeft, pos: Math.max(mTop, oTop), gap: oLeft - mRight });
    }
    // Moving left edge to other left edge (aligned)
    if (Math.abs(mLeft - oLeft) < threshold) {
      lines.push({ axis: "x", from: mLeft, to: oLeft, pos: Math.min(mTop, oTop) - 16, gap: 0 });
    }
    // Moving right edge to other right edge (aligned)
    if (Math.abs(mRight - oRight) < threshold) {
      lines.push({ axis: "x", from: mRight, to: oRight, pos: Math.min(mTop, oTop) - 16, gap: 0 });
    }
    // Center X alignment
    if (Math.abs(mCenterX - oCenterX) < threshold) {
      lines.push({ axis: "x", from: mCenterX, to: oCenterX, pos: Math.min(mTop, oTop) - 16, gap: 0 });
    }

    // Vertical gaps
    // Moving top edge to other bottom edge
    if (Math.abs(mTop - oBottom) < threshold) {
      lines.push({ axis: "y", from: oBottom, to: mTop, pos: Math.max(mLeft, oLeft), gap: mTop - oBottom });
    }
    // Moving bottom edge to other top edge
    if (Math.abs(mBottom - oTop) < threshold) {
      lines.push({ axis: "y", from: mBottom, to: oTop, pos: Math.max(mLeft, oLeft), gap: oTop - mBottom });
    }
    // Moving top edge to other top edge (aligned)
    if (Math.abs(mTop - oTop) < threshold) {
      lines.push({ axis: "y", from: mTop, to: oTop, pos: Math.min(mLeft, oLeft) - 16, gap: 0 });
    }
    // Moving bottom edge to other bottom edge (aligned)
    if (Math.abs(mBottom - oBottom) < threshold) {
      lines.push({ axis: "y", from: mBottom, to: oBottom, pos: Math.min(mLeft, oLeft) - 16, gap: 0 });
    }
    // Center Y alignment
    if (Math.abs(mCenterY - oCenterY) < threshold) {
      lines.push({ axis: "y", from: mCenterY, to: oCenterY, pos: Math.min(mLeft, oLeft) - 16, gap: 0 });
    }
  }

  // Deduplicate: keep unique lines only
  const seen = new Set<string>();
  return lines.filter((l) => {
    const key = `${l.axis}-${Math.round(l.from)}-${Math.round(l.to)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

interface SmartSpacingProps {
  lines: SpacingLine[];
  scale: number;
}

export function SmartSpacing({ lines, scale }: SmartSpacingProps) {
  if (lines.length === 0) return null;
  return (
    <div className="pointer-events-none absolute inset-0" style={{ zIndex: 30 }}>
      {lines.map((line, i) => {
        if (line.gap === 0) {
          // Alignment indicator — just a dashed line
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                ...(line.axis === "x"
                  ? { left: line.from * scale, top: line.pos * scale, width: 1, height: 40 }
                  : { left: line.pos * scale, top: line.from * scale, width: 40, height: 1 }),
                background: "rgba(56,189,248,0.6)",
              }}
            />
          );
        }
        // Gap indicator — line with gap label
        const isHorizontal = line.axis === "y"; // vertical line showing horizontal gap
        return (
          <div key={i} style={{ position: "absolute" }}>
            {/* Line */}
            <div
              style={{
                position: "absolute",
                ...(isHorizontal
                  ? {
                      left: line.pos * scale,
                      top: line.from * scale,
                      width: 1,
                      height: (line.to - line.from) * scale,
                    }
                  : {
                      left: line.from * scale,
                      top: line.pos * scale,
                      width: (line.to - line.from) * scale,
                      height: 1,
                    }),
                background: "rgba(56,189,248,0.8)",
              }}
            />
            {/* Gap label */}
            <div
              style={{
                position: "absolute",
                ...(isHorizontal
                  ? {
                      left: line.pos * scale + 4,
                      top: ((line.from + line.to) / 2) * scale - 7,
                    }
                  : {
                      left: ((line.from + line.to) / 2) * scale + 4,
                      top: line.pos * scale + 4,
                    }),
                fontSize: 10,
                lineHeight: "14px",
                color: "rgb(56,189,248)",
                background: "rgba(255,255,255,0.9)",
                padding: "0 3px",
                borderRadius: 3,
                fontWeight: 500,
              }}
            >
              {Math.abs(Math.round(line.gap))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
