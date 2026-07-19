"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Map as LeafletMap } from "leaflet";
import {
  clampToBD,
  filterReports,
  INITIAL_ZOOM,
  isInBangladesh,
  labelForPoint,
  nearestRegion,
  type ReportCluster,
} from "./geo";
import type {
  Depth,
  DraftReport,
  Report,
  TimeRange,
  UIState,
  VoteKind,
} from "./types";

/** How often the client re-fetches the shared report feed, ms. */
const POLL_MS = 30_000;

interface Feed {
  reports: Report[];
}

/** A ClusterSheet's spot-vote tally + this device's own spot vote. */
export interface LocationTally {
  confirm: number;
  dispute: number;
  mine: VoteKind | null;
}

/** The currently open cluster (report ids + centroid), for the ClusterSheet. */
interface ActiveCluster {
  ids: string[];
  lat: number;
  lng: number;
}

const emptyDraft: DraftReport = {
  mode: null,
  pin: null,
  depth: null,
  note: "",
};

const initialUI: UIState = {
  screen: "map",
  sheet: null,
  step: null,
  draft: emptyDraft,
  filters: { time: "24h", verified: false },
  cooldownMsg: null,
  detailReportId: null,
  detailMsg: null,
};

type Action =
  | { type: "OPEN_REPORT" }
  | { type: "OPEN_FILTER" }
  | { type: "CLOSE_SHEET" }
  | { type: "SET_STEP"; step: UIState["step"] }
  | { type: "SET_MODE"; mode: "auto" | "manual" }
  | {
      type: "SET_PIN";
      pin: { lat: number; lng: number };
      region?: string;
      locLabel?: string;
    }
  | { type: "SET_DEPTH"; depth: Depth }
  | { type: "SET_NOTE"; note: string }
  | { type: "SET_TIME"; time: TimeRange }
  | { type: "TOGGLE_VERIFIED" }
  | { type: "SET_COOLDOWN_MSG"; msg: string | null }
  | { type: "OPEN_CLUSTER" }
  | { type: "OPEN_REPORT_DETAIL"; reportId: string }
  | { type: "SET_DETAIL_MSG"; msg: string | null };

function reducer(state: UIState, action: Action): UIState {
  switch (action.type) {
    case "OPEN_REPORT":
      return {
        ...state,
        sheet: "report",
        step: "mode",
        draft: emptyDraft,
        cooldownMsg: null,
      };
    case "OPEN_FILTER":
      return { ...state, sheet: "filter" };
    case "CLOSE_SHEET":
      return {
        ...state,
        sheet: null,
        step: null,
        cooldownMsg: null,
        detailReportId: null,
        detailMsg: null,
      };
    case "SET_STEP":
      return { ...state, step: action.step };
    case "SET_MODE":
      return { ...state, draft: { ...state.draft, mode: action.mode } };
    case "SET_PIN":
      return {
        ...state,
        draft: {
          ...state.draft,
          pin: action.pin,
          region: action.region,
          locLabel: action.locLabel,
        },
        step: "details",
      };
    case "SET_DEPTH":
      return { ...state, draft: { ...state.draft, depth: action.depth } };
    case "SET_NOTE":
      return { ...state, draft: { ...state.draft, note: action.note } };
    case "SET_TIME":
      return { ...state, filters: { ...state.filters, time: action.time } };
    case "TOGGLE_VERIFIED":
      return {
        ...state,
        filters: { ...state.filters, verified: !state.filters.verified },
      };
    case "SET_COOLDOWN_MSG":
      return { ...state, cooldownMsg: action.msg };
    case "OPEN_CLUSTER":
      return {
        ...state,
        sheet: "cluster",
        detailReportId: null,
        detailMsg: null,
      };
    case "OPEN_REPORT_DETAIL":
      return {
        ...state,
        sheet: "reportDetail",
        detailReportId: action.reportId,
        detailMsg: null,
      };
    case "SET_DETAIL_MSG":
      return { ...state, detailMsg: action.msg };
    default:
      return state;
  }
}

