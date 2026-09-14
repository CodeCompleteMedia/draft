// How long the class view's big moments last. The admin board uses the same
// numbers to hold the next step until the class has seen the last one.
const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

export const SPIN_MS = reduced ? 1200 : 6500
export const CAPTAIN_MS = reduced ? 2000 : 4200
export const SUSPENSE_MS = reduced ? 800 : 2600
export const REVEAL_HOLD_MS = reduced ? 2500 : 4200
export const REVEAL_MS = SUSPENSE_MS + REVEAL_HOLD_MS
export const REDUCED_MOTION = reduced
