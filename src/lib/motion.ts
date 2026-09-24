import type { Transition, Variants } from "motion/react";

// Sandstone motion: weighted, never springy. Nothing bounces; nothing overshoots.
// These mirror --ease-* and --dur-* in the token set.
export const EASE_OUT = [0.16, 0.84, 0.32, 1] as const;
export const EASE_STANDARD = [0.2, 0.6, 0.2, 1] as const;

export const DUR = { fast: 0.14, base: 0.22, slow: 0.36, reveal: 0.64 } as const;

export const tween = (duration: number = DUR.base, delay = 0): Transition => ({
  type: "tween",
  ease: EASE_OUT,
  duration,
  delay,
});

/** Layout moves (reordering, cards changing column) glide rather than spring. */
export const layoutTween: Transition = { type: "tween", ease: EASE_STANDARD, duration: DUR.slow };

export const page: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: tween(DUR.slow) },
  exit: { opacity: 0, y: -4, transition: tween(DUR.fast) },
};

/** Parent/child pair for staggered row reveals. Capped so long lists don't drag. */
export const list: Variants = {
  initial: {},
  animate: { transition: { staggerChildren: 0.028, delayChildren: 0.04 } },
};
export const row: Variants = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0, transition: tween(DUR.slow) },
};

export const swap: Variants = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0, transition: tween(DUR.base) },
  exit: { opacity: 0, y: -4, transition: tween(DUR.fast) },
};