export interface FloodStore {
  ui: UIState;
  showOnboarding: boolean;
  reports: Report[];
  visibleReports: Report[];
  // onboarding
  allowLocation: () => void;
  skipLocation: () => void;
  // report flow
  openReport: () => void;
  openFilter: () => void;
  closeSheet: () => void;
  chooseAuto: () => void;
  chooseManual: () => void;
  editLocation: () => void;
  placePin: (lat: number, lng: number) => void;
  setDepth: (d: Depth) => void;
  setNote: (n: string) => void;
  submitReport: () => void;
  finishReport: () => void;
  reportHere: () => void;
  // clusters (aggregate spot view)
  activeCluster: ActiveCluster | null;
  clusterExpanded: boolean;
  locationTally: LocationTally | null;
  openCluster: (cluster: ReportCluster) => void;
  voteLocation: (kind: VoteKind) => void;
  setClusterExpanded: (v: boolean) => void;
  // per-report verification (drill-down)
  openReportDetail: (reportId: string) => void;
  voteReport: (kind: VoteKind) => void;
  /** Report IDs this device voted on this session (for button state). */
  votedReports: Set<string>;
  // filters
  setTime: (t: TimeRange) => void;
  toggleVerified: () => void;
  // map control
  registerMap: (map: LeafletMap | null) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  focusOn: (lat: number, lng: number, zoom?: number) => void;
}

const StoreContext = createContext<FloodStore | null>(null);

export function useFlood(): FloodStore {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useFlood must be used within <FloodProvider>");
  return ctx;
}

