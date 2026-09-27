/* @arkplay/avatar-studio — public API. The ArkPlay website and the studio app import only
 * from here (plus '@arkplay/avatar-studio/styles.css'). */

export { AvatarStudio } from './AvatarStudio.tsx'
export { AvatarImage, type AvatarImageProps } from './AvatarImage.tsx'
export type { AvatarStudioProps, AvatarStudioHandle, OutfitStore, SaveResult } from './types.ts'
export { exportAvatar } from './export/exportAvatar.ts'
export { EXPORT_FORMATS, type ExportFormat, type ExportFormatInfo, type ExportOptions, type ExportResult } from './export/formats.ts'
export { webmMimeType } from './export/webm.ts'
export { STRINGS, fmt, type StudioStrings } from './strings.ts'
export { localOutfitStore } from './state/storage.ts'
// Premium core (G): premium looks come from the avatar service (docs/studio.md).
export { premiumService, PremiumPreviewError, PremiumExportError, type PremiumService, type PremiumPreviewRequest, type PreviewFetch } from './render/premium.ts'
// Studio telemetry (F): event types and the batching tracker hosts send `onTelemetry` events with.
export { STUDIO_EVENTS, createTelemetryTracker, type StudioEventName, type StudioTelemetryEvent, type StudioTelemetrySink, type TelemetryBatch, type TelemetrySource, type TelemetryTracker, type TrackerOptions } from './telemetry/index.ts'
