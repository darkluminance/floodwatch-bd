export type Depth = "Ankle" | "Knee" | "Waist" | "Above";

export type TimeRange = "6h" | "24h" | "3d";

export type VoteKind = "confirmed" | "disputed";

/** A single flood report persisted on the device. */
export interface Report {
  id: string;
  lat: number;
  lng: number;
  depth: Depth | null;
  note: string;
  verified: boolean;
  /** Epoch ms. */
  createdAt: number;
  votes: { confirm: number; dispute: number };
  /** Region key this report was attributed to, when known. */
  region?: string;
  /** True for reports created by this device in this session/history. */
  mine?: boolean;
}

export type ReportMode = "auto" | "manual";

/** In-progress report being composed through the report flow. */
export interface DraftReport {
  mode: ReportMode | null;
  pin: { lat: number; lng: number } | null;
  depth: Depth | null;
  note: string;
  region?: string;
  locLabel?: string;
}

export interface Filters {
  time: TimeRange;
  verified: boolean;
}

export type Screen = "onboarding" | "map";
export type SheetKind = "report" | "area" | "filter" | null;
export type ReportStep =
  | "mode"
  | "locating"
  | "placing"
  | "details"
  | "done"
  | null;

export interface UIState {
  screen: Screen;
  sheet: SheetKind;
  step: ReportStep;
  /** Selected area/region key for the area detail sheet. */
  area: string | null;
  draft: DraftReport;
  filters: Filters;
  /** Vote recorded for the currently open area sheet. */
  vote: VoteKind | null;
  /** Message shown when a submission is blocked by the cooldown. */
  cooldownMsg: string | null;
}