export function FloodProvider({
  children,
  initialReports = [],
}: {
  children: ReactNode;
  /** Server-rendered initial report list (SSR) — polling refreshes it. */
  initialReports?: Report[];
}) {
  const [ui, dispatch] = useReducer(reducer, initialUI);
  const [reports, setReports] = useState<Report[]>(initialReports);
  // Onboarding is intentionally in-memory only (no local storage): shown once
  // per page load, dismissed for the rest of the session.
  const [onboardingDone, setOnboardingDone] = useState(false);
  // Votes this device cast this session (server enforces the real dedup).
  const [votedReports, setVotedReports] = useState<Set<string>>(
    () => new Set(),
  );
  const [activeCluster, setActiveCluster] = useState<ActiveCluster | null>(null);
  const [clusterExpanded, setClusterExpanded] = useState(false);
  const [locationTally, setLocationTally] = useState<LocationTally | null>(null);

  const mapRef = useRef<LeafletMap | null>(null);

  // ---- live feed: fetch on mount + poll ----
  const refetch = useCallback(async () => {
    try {
      const res = await fetch("/api/reports", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as Feed;
      setReports(data.reports);
    } catch {
      /* offline / transient — keep last good data */
    }
  }, []);

  useEffect(() => {
    // Poll the shared feed. setState happens only after fetch resolves (async),
    // which is the sanctioned "subscribe to an external system" effect pattern.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refetch();
    const id = setInterval(refetch, POLL_MS);
    return () => clearInterval(id);
  }, [refetch]);

  const visibleReports = useMemo(
    () => filterReports(reports, ui.filters.time, ui.filters.verified),
    [reports, ui.filters.time, ui.filters.verified],
  );

  // ---- map control ----
  const registerMap = useCallback((map: LeafletMap | null) => {
    mapRef.current = map;
  }, []);
  const zoomIn = useCallback(() => mapRef.current?.zoomIn(), []);
  const zoomOut = useCallback(() => mapRef.current?.zoomOut(), []);
  const focusOn = useCallback((lat: number, lng: number, zoom = 11) => {
    const map = mapRef.current;
    if (!map) return;
    // flyTo's zoom-curve math divides by the map size and throws (NaN latlng)
    // if the container isn't laid out yet — fall back to a plain setView.
    const size = map.getSize();
    if (size.x > 0 && size.y > 0) {
      try {
        map.flyTo([lat, lng], zoom, { duration: 0.8 });
        return;
      } catch {
        /* fall through to setView */
      }
    }
    map.setView([lat, lng], zoom);
  }, []);

  // ---- geolocation ----
  const locate = useCallback(
    (onFix: (lat: number, lng: number) => void, onFail: () => void) => {
      if (typeof navigator === "undefined" || !navigator.geolocation) {
        onFail();
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => onFix(pos.coords.latitude, pos.coords.longitude),
        () => onFail(),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
      );
    },
    [],
  );

  const allowLocation = useCallback(() => {
    setOnboardingDone(true);
    locate(
      (lat, lng) => {
        const [cl, cn] = clampToBD(lat, lng);
        focusOn(cl, cn, 11);
      },
      () => {},
    );
  }, [locate, focusOn]);

  const skipLocation = useCallback(() => setOnboardingDone(true), []);

  // ---- report flow ----
  const openReport = useCallback(() => dispatch({ type: "OPEN_REPORT" }), []);
  const openFilter = useCallback(() => dispatch({ type: "OPEN_FILTER" }), []);
  const closeSheet = useCallback(() => {
    dispatch({ type: "CLOSE_SHEET" });
    setActiveCluster(null);
    setClusterExpanded(false);
    setLocationTally(null);
  }, []);

  const goDetailsWith = useCallback((lat: number, lng: number) => {
    const [cl, cn] = clampToBD(lat, lng);
    const region = nearestRegion(cl, cn)?.key;
    dispatch({
      type: "SET_PIN",
      pin: { lat: cl, lng: cn },
      region,
      locLabel: labelForPoint(cl, cn),
    });
  }, []);

  const chooseAuto = useCallback(() => {
    dispatch({ type: "SET_MODE", mode: "auto" });
    dispatch({ type: "SET_STEP", step: "locating" });
    locate(
      (lat, lng) => {
        focusOn(lat, lng, 12);
        goDetailsWith(lat, lng);
      },
      () => {
        dispatch({ type: "SET_MODE", mode: "manual" });
        dispatch({ type: "SET_STEP", step: "placing" });
      },
    );
  }, [locate, focusOn, goDetailsWith]);

  const chooseManual = useCallback(() => {
    dispatch({ type: "SET_MODE", mode: "manual" });
    dispatch({ type: "SET_STEP", step: "placing" });
  }, []);

  const editLocation = useCallback(
    () => dispatch({ type: "SET_STEP", step: "mode" }),
    [],
  );

  const placePin = useCallback(
    (lat: number, lng: number) => {
      if (!isInBangladesh(lat, lng)) return;
      goDetailsWith(lat, lng);
    },
    [goDetailsWith],
  );

  const setDepth = useCallback(
    (d: Depth) => dispatch({ type: "SET_DEPTH", depth: d }),
    [],
  );
  const setNote = useCallback(
    (n: string) => dispatch({ type: "SET_NOTE", note: n }),
    [],
  );

  const submitReport = useCallback(async () => {
    const pin = ui.draft.pin;
    if (!pin) return;
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lat: pin.lat,
          lng: pin.lng,
          depth: ui.draft.depth,
          note: ui.draft.note.trim(),
        }),
      });
      if (res.status === 429 || res.status === 422) {
        const data = (await res.json()) as { message: string };
        dispatch({ type: "SET_COOLDOWN_MSG", msg: data.message });
        return;
      }
      if (!res.ok) {
        dispatch({
          type: "SET_COOLDOWN_MSG",
          msg: "Something went wrong. Please try again.",
        });
        return;
      }
      const { report } = (await res.json()) as { report: Report };
      setReports((prev) => [...prev, report]); // optimistic; poll reconciles
      dispatch({ type: "SET_STEP", step: "done" });
    } catch {
      dispatch({
        type: "SET_COOLDOWN_MSG",
        msg: "Network error — please check your connection and try again.",
      });
    }
  }, [ui.draft]);

  const finishReport = useCallback(() => closeSheet(), [closeSheet]);
  const reportHere = useCallback(() => dispatch({ type: "OPEN_REPORT" }), []);

  // ---- clusters (aggregate spot view) ----
  const openCluster = useCallback((cluster: ReportCluster) => {
    setActiveCluster({ ids: cluster.ids, lat: cluster.lat, lng: cluster.lng });
    setClusterExpanded(false);
    setLocationTally(null);
    dispatch({ type: "OPEN_CLUSTER" });
    // Load the shared spot tally for the cluster centroid.
    fetch(`/api/votes?lat=${cluster.lat}&lng=${cluster.lng}`, {
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((t: LocationTally | null) => {
        if (t) setLocationTally(t);
      })
      .catch(() => {});
  }, []);

  const voteLocation = useCallback(
    async (kind: VoteKind) => {
      const c = activeCluster;
      if (!c || locationTally?.mine) return;
      // optimistic
      setLocationTally((prev) => {
        const base = prev ?? { confirm: 0, dispute: 0, mine: null };
        const field = kind === "confirmed" ? "confirm" : "dispute";
        return { ...base, [field]: base[field] + 1, mine: kind };
      });
      try {
        await fetch("/api/votes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lat: c.lat, lng: c.lng, kind }),
        });
      } catch {
        /* best-effort; the tally re-loads next time the sheet opens */
      }
    },
    [activeCluster, locationTally],
  );

  // ---- per-report verification (drill-down) ----
  const openReportDetail = useCallback(
    (reportId: string) => dispatch({ type: "OPEN_REPORT_DETAIL", reportId }),
    [],
  );

  const voteReport = useCallback(
    async (kind: VoteKind) => {
      const reportId = ui.detailReportId;
      if (!reportId || votedReports.has(reportId)) return;
      setVotedReports((prev) => new Set(prev).add(reportId));
      try {
        const res = await fetch("/api/votes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reportId, kind }),
        });
        if (res.status === 409) {
          dispatch({
            type: "SET_DETAIL_MSG",
            msg: "You already voted on this report.",
          });
          return;
        }
        if (!res.ok) {
          dispatch({
            type: "SET_DETAIL_MSG",
            msg: "Couldn't record your vote — please try again.",
          });
          return;
        }
        const data = (await res.json()) as {
          verified?: boolean;
          removed?: boolean;
        };
        dispatch({
          type: "SET_DETAIL_MSG",
          msg: data.removed
            ? "✓ Thanks — enough people marked this cleared, so it's been removed."
            : kind === "confirmed"
              ? data.verified
                ? "✓ Verified — thanks, enough neighbours confirmed this."
                : "✓ Thanks — you confirmed this report."
              : "✓ Noted — you marked this as cleared.",
        });
        refetch();
      } catch {
        dispatch({
          type: "SET_DETAIL_MSG",
          msg: "Network error — please try again.",
        });
      }
    },
    [ui.detailReportId, votedReports, refetch],
  );

  // ---- filters ----
  const setTime = useCallback(
    (t: TimeRange) => dispatch({ type: "SET_TIME", time: t }),
    [],
  );
  const toggleVerified = useCallback(
    () => dispatch({ type: "TOGGLE_VERIFIED" }),
    [],
  );

  const showOnboarding = !onboardingDone;

  const value: FloodStore = useMemo(
    () => ({
      ui,
      showOnboarding,
      reports,
      visibleReports,
      allowLocation,
      skipLocation,
      openReport,
      openFilter,
      closeSheet,
      chooseAuto,
      chooseManual,
      editLocation,
      placePin,
      setDepth,
      setNote,
      submitReport,
      finishReport,
      reportHere,
      activeCluster,
      clusterExpanded,
      locationTally,
      openCluster,
      voteLocation,
      setClusterExpanded,
      openReportDetail,
      voteReport,
      votedReports,
      setTime,
      toggleVerified,
      registerMap,
      zoomIn,
      zoomOut,
      focusOn,
    }),
    [
      ui,
      showOnboarding,
      reports,
      visibleReports,
      allowLocation,
      skipLocation,
      openReport,
      openFilter,
      closeSheet,
      chooseAuto,
      chooseManual,
      editLocation,
      placePin,
      setDepth,
      setNote,
      submitReport,
      finishReport,
      reportHere,
      activeCluster,
      clusterExpanded,
      locationTally,
      openCluster,
      voteLocation,
      setClusterExpanded,
      openReportDetail,
      voteReport,
      votedReports,
      setTime,
      toggleVerified,
      registerMap,
      zoomIn,
      zoomOut,
      focusOn,
    ],
  );

  return (
    <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
  );
}

export { INITIAL_ZOOM };
