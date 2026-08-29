import { cn } from "@/lib/cn";

/**
 * The OpsWeave glyph: two strands crossing into a weave. It reads as both the
 * "weave" in the product name and the braided evidence-to-workflow paths the
 * platform compiles, which the previous four-dot mark did not.
 */
export function WeaveGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path
        d="M3.5 6.75c4.2 0 4.2 10.5 8.5 10.5s4.3-10.5 8.5-10.5"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <path
        d="M3.5 17.25c4.2 0 4.2-10.5 8.5-10.5s4.3 10.5 8.5 10.5"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        opacity=".5"
      />
    </svg>
  );
}

type BrandMarkProps = {
  size?: number;
  radius?: number;
  className?: string;
  flat?: boolean;
};

export function BrandMark({ size = 30, radius, className, flat }: BrandMarkProps) {
  return (
    <span
      className={cn("brand-mark", flat && "flat", className)}
      style={{ width: size, height: size, borderRadius: radius ?? Math.round(size * 0.32) }}
    >
      <WeaveGlyph />
    </span>
  );
}

export function BrandLockup({ className, size = 30 }: { className?: string; size?: number }) {
  return (
    <span className={cn("flex items-center gap-3", className)}>
      <BrandMark size={size} />
      <span className="text-lg font-[650] tracking-[-0.04em] text-content">OpsWeave</span>
    </span>
  );
}
