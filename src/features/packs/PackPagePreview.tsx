// Mini thumbnail render 1 page template (scale-fit container)
import { useEffect, useRef, useState } from "react";
import type { PageTemplate } from "@/models";
import { PageRenderer } from "@/features/render/PageRenderer";

export function PackPagePreview({ tpl }: { tpl: PageTemplate }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.15);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const compute = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (!w || !h) return;
      setScale(Math.min(w / tpl.canvas.width, h / tpl.canvas.height));
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [tpl.canvas.width, tpl.canvas.height]);

  return (
    <div
      ref={ref}
      className="absolute inset-0 overflow-hidden"
      style={{ background: tpl.canvas.background ?? "#fff" }}
    >
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          pointerEvents: "none",
        }}
      >
        <PageRenderer template={tpl} entities={[]} assets={[]} scale={scale} />
      </div>
    </div>
  );
}
