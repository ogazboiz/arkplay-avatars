/* Studio telemetry (docs/studio.md): event types for hosts, the batching tracker,
 * and the hooks the studio root uses. See events.ts for what is (and never is) reported. */

export { STUDIO_EVENTS, TELEMETRY_KEY_RE, cleanEvent, type StudioEventName, type StudioTelemetryEvent, type StudioTelemetrySink } from './events.ts'
export { FLUSH_MS, MAX_BYTES, MAX_EVENTS, createTelemetryTracker, randomSid, type TelemetryBatch, type TelemetrySource, type TelemetryTracker, type TrackerOptions } from './tracker.ts'
export { ActiveTimer, IDLE_MS } from './session.ts'
export { historyStep, instrumentActions, type Emit } from './instrument.ts'
export { TelemetryContext, useStudioTelemetry, useTelemetryView, useTrack, type StudioTelemetry, type TelemetryView } from './react.ts'
