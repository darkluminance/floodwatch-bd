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
} from "./geo";
import type {
  Depth,
  DraftReport,
  Report,
  TimeRange,
  UIState,
  VoteKind,
} from "./types";

/** How often the client re-fetches the shared feed (reports + votes), ms. */
const POLL_MS = 30_000;

export interface RegionTally {
  confirm: number;
  dispute: number;
}
interface Feed {
  reports: Report[];
  votes: Record<string, RegionTally>;
  myVotes: Record<string, VoteKind>;
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
  area: null,
  draft: emptyDraft,
  filters: { time: "24h", verified: false },
  vote: null,
  cooldownMsg: null,
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
  | { type: "OPEN_AREA"; area: string; vote: VoteKind | null }
  | { type: "SET_VOTE"; vote: VoteKind }
  | { type: "SET_TIME"; time: TimeRange }
  | { type: "TOGGLE_VERIFIED" }
  | { type: "SET_COOLDOWN_MSG"; msg: string | null };

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
      return { ...state, sheet: null, step: null, cooldownMsg: null };
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
    case "OPEN_AREA":
      return { ...state, sheet: "area", area: action.area, vote: action.vote };
    case "SET_VOTE":
      return { ...state, vote: action.vote };
    case "SET_TIME":
      return { ...state, filters: { ...state.filters, time: action.time } };
    case "TOGGLE_VERIFIED":
      return {
        ...state,
        filters: { ...state.filters, verified: !state.filters.verified },
      };
    case "SET_COOLDOWN_MSG":
      return { ...state, cooldownMsg: action.msg };
    default:
      return state;
  }
}

export interface FloodStore {
  ui: UIState;
  showOnboarding: boolean;
  reports: Report[];
  visibleReports: Report[];
  /** This device's own vote per region (server-tracked by IP). */
  myVotes: Record<string, VoteKind>;
  /** Shared vote tallies per region. */
  tallies: Record<string, RegionTally>;
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
  // area
  openArea: (key: string) => void;
  confirmArea: () => void;
  disputeArea: () => void;
  reportHere: () => void;
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

const EMPTY_TALLIES: Record<string, RegionTally> = {};
const EMPTY_MY_VOTES: Record<string, VoteKind> = {};

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
  const [tallies, setTallies] =
    useState<Record<string, RegionTally>>(EMPTY_TALLIES);
  const [myVotes, setMyVotes] =
    useState<Record<string, VoteKind>>(EMPTY_MY_VOTES);
  // Onboarding is intentionally in-memory only (no local storage): shown once
  // per page load, dismissed for the rest of the session.
  const [onboardingDone, setOnboardingDone] = useState(false);

  const mapRef = useRef<LeafletMap | null>(null);

  // ---- live feed: fetch on mount + poll ----
  const refetch = useCallback(async () => {
    try {
      const res = await fetch("/api/reports", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as Feed;
      setReports(data.reports);
      setTallies(data.votes ?? EMPTY_TALLIES);
      setMyVotes(data.myVotes ?? EMPTY_MY_VOTES);
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
  const closeSheet = useCallback(() => dispatch({ type: "CLOSE_SHEET" }), []);

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

  const finishReport = useCallback(() => dispatch({ type: "CLOSE_SHEET" }), []);

  // ---- area ----
  const openArea = useCallback(
    (key: string) =>
      dispatch({ type: "OPEN_AREA", area: key, vote: myVotes[key] ?? null }),
    [myVotes],
  );

  const castVote = useCallback(
    async (kind: VoteKind) => {
      const region = ui.area;
      if (!region || myVotes[region]) return;
      // optimistic
      dispatch({ type: "SET_VOTE", vote: kind });
      setMyVotes((prev) => ({ ...prev, [region]: kind }));
      setTallies((prev) => {
        const cur = prev[region] ?? { confirm: 0, dispute: 0 };
        const field = kind === "confirmed" ? "confirm" : "dispute";
        return { ...prev, [region]: { ...cur, [field]: cur[field] + 1 } };
      });
      try {
        await fetch("/api/votes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ region, kind }),
        });
      } catch {
        /* best-effort; poll reconciles tallies */
      }
    },
    [ui.area, myVotes],
  );
  const confirmArea = useCallback(() => castVote("confirmed"), [castVote]);
  const disputeArea = useCallback(() => castVote("disputed"), [castVote]);
  const reportHere = useCallback(() => dispatch({ type: "OPEN_REPORT" }), []);

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
      myVotes,
      tallies,
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
      openArea,
      confirmArea,
      disputeArea,
      reportHere,
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
      myVotes,
      tallies,
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
      openArea,
      confirmArea,
      disputeArea,
      reportHere,
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
