"use client";

import { animate, useReducedMotion, type Transition, type Variants } from "motion/react";
import { useEffect, useState } from "react";

/* --------------------------------------------------------------------------
   Easings and durations
   Every timing in the portal resolves to one of these so motion feels like a
   single system rather than per-component guesses.
   -------------------------------------------------------------------------- */

export const ease = {
  out: [0.22, 1, 0.36, 1],
  inOut: [0.65, 0, 0.35, 1],
  spring: { type: "spring", stiffness: 380, damping: 32, mass: 0.8 },
} as const;

export const duration = {
  fast: 0.16,
  base: 0.26,
  slow: 0.42,
} as const;

export const transition = {
  fast: { duration: duration.fast, ease: ease.out },
  base: { duration: duration.base, ease: ease.out },
  slow: { duration: duration.slow, ease: ease.out },
} satisfies Record<string, Transition>;

/* --------------------------------------------------------------------------
   Shared variants
   -------------------------------------------------------------------------- */

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: transition.base },
  exit: { opacity: 0, transition: transition.fast },
};

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: transition.base },
  exit: { opacity: 0, y: -6, transition: transition.fast },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.97, y: 12 },
  show: { opacity: 1, scale: 1, y: 0, transition: transition.base },
  exit: { opacity: 0, scale: 0.98, y: 6, transition: transition.fast },
};

/** Surface-level transition applied when switching between portal surfaces. */
export const surfaceTransition: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: duration.base, ease: ease.out } },
  exit: { opacity: 0, y: -4, transition: transition.fast },
};

/** Parent for staggered lists. Children should use `listItem`. */
export const staggerContainer = (stagger = 0.035, delay = 0): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: stagger, delayChildren: delay } },
});

export const listItem: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: transition.base },
};

/* --------------------------------------------------------------------------
   Interaction feedback
   -------------------------------------------------------------------------- */

export const pressable = {
  whileHover: { y: -1 },
  whileTap: { scale: 0.985 },
  transition: transition.fast,
} as const;

export const liftable = {
  whileHover: { y: -3 },
  transition: transition.base,
} as const;

/* --------------------------------------------------------------------------
   Numeric count-up for metrics
   -------------------------------------------------------------------------- */

export function useCountUp(target: number, decimals = 0) {
  const reduced = useReducedMotion();
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (reduced) return;
    const controls = animate(0, target, {
      duration: 0.9,
      ease: ease.out,
      onUpdate: setValue,
    });
    return () => controls.stop();
  }, [target, reduced]);

  const current = reduced ? target : value;
  return decimals === 0 ? Math.round(current) : Number(current.toFixed(decimals));
}
