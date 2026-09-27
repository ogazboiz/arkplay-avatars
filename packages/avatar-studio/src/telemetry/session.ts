/* Active time of a studio session: how long the player actually used it.
 *
 * Every input (pointer, key, wheel, touch) makes the next IDLE_MS count as active; time while
 * the page is hidden never counts. So active time is the union of [input, input + IDLE_MS]
 * windows over visible time: reading the panel for half a minute counts, a tab left open over
 * lunch does not. Becoming visible again counts as an input.
 *
 * Pure: the clock is injected, so the rules are unit-tested (test/telemetry.test.ts). */

export const IDLE_MS = 60_000

export class ActiveTimer {
  private readonly now: () => number
  private readonly idleMs: number
  private activeMs = 0
  /** Time up to which active time has been added. */
  private mark: number
  /** The user counts as active until then (0 while hidden). */
  private until: number

  constructor(now: () => number = Date.now, idleMs = IDLE_MS, visible = true) {
    this.now = now
    this.idleMs = idleMs
    const t = now()
    this.mark = t
    this.until = visible ? t + idleMs : 0
  }

  private account(t: number): void {
    if (this.until > this.mark) this.activeMs += Math.max(0, Math.min(t, this.until) - this.mark)
    this.mark = Math.max(this.mark, t)
  }

  /** A pointer, key, wheel or touch input. */
  activity(): void {
    const t = this.now()
    if (this.until === 0) return
    this.account(t)
    this.until = t + this.idleMs
  }

  hidden(): void {
    this.account(this.now())
    this.until = 0
  }

  visible(): void {
    const t = this.now()
    this.account(t)
    this.mark = t
    this.until = t + this.idleMs
  }

  /** Active milliseconds so far. */
  total(): number {
    this.account(this.now())
    return this.activeMs
  }

  /** Starts over from now (telemetry was just allowed). */
  reset(visible = true): void {
    const t = this.now()
    this.activeMs = 0
    this.mark = t
    this.until = visible ? t + this.idleMs : 0
  }
}
