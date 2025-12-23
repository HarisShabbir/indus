import React, {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Circle,
  CircleMarker,
  MapContainer,
  Marker,
  Popup,
  ScaleControl,
  TileLayer,
  Tooltip,
  ZoomControl,
  useMap,
} from "react-leaflet";
import { GoPlusCircle } from "react-icons/go";
import L, { DivIcon, LatLngBoundsExpression } from "leaflet";
import {
  Alert,
  Project,
  ProjectAnalytics,
  ContractSite,
  ProjectControlCenterPayload,
  WorkInProgressMetric,
  createProject,
  fetchAlerts,
  fetchProjectAnalytics,
  fetchProjectControlCenter,
  fetchProjects,
  fetchWeatherSummary,
  WeatherSummary,
} from "../api";
import ProjectProductivityPanel from "../panels/ProjectProductivityPanel";
import MapWipSplit from "../components/MapWipSplit";
import { FEATURE_SCHEDULE_UI } from "../config";
import "leaflet/dist/leaflet.css";
import Breadcrumbs from "../components/breadcrumbs/Breadcrumbs";
import {
  SidebarNav,
  sidebarItems,
  HOME_NAV_INDEX,
  ACCS_NAV_INDEX,
  ThemeToggleButton,
  type ThemeMode,
} from "../layout/navigation";
import {
  persistCredentials,
  readAuthToken,
  readSavedCredentials,
  setAuthToken,
} from "../utils/auth";

type Theme = ThemeMode;
type View = "landing" | "login" | "dashboard" | "contract";
type PhaseFilter = "All" | "Construction" | "O&M" | "Planning & Design";
type MapView = "atlas" | "satellite" | "terrain" | "blueprint";

type MapFeatureToggle = {
  geofences: boolean;
  intensity: boolean;
};

const MAP_WIP_SPLIT_STORAGE_KEY = "mapWipSplit:v2";
const DEFAULT_MAP_WIP_SPLIT: [number, number] = [70, 30];
const MIN_CONTRACT_MAP_HEIGHT = 480;
const MIN_CONTRACT_WIP_HEIGHT = 320;

const normaliseSplitSizes = (sizes: number[]): [number, number] => {
  if (sizes.length !== 2) {
    return [...DEFAULT_MAP_WIP_SPLIT];
  }
  const numeric = sizes.map((value, index) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return DEFAULT_MAP_WIP_SPLIT[index];
    }
    return parsed;
  });
  const sum = numeric[0] + numeric[1];
  if (sum <= 0) {
    return [...DEFAULT_MAP_WIP_SPLIT];
  }
  const [top, bottom] = numeric.map((value) =>
    Number(((value / sum) * 100).toFixed(2))
  ) as [number, number];
  return [top, bottom];
};

const readStoredSplitSizes = (): [number, number] => {
  if (typeof window === "undefined") {
    return [...DEFAULT_MAP_WIP_SPLIT];
  }
  const raw = window.localStorage.getItem(MAP_WIP_SPLIT_STORAGE_KEY);
  if (!raw) {
    return [...DEFAULT_MAP_WIP_SPLIT];
  }
  try {
    const parsed = JSON.parse(raw) as number[];
    return normaliseSplitSizes(parsed);
  } catch {
    return [...DEFAULT_MAP_WIP_SPLIT];
  }
};

const PROJECT_CONTROL_CENTER_CACHE = new Map<
  string,
  ProjectControlCenterPayload
>();
const PROJECT_CONTROL_CENTER_INFLIGHT = new Map<
  string,
  Promise<ProjectControlCenterPayload>
>();

const getCachedProjectControlCenter = (projectId: string) =>
  PROJECT_CONTROL_CENTER_CACHE.get(projectId);

const warmProjectControlCenter = (
  projectId: string
): Promise<ProjectControlCenterPayload> => {
  if (!projectId) {
    return Promise.reject(new Error("Missing project id"));
  }
  const cached = PROJECT_CONTROL_CENTER_CACHE.get(projectId);
  if (cached) {
    return Promise.resolve(cached);
  }
  const inflight = PROJECT_CONTROL_CENTER_INFLIGHT.get(projectId);
  if (inflight) {
    return inflight;
  }
  const request = fetchProjectControlCenter(projectId)
    .then((payload) => {
      PROJECT_CONTROL_CENTER_CACHE.set(projectId, payload);
      PROJECT_CONTROL_CENTER_INFLIGHT.delete(projectId);
      return payload;
    })
    .catch((error) => {
      PROJECT_CONTROL_CENTER_INFLIGHT.delete(projectId);
      throw error;
    });
  PROJECT_CONTROL_CENTER_INFLIGHT.set(projectId, request);
  return request;
};

const FALLBACK_PROJECTS: Project[] = [
  {
    id: "mohmand-dam",
    name: "Mohmand Dam",
    phase: "Construction",
    status_pct: 43,
    status_label: undefined,
    alerts: 28,
    address: "Mohmand Dam, Mohmand Agency, Pakistan",
    lat: 34.755,
    lng: 71.215,
    image: "/images/ACCS/mangla.png",
    geofence_radius_m: 1500,
  },
  {
    id: "dasu-hpp",
    name: "Dasu Hydropower Project",
    phase: "Construction",
    status_pct: 20,
    status_label: undefined,
    alerts: 22,
    address: "Dasu Hydropower Project, Upper Kohistan, Pakistan",
    lat: 35.291,
    lng: 72.103,
    image: "/images/ACCS/ghazi.png",
    geofence_radius_m: 1800,
  },
  {
    id: "diamer-basha",
    name: "Diamer Basha Dam",
    phase: "Construction",
    status_pct: 20,
    status_label: undefined,
    alerts: 12,
    address: "Diamer Basha Dam, Gilgit-Baltistan, Pakistan",
    lat: 35.619,
    lng: 74.616,
    image: "/images/ACCS/chashma.png",
    geofence_radius_m: 2000,
  },
  {
    id: "ts-extension",
    name: "Tarbela 5th Extension",
    phase: "Construction",
    status_pct: 47.5,
    status_label: undefined,
    alerts: 8,
    address: "Tarbela Power Project, Haripur, Pakistan",
    lat: 34.088,
    lng: 72.693,
    image: "/images/ACCS/tarbela.png",
    geofence_radius_m: 1400,
  },
  {
    id: "tarbela-4th",
    name: "Tarbela 4th Extension",
    phase: "O&M",
    status_pct: 100,
    status_label: "In-operation",
    alerts: 22,
    address: "Tarbela Dam, Haripur, Pakistan",
    lat: 34.088,
    lng: 72.693,
    image: "/images/ACCS/tarbela.png",
    geofence_radius_m: 1200,
  },
  {
    id: "mangla",
    name: "Mangla Dam",
    phase: "O&M",
    status_pct: 100,
    status_label: "Maintenance",
    alerts: 22,
    address: "Mangla Dam, Mirpur, Azad Kashmir",
    lat: 33.135,
    lng: 73.64,
    image: "/images/ACCS/mangla.png",
    geofence_radius_m: 1600,
  },
  {
    id: "ghazi-barotha",
    name: "Ghazi-Barotha",
    phase: "O&M",
    status_pct: 100,
    status_label: "In-operation",
    alerts: 22,
    address: "Ghazi Barotha Hydropower Project, Attock, Pakistan",
    lat: 33.969,
    lng: 72.708,
    image: "/images/ACCS/ghazi.png",
    geofence_radius_m: 1300,
  },
  {
    id: "chashma",
    name: "Chashma Hydropower Plant",
    phase: "O&M",
    status_pct: 100,
    status_label: "Shutdown",
    alerts: 22,
    address: "Chashma Barrage, Mianwali, Pakistan",
    lat: 32.39,
    lng: 71.41,
    image: "/images/ACCS/chashma.png",
    geofence_radius_m: 1500,
  },
  {
    id: "bungi-hpp",
    name: "Bungi Hydropower Project",
    phase: "Planning & Design",
    status_pct: 12,
    status_label: "Concept",
    alerts: 5,
    address: "Bunji, Gilgit-Baltistan, Pakistan",
    lat: 35.68,
    lng: 74.617,
    image: "/images/ACCS/ghazi.png",
    geofence_radius_m: 2100,
  },
  {
    id: "harpo-hpp",
    name: "Harpo Hydropower Project",
    phase: "Planning & Design",
    status_pct: 18,
    status_label: "Feasibility",
    alerts: 7,
    address: "Harpo, Skardu, Gilgit-Baltistan",
    lat: 35.33,
    lng: 74.81,
    image: "/images/ACCS/mangla.png",
    geofence_radius_m: 1800,
  },
  {
    id: "pattan-dam",
    name: "Pattan Hydropower Project",
    phase: "Planning & Design",
    status_pct: 9,
    status_label: "Pre-feasibility",
    alerts: 6,
    address: "Pattan, Kohistan, Pakistan",
    lat: 35.03,
    lng: 72.943,
    image: "/images/ACCS/chashma.png",
    geofence_radius_m: 1700,
  },
  {
    id: "thakot-dam",
    name: "Thakot Hydropower Project",
    phase: "Planning & Design",
    status_pct: 15,
    status_label: "Design",
    alerts: 4,
    address: "Thakot, Batagram, Pakistan",
    lat: 34.86,
    lng: 72.915,
    image: "/images/ACCS/tarbela.png",
    geofence_radius_m: 1600,
  },
];

const FALLBACK_CONTRACT_METRICS: ProjectControlCenterPayload["metrics"] = {
  alerts: 12,
  physical: { actual: 68, planned: 82 },
  productivity: {
    design: [
      { label: "HM-1 Tender Drawings", status: "Completed", percent: 100 },
      {
        label: "MW-1 CFD Modelling Stage 3",
        status: "In Progress",
        percent: 65,
      },
    ],
    preparatory: [
      { label: "MW-1 RCC Facilities", status: "In Progress", percent: 74 },
      {
        label: "Reservoir Slope Protection",
        status: "In Progress",
        percent: 48,
      },
      { label: "Service Buildings", status: "Delayed", percent: 32 },
    ],
    construction: [
      {
        label: "MW-1 Dam Pit Excavation",
        status: "Delayed",
        actual: 74,
        planned: 82,
      },
      {
        label: "MW-1 Right Bank Abutment",
        status: "In Progress",
        actual: 62,
        planned: 62,
      },
      {
        label: "EM-02 RB Powerhouse",
        status: "In Progress",
        actual: 45,
        planned: 50,
      },
    ],
  },
  milestones: [
    { label: "Milestone A & B", status: "Completed" },
    { label: "Milestone C", status: "Delayed" },
    { label: "Milestone D", status: "In Progress" },
  ],
  quality: {
    ncr: { closed: 122, open: 34, issued: 156 },
    qaor: { closed: 169, open: 40, issued: 209 },
    conformance: [
      {
        label: "Excavation Tolerance",
        status: "Within ±0.3%",
        description: "Survey validated",
      },
      {
        label: "Rebar Quality Audits",
        status: "In Progress",
        description: "Batch sampling underway",
      },
    ],
  },
  workInProgress: [
    { contract: "MW-01", status: "Construction", percent: 68 },
    { contract: "HM-01", status: "Bidding", percent: 34 },
    { contract: "MW-02", status: "Bidding", percent: 42 },
    { contract: "EM-01", status: "Pre-PQ", percent: 18 },
    { contract: "EM-02", status: "Pre-PQ", percent: 26 },
    { contract: "HM-02", status: "PQ", percent: 22 },
  ],
  spi: {
    value: 0.75,
    status: "Amber",
    runway_days: 47,
    burn_rate_days: 47,
    cash_flow: 4_838_488,
    tasks: [
      { label: "Main Facilities for RCC", impact: "5%", status: "In Progress" },
      { label: "Dam Pit Excavation", impact: "4.8%", status: "Delayed" },
      { label: "MW-2 Commencement", impact: "10%", status: "In Progress" },
      { label: "HM-1 Commissionment", impact: "10%", status: "In Progress" },
    ],
  },
};

const FALLBACK_CONTRACTS: Record<string, ContractSite[]> = {
  "diamer-basha": [
    {
      id: "mw-01-main-dam",
      project_id: "diamer-basha",
      name: "MW-01 – Main Dam",
      phase: "Phase-1 (Dam Part)",
      discipline: "Civil",
      lat: 35.623,
      lng: 74.6135,
      status_pct: 74,
      status_label: "Construction",
      alerts: 5,
      image: "/images/contracts/blueprint.jpg",
    },
    {
      id: "mw-02-rb-powerhouse",
      project_id: "diamer-basha",
      name: "MW-02 – RB Powerhouse",
      phase: "Phase-1 (Dam Part)",
      discipline: "Mechanical",
      lat: 35.6248,
      lng: 74.6236,
      status_pct: 62,
      status_label: "Construction",
      alerts: 3,
      image: "/images/contracts/blueprint.jpg",
    },
    {
      id: "mw-02-lb-powerhouse",
      project_id: "diamer-basha",
      name: "MW-02 – LB Powerhouse",
      phase: "Phase-1 (Dam Part)",
      discipline: "Mechanical",
      lat: 35.6229,
      lng: 74.6202,
      status_pct: 54,
      status_label: "Bidding",
      alerts: 3,
      image: "/images/contracts/blueprint.jpg",
    },
    {
      id: "em-01-lb",
      project_id: "diamer-basha",
      name: "EM-01 – LB",
      phase: "Phase-1 (Dam Part)",
      discipline: "Electrical",
      lat: 35.6215,
      lng: 74.6207,
      status_pct: 58,
      status_label: "Bidding",
      alerts: 2,
      image: "/images/contracts/blueprint.jpg",
    },
    {
      id: "em-01-rb",
      project_id: "diamer-basha",
      name: "EM-01 – RB",
      phase: "Phase-1 (Dam Part)",
      discipline: "Electrical",
      lat: 35.6239,
      lng: 74.6244,
      status_pct: 52,
      status_label: "Bidding",
      alerts: 2,
      image: "/images/contracts/blueprint.jpg",
    },
    {
      id: "em-02-lb",
      project_id: "diamer-basha",
      name: "EM-02 – LB",
      phase: "Phase-1 (Dam Part)",
      discipline: "Electrical",
      lat: 35.6226,
      lng: 74.6185,
      status_pct: 48,
      status_label: "Pre-PQ",
      alerts: 3,
      image: "/images/contracts/blueprint.jpg",
    },
    {
      id: "em-02-rb",
      project_id: "diamer-basha",
      name: "EM-02 – RB",
      phase: "Phase-1 (Dam Part)",
      discipline: "Electrical",
      lat: 35.6234,
      lng: 74.6279,
      status_pct: 45,
      status_label: "Pre-PQ",
      alerts: 4,
      image: "/images/contracts/blueprint.jpg",
    },
    {
      id: "hm-01",
      project_id: "diamer-basha",
      name: "HM-1",
      phase: "Phase-2 (Power Generation)",
      discipline: "Hydro-Mechanical",
      lat: 35.6258,
      lng: 74.6138,
      status_pct: 20,
      status_label: "Bidding",
      alerts: 1,
      image: "/images/contracts/blueprint.jpg",
    },
    {
      id: "hm-02",
      project_id: "diamer-basha",
      name: "HM-2 – LB",
      phase: "Phase-2 (Power Generation)",
      discipline: "Hydro-Mechanical",
      lat: 35.6268,
      lng: 74.6109,
      status_pct: 12,
      status_label: "PQ",
      alerts: 2,
      image: "/images/contracts/blueprint.jpg",
    },
    {
      id: "hm-02-rb",
      project_id: "diamer-basha",
      name: "HM-2 – RB",
      phase: "Phase-2 (Power Generation)",
      discipline: "Hydro-Mechanical",
      lat: 35.6273,
      lng: 74.6146,
      status_pct: 10,
      status_label: "PQ",
      alerts: 2,
      image: "/images/contracts/blueprint.jpg",
    },
  ],
};

const MAP_STYLES: Record<
  MapView,
  { label: string; url: string; attribution: string; maxZoom?: number }
> = {
  atlas: {
    label: "Atlas",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: "&copy; OpenStreetMap contributors",
  },
  satellite: {
    label: "Satellite",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution:
      "&copy; ESRI &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community",
    maxZoom: 19,
  },
  terrain: {
    label: "Terrain",
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution:
      "&copy; OpenStreetMap contributors, SRTM | Map style: &copy; OpenTopoMap (CC-BY-SA)",
    maxZoom: 17,
  },
  blueprint: {
    label: "Blueprint",
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
    attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
    maxZoom: 19,
  },
};

function computeAnalytics(projects: Project[]): ProjectAnalytics {
  const total = projects.length;
  const alerts_total = projects.reduce(
    (sum, project) => sum + (project.alerts ?? 0),
    0
  );
  const average_progress = total
    ? projects.reduce((sum, project) => sum + (project.status_pct ?? 0), 0) /
      total
    : 0;
  const phase_breakdown = projects.reduce<Record<string, number>>(
    (acc, project) => {
      acc[project.phase] = (acc[project.phase] || 0) + 1;
      return acc;
    },
    {}
  );
  return {
    total_projects: total,
    phase_breakdown,
    average_progress,
    alerts_total,
  };
}

const FALLBACK_PROJECTS_BY_PHASE = FALLBACK_PROJECTS.reduce<
  Record<string, Project[]>
>((acc, project) => {
  acc[project.phase] = acc[project.phase] || [];
  acc[project.phase].push(project);
  return acc;
}, {});

const FALLBACK_ANALYTICS = computeAnalytics(FALLBACK_PROJECTS);

const STATUS_COLOR_MAP: Record<string, [number, number, number, number]> = {
  Construction: [34, 197, 94, 255],
  Bidding: [249, 115, 22, 255],
  "Pre-PQ": [245, 158, 11, 255],
  PQ: [168, 85, 247, 255],
};

const ALERT_COLOR_MAP: [number, number, number, number][] = [
  [96, 165, 250, 160],
  [59, 130, 246, 170],
  [37, 99, 235, 190],
  [239, 68, 68, 210],
];

function statusColor(
  status: string | null | undefined
): [number, number, number, number] {
  if (!status) return [59, 130, 246, 255];
  return STATUS_COLOR_MAP[status] ?? [59, 130, 246, 255];
}

// const defaultIcon = new L.Icon.Default();

function createMarkerIcon(
  project: Project,
  theme: Theme,
  isActive: boolean,
  weather?: WeatherSummary["projects"][number] | null
): DivIcon {
  const color =
    project.phase === "Construction"
      ? "#fb923c"
      : project.phase === "Planning & Design"
      ? "#38bdf8"
      : "#34d399";

  const temperature = weather?.temperatureC;
  const description = weather?.weatherDescription;
  const weatherHtml = weather
    ? `<div class="marker-weather"><span class="marker-weather__temp">${
        temperature !== null && temperature !== undefined
          ? `${Math.round(temperature)}°C`
          : ""
      }</span>${
        description
          ? `<span class="marker-weather__desc">${description}</span>`
          : ""
      }</div>`
    : "";

  const className = `project-marker theme-${theme} ${
    isActive ? "project-marker--active" : ""
  }`;
  return L.divIcon({
    className,
    html: `
    <div class="marker-container" style="position: relative;">
      <img src="/images/map-icon.png" alt="Map marker" style="width: 32px; height: 32px; display: block;" />
      <div class="marker-details" style="display: none; position: absolute; top: -10px; left: 40px; background-color: #fff; padding: 6px; border-radius: 8px; white-space: nowrap; box-shadow: 0 2px 8px rgba(0,0,0,0.15); z-index: 1000;">
        <div style="display: flex; flex-direction: column;">
          <span style="color: #F86E00; font-weight: 500;">${project.name}</span>
          <strong style="color: #328DEE;">${Math.round(
            project.status_pct
          )}%</strong>
          ${weatherHtml ?? ""}
        </div>
      </div>
    </div>
    <style>
      .marker-container:hover .marker-details {
        display: block !important;
      }
    </style>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
  });
}

const phaseAccent = (phase: string) =>
  phase === "Construction"
    ? "var(--accent-warm)"
    : phase === "Planning & Design"
    ? "var(--accent)"
    : "var(--accent-cool)";

const phaseLabel = (phase: string) =>
  phase === "Construction"
    ? "ACCS"
    : phase === "Planning & Design"
    ? "CPDS"
    : "AOS";

const contractAccent = (name: string) => {
  if (name.startsWith("MW-")) return "#38bdf8";
  if (name.startsWith("EM-")) return "#fb923c";
  if (name.startsWith("HM-")) return "#f87171";
  return "#a855f7";
};

const accentColor = (contract: ContractSite) => contractAccent(contract.name);

const phaseAccentHex = (phase: string) => {
  if (phase === "Construction") return "#fb923c";
  if (phase === "Planning & Design") return "#38bdf8";
  return "#34d399";
};

const hexToRgba = (hex: string, alpha = 1) => {
  const normalized = hex.replace("#", "");
  const bigint = parseInt(normalized, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const alertLevelColor = (alerts: number) => {
  if (alerts >= 40) return "#f87171";
  if (alerts >= 25) return "#fb923c";
  if (alerts >= 10) return "#facc15";
  return "#34d399";
};

const readableTextColor = (hex: string) => {
  const normalized = hex.replace("#", "");
  const bigint = parseInt(normalized, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#0b1220" : "#f8fafc";
};

export default function App() {
  const location = useLocation();
  const routerNavigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() =>
    readAuthToken()
  );
  const [view, setView] = useState<View>(() =>
    readAuthToken() ? "dashboard" : "landing"
  );
  const [theme, setTheme] = useState<Theme>("light");
  const [activeNav, setActiveNav] = useState(0);
  const [contractProject, setContractProject] = useState<Project | null>(null);
  const [previousNav, setPreviousNav] = useState(0);
  const [lastAccsProject, setLastAccsProject] = useState<Project | null>(null);
  const [utilityViewOverride, setUtilityViewOverride] =
    useState<UtilityView | null>(null);
  const [focusedContractOverride, setFocusedContractOverride] = useState<
    string | null
  >(null);
  const [weather, setWeather] = useState<WeatherSummary | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const toggleTheme = () =>
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));

  useEffect(() => {
    if (!isAuthenticated) {
      setWeather(null);
      return;
    }
    let cancelled = false;

    const load = () => {
      fetchWeatherSummary()
        .then((summary) => {
          if (!cancelled) {
            setWeather(summary);
          }
        })
        .catch((error) => {
          console.error("Failed to load weather summary", error);
          if (!cancelled) {
            setWeather(null);
          }
        });
    };

    load();
    const interval = window.setInterval(load, 15 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated && (view === "dashboard" || view === "contract")) {
      setView("login");
    }
  }, [isAuthenticated, view]);

  const getNavIndexForPhase = useCallback((phase: string) => {
    if (phase === "O&M") {
      return sidebarItems.findIndex((item) => item.label === "AOS");
    }
    if (phase === "Construction") {
      return sidebarItems.findIndex((item) => item.label === "ACCS");
    }
    if (phase === "Planning & Design") {
      return sidebarItems.findIndex((item) => item.label === "CPDS");
    }
    return 0;
  }, []);

  useEffect(() => {
    if (view === "landing" || view === "login") {
      setActiveNav(0);
    }
  }, [view]);

  const handleSelectNav = useCallback(
    (index: number) => {
      if (index === ACCS_NAV_INDEX) {
        if (!isAuthenticated) {
          setView("login");
          setActiveNav(HOME_NAV_INDEX);
          return;
        }
        const fallbackConstruction = FALLBACK_PROJECTS.find(
          (project) => project.phase === "Construction"
        );
        const projectToOpen =
          lastAccsProject ??
          contractProject ??
          fallbackConstruction ??
          // FALLBACK_PROJECTS[0] ??
          null;
        if (projectToOpen) {
          if (activeNav !== ACCS_NAV_INDEX) {
            setPreviousNav(activeNav);
          }
          warmProjectControlCenter(projectToOpen.id).catch(() => undefined);
          setActiveNav(index);
          setContractProject(projectToOpen);
          setLastAccsProject(projectToOpen);
          setUtilityViewOverride(null);
          setFocusedContractOverride(null);
          setView("contract");
          return;
        }
      }

      setContractProject(null);
      setActiveNav(HOME_NAV_INDEX);
      setView(isAuthenticated ? "dashboard" : "login");
    },
    [activeNav, contractProject, isAuthenticated, lastAccsProject, view]
  );

  const handleOpenContract = useCallback(
    (project: Project) => {
      if (!isAuthenticated) {
        setView("login");
        setActiveNav(HOME_NAV_INDEX);
        return;
      }
      if (activeNav !== ACCS_NAV_INDEX) {
        setPreviousNav(activeNav);
      }
      warmProjectControlCenter(project.id).catch(() => undefined);
      const targetIndex = getNavIndexForPhase(project.phase);
      setActiveNav(targetIndex);
      setContractProject(project);
      setLastAccsProject(project);
      setUtilityViewOverride(null);
      setFocusedContractOverride(null);
      setView("contract");
    },
    [activeNav, getNavIndexForPhase, isAuthenticated]
  );

  const handleCloseContract = useCallback(() => {
    setView("dashboard");
    setContractProject(null);
    setActiveNav(HOME_NAV_INDEX);
    setUtilityViewOverride(null);
    setFocusedContractOverride(null);
  }, []);

  useEffect(() => {
    const routeState = (location.state as RouteState) ?? null;
    if (!routeState) return;

    const clearRouteState = () => {
      const current = location.pathname + location.search;
      routerNavigate(current, { replace: true, state: null });
    };

    if (routeState.openView === "contract") {
      if (!isAuthenticated) {
        setView("login");
        clearRouteState();
        return;
      }

      if (routeState.utilityView) {
        setUtilityViewOverride(routeState.utilityView);
      }
      if (routeState.focusContractId !== undefined) {
        setFocusedContractOverride(routeState.focusContractId ?? null);
      }

      const finalise = (project: Project | null) => {
        if (!project) {
          setView("dashboard");
          clearRouteState();
          return;
        }
        warmProjectControlCenter(project.id).catch(() => undefined);
        setContractProject(project);
        setLastAccsProject(project);
        setActiveNav(getNavIndexForPhase(project.phase));
        setView("contract");
        clearRouteState();
      };

      if (routeState.projectSnapshot) {
        finalise(routeState.projectSnapshot);
        return;
      }

      const candidateId =
        routeState.projectId ??
        contractProject?.id ??
        lastAccsProject?.id ??
        null;
      if (candidateId) {
        warmProjectControlCenter(candidateId)
          .then((payload) => finalise(payload.project))
          .catch(() => {
            const fallback =
              // FALLBACK_PROJECTS.find((item) => item.id === candidateId) ??
              contractProject ?? lastAccsProject ?? null;
            finalise(fallback);
          });
        return;
      }

      finalise(contractProject ?? lastAccsProject ?? null);
      return;
    }

    if (routeState.openView === "dashboard") {
      if (!isAuthenticated) {
        setView("login");
      } else {
        handleCloseContract();
      }
      clearRouteState();
    } else if (routeState.openView === "login") {
      setView("login");
      clearRouteState();
    }
  }, [
    location.pathname,
    location.search,
    location.state,
    contractProject,
    lastAccsProject,
    getNavIndexForPhase,
    routerNavigate,
    handleCloseContract,
    isAuthenticated,
  ]);

  const content = (() => {
    if (view === "landing") {
      return (
        <LandingPage
          onPrimary={() => setView("login")}
          onExplore={() => setView(isAuthenticated ? "dashboard" : "login")}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
      );
    }
    if (view === "login") {
      return (
        <LoginPage
          onBack={() => setView(isAuthenticated ? "dashboard" : "landing")}
          onLogin={({ username, password }) => {
            setAuthToken(true);
            persistCredentials(username, password);
            setIsAuthenticated(true);
            setActiveNav(HOME_NAV_INDEX);
            setView("dashboard");
          }}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
      );
    }
    if (view === "contract" && contractProject) {
      return (
        <ContractControlCenterPage
          project={contractProject}
          onBack={handleCloseContract}
          theme={theme}
          onToggleTheme={toggleTheme}
          isAuthenticated={isAuthenticated}
          weather={weather}
          initialUtilityView={utilityViewOverride ?? undefined}
          onUtilityViewApplied={() => setUtilityViewOverride(null)}
          initialFocusedContractId={focusedContractOverride ?? undefined}
          onFocusedContractApplied={() => setFocusedContractOverride(null)}
        />
      );
    }
    return (
      <Dashboard
        theme={theme}
        onToggleTheme={toggleTheme}
        onOpenContract={handleOpenContract}
        weather={weather}
      />
    );
  })();

  return (
    <div className={`app-shell view-${view}`}>
      <SidebarNav
        activeIndex={activeNav}
        onSelect={handleSelectNav}
        theme={theme}
        onToggleTheme={toggleTheme}
        onNavigateLanding={() => {
          setContractProject(null);
          setView("landing");
        }}
      />
      <div className="content-shell">{content}</div>
    </div>
  );
}

function LandingPage({
  onPrimary,
  onExplore,
  theme,
  onToggleTheme,
}: {
  onPrimary: () => void;
  onExplore: () => void;
  theme: Theme;
  onToggleTheme: () => void;
}) {
  return (
    <div className="landing-wrapper">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ fontWeight: 700, fontSize: "1.3rem" }}>DiPGOS</div>
        <ThemeToggleButton theme={theme} onToggle={onToggleTheme} />
      </div>

      <section className="landing-hero">
        <h1>
          Construction intelligence for proposals, execution, monitoring, and
          governance.
        </h1>
        <p>
          DiPGOS unifies proposal automation, capital delivery, site monitoring,
          geo-fenced safety observability, and performance insights. Switch
          between satellite, terrain, and blueprint map layers while AI-assisted
          workflows keep contractors, engineers, and executives aligned.
        </p>
        <div className="landing-actions">
          <button className="cta-primary" onClick={onPrimary}>
            Launch secure portal
          </button>
          <button className="cta-secondary" onClick={onExplore}>
            Preview live dashboard
          </button>
        </div>
      </section>

      <section className="landing-showcase">
        <article className="landing-card">
          <strong>Proposal command center</strong>
          <span>
            Auto-ingest contractor bids, score packages, and publish approvals
            with a governed audit trail connected to every project record.
          </span>
        </article>
        <article className="landing-card">
          <strong>Construction operating twin</strong>
          <span>
            Track geo-fenced assets, progress telemetry, and alert density per
            site to anticipate delays before they escalate to claims.
          </span>
        </article>
        <article className="landing-card">
          <strong>Executive intelligence</strong>
          <span>
            Portfolio dashboards, schedule risk forecasts, and automated board
            reporting keep leadership informed in minutes, not weeks.
          </span>
        </article>
      </section>

      <footer className="landing-footer">
        <span>
          © {new Date().getFullYear()} DiPGOS | Construction & Hydropower
          Digital PMO
        </span>
        <span>Need an enterprise walkthrough? hello@dipgos.example</span>
      </footer>
    </div>
  );
}

function LoginPage({
  onBack,
  onLogin,
  theme,
  onToggleTheme,
}: {
  onBack: () => void;
  onLogin: (credentials: { username: string; password: string }) => void;
  theme: Theme;
  onToggleTheme: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const savedCredentials = readSavedCredentials();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const username = String(formData.get("username") || "");
    const password = String(formData.get("password") || "");

    if (username === "demo@dipgos" && password === "Secure!Demo2025") {
      setError(null);
      onLogin({ username, password });
      return;
    }

    setError(
      "Invalid credentials. Use demo@dipgos / Secure!Demo2025 or request access from the PMO."
    );
  };

  return (
    <div className="login-screen">
      <aside className="login-panel">
        <div className="login-panel-top">
          <button className="login-back" onClick={onBack}>
            ← Back to experience
          </button>
          {/* <ThemeToggleButton theme={theme} onToggle={onToggleTheme} /> */}
        </div>

        <div className="login-headline">
          <span className="eyebrow">DiPGOS project operating system</span>
          {/* <h1>Build once. Orchestrate everywhere.</h1> */}
          {/* <p>
            Fuse commercial, construction, and governance telemetry into a
            living control center that keeps EPC teams in lockstep across
            continents.
          </p> */}
          {/* <div className="login-pills">
            <span>AI field insights</span>
            <span>Portfolio command</span>
            <span>Geospatial twins</span>
          </div> */}
        </div>

        <div className="login-form-card">
          <h2>Sign in to DiPGOS</h2>
          <p className="login-subcopy">
            Secure access for project executives, construction leads, and
            governance teams.
          </p>
          <form className="login-form" onSubmit={handleSubmit}>
            <label>
              Username
              <input
                name="username"
                placeholder="demo@dipgos"
                autoComplete="username"
                defaultValue={savedCredentials.username}
              />
            </label>
            <label>
              Password
              <input
                type="password"
                name="password"
                placeholder="Secure!Demo2025"
                autoComplete="current-password"
                defaultValue={savedCredentials.password}
              />
            </label>
            {/* <small className="login-hint">Demo credentials: demo@dipgos / Secure!Demo2025</small> */}
            {error && <span className="login-error">{error}</span>}
            <button type="submit">Enter control center</button>
          </form>
          <div className="login-footnote">
            Need an enterprise walkthrough?{" "}
            <a href="mailto:hello@dipgos.example">hello@dipgos.example</a>
          </div>
        </div>
      </aside>

      <section className="login-showcase">
        {/* <img
          src="/images/login-hero.jpg"
          alt="Hydropower project digital twin"
          className="login-hero-image"
          loading="eager"
          decoding="async"
        /> */}
        {/* <div className="login-image-overlay" /> */}
        {/* <div className="login-hero-layout"> */}
        <div className="login-hero-copy">
          <h2>Construction portfolio oversight, reimagined.</h2>
          <p>
            Monitor hydropower mega projects, transmission corridors, and
            critical civil upgrades with live geospatial telemetry, alert
            intelligence, and AI-assisted governance.
          </p>
        </div>

        <div className="login-hero-grid">
          <div className="login-hero-card">
            <span className="hero-kicker">Live telemetry</span>
            <strong>32</strong>
            <span>
              sites streaming progress and alert density in real time.
            </span>
          </div>
          <div className="login-hero-card">
            <span className="hero-kicker">SPI focus</span>
            <strong>0.78</strong>
            <span>
              portfolio schedule performance with AI-generated recovery actions.
            </span>
          </div>
          <div className="login-hero-card">
            <span className="hero-kicker">Executive pulse</span>
            <strong>5 min</strong>
            <span>
              to prep board-ready reports directly from the control center.
            </span>
          </div>
          <div className="login-hero-card">
            <span className="hero-kicker">Live telemetry</span>
            <strong>32</strong>
            <span>
              sites streaming progress and alert density in real time.
            </span>
          </div>
          <div className="login-hero-card">
            <span className="hero-kicker">Live telemetry</span>
            <strong>32</strong>
            <span>
              sites streaming progress and alert density in real time.
            </span>
          </div>
          <div className="login-hero-card">
            <span className="hero-kicker">Live telemetry</span>
            <strong>32</strong>
            <span>
              sites streaming progress and alert density in real time.
            </span>
          </div>
        </div>
        {/* </div> */}
      </section>
    </div>
  );
}

function Dashboard({
  theme,
  onToggleTheme,
  onOpenContract,
  weather,
}: {
  theme: Theme;
  onToggleTheme: () => void;
  onOpenContract: (project: Project) => void;
  weather: WeatherSummary | null;
}) {
  const [construction, setConstruction] = useState<Project[]>([]);
  const [om, setOm] = useState<Project[]>([]);
  const [planning, setPlanning] = useState<Project[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [selected, setSelected] = useState<Project | null>(null);
  const [hovered, setHovered] = useState<Project | null>(null);
  const [phaseFilter, setPhaseFilter] = useState<PhaseFilter>("All");
  const [contractFilter, setContractFilter] = useState<"ALL" | string>("ALL");
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [panelScrolled, setPanelScrolled] = useState(false);
  const projectsPanelRef = useRef<HTMLDivElement>(null);
  const [showModal, setShowModal] = useState(false);
  const [mapView, setMapView] = useState<MapView>("atlas");
  const [featureToggle, setFeatureToggle] = useState<MapFeatureToggle>({
    geofences: true,
    intensity: false,
  });
  const [analytics, setAnalytics] = useState<ProjectAnalytics | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [mapHeight, setMapHeight] = useState(280);
  const [isResizingMap, setIsResizingMap] = useState(false);
  const resizeSnapshot = useRef<{ startY: number; startHeight: number }>({
    startY: 0,
    startHeight: 280,
  });
  const mapStatsRef = useRef<HTMLDivElement | null>(null);
  const prefetchControlCenter = useCallback((projectId: string) => {
    if (!projectId) return;
    warmProjectControlCenter(projectId).catch(() => undefined);
  }, []);

  const applyFallbackProjects = useCallback(() => {
    const fallbackConstruction = [
      ...(FALLBACK_PROJECTS_BY_PHASE["Construction"] ?? []),
    ];
    const fallbackOm = [...(FALLBACK_PROJECTS_BY_PHASE["O&M"] ?? [])];
    const fallbackPlanning = [
      ...(FALLBACK_PROJECTS_BY_PHASE["Planning & Design"] ?? []),
    ];
    setConstruction(fallbackConstruction);
    setOm(fallbackOm);
    setPlanning(fallbackPlanning);
    setAnalytics(FALLBACK_ANALYTICS);
    // setSelected((prev) => prev ?? FALLBACK_PROJECTS[0] ?? null);
    // setSelected((prev) => prev ?? null);
  }, []);

  const loadProjects = useCallback(async () => {
    try {
      const [constructionSet, omSet, planningSet, analyticsSnapshot] =
        await Promise.all([
          fetchProjects("Construction"),
          fetchProjects("O&M"),
          fetchProjects("Planning & Design"),
          fetchProjectAnalytics(),
        ]);

      const totalLoaded =
        constructionSet.length + omSet.length + planningSet.length;
      if (totalLoaded === 0) {
        applyFallbackProjects();
        return;
      }

      setConstruction(constructionSet);
      setOm(omSet);
      setPlanning(planningSet);

      const combined = [...constructionSet, ...omSet, ...planningSet];
      if (analyticsSnapshot && analyticsSnapshot.total_projects > 0) {
        setAnalytics(analyticsSnapshot);
      } else {
        setAnalytics(computeAnalytics(combined));
      }

      // setSelected((prev) => {
      //   if (prev) {
      //     return combined.find((project) => project.id === prev.id) ?? prev;
      //   }
      //   return combined[0] ?? null;
      // });
    } catch (error) {
      console.error("Failed to load projects", error);
      applyFallbackProjects();
    }
  }, [applyFallbackProjects]);

  useEffect(() => {
    loadProjects().catch((err) =>
      console.error("Failed to load projects", err)
    );
  }, [loadProjects]);

  useEffect(() => {
    if (selected) {
      fetchAlerts(selected.id)
        .then(setAlerts)
        .catch((err) => console.error("Failed to load alerts", err));
      prefetchControlCenter(selected.id);
    } else {
      setAlerts([]);
    }
  }, [selected, prefetchControlCenter]);

  const handleOpenContract = useCallback(
    (project: Project) => {
      setSelected(project);
      prefetchControlCenter(project.id);
      onOpenContract(project);
    },
    [onOpenContract, prefetchControlCenter]
  );

  const allProjects = useMemo(
    () => [...construction, ...om, ...planning],
    [construction, om, planning]
  );
  const weatherByProject = useMemo(() => {
    const map = new Map<string, WeatherSummary["projects"][number]>();
    weather?.projects?.forEach((point) => {
      map.set(point.id, point);
    });
    return map;
  }, [weather]);

  const handleSelectProject = useCallback(
    (project: Project) => {
      setSelected(project);
      prefetchControlCenter(project.id);
    },
    [prefetchControlCenter]
  );

  const handleHoverProject = useCallback(
    (project: Project) => {
      setHovered(project);
      prefetchControlCenter(project.id);
    },
    [prefetchControlCenter]
  );

  const handleLeaveProject = useCallback(() => setHovered(null), []);

  useEffect(() => {
    if (!allProjects.length) return;
    allProjects
      .slice(0, 3)
      .forEach((project) => prefetchControlCenter(project.id));
  }, [allProjects, prefetchControlCenter]);

  const contractIds = useMemo(
    () => Array.from(new Set(allProjects.map((project) => project.id))).sort(),
    [allProjects]
  );

  const filteredForMap = useMemo(() => {
    const base =
      contractFilter === "ALL"
        ? allProjects
        : allProjects.filter((p) => p.id === contractFilter);
    if (phaseFilter === "All") return base;
    return base.filter((p) => p.phase === phaseFilter);
  }, [allProjects, phaseFilter, contractFilter]);

  // const activeProject = hovered ?? selected ?? filteredForMap[0] ?? null;
  console.log(hovered, selected, "hovered or selected");
  const activeProject = hovered ?? selected ?? null;
  const activeProjectWeather = activeProject
    ? weatherByProject.get(activeProject.id) ?? null
    : null;

  const mapRows = panelCollapsed
    ? "auto 1fr minmax(0, 80px)"
    : `auto ${Math.round(mapHeight)}px minmax(0, 1fr)`;

  const highlightColor = activeProject
    ? phaseAccentHex(activeProject.phase)
    : null;
  const highlightStyles = highlightColor
    ? {
        background: `linear-gradient(135deg, ${hexToRgba(
          highlightColor,
          0.18
        )}, ${hexToRgba(highlightColor, 0.42)})`,
        border: `1px solid ${hexToRgba(highlightColor, 0.35)}`,
        color: readableTextColor(highlightColor),
      }
    : undefined;

  const handleResizeStart = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    resizeSnapshot.current = { startY: event.clientY, startHeight: mapHeight };
    setIsResizingMap(true);
  };

  useEffect(() => {
    if (!isResizingMap) return;
    const handleMouseMove = (event: MouseEvent) => {
      const delta = event.clientY - resizeSnapshot.current.startY;
      const proposed = resizeSnapshot.current.startHeight + delta;
      const viewportAllowance = Math.max(260, window.innerHeight - 280);
      const max = Math.min(760, viewportAllowance);
      const next = Math.max(320, Math.min(max, proposed));
      setMapHeight(next);
    };
    const handleMouseUp = () => {
      setIsResizingMap(false);
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizingMap]);

  useEffect(() => {
    if (panelCollapsed && isResizingMap) {
      setIsResizingMap(false);
    }
  }, [panelCollapsed, isResizingMap]);

  useEffect(() => {
    const clampHeight = () => {
      const viewportAllowance = Math.max(320, window.innerHeight - 320);
      const max = Math.min(760, viewportAllowance);
      setMapHeight((current) => {
        if (panelCollapsed) return current;
        return Math.max(320, Math.min(max, current));
      });
    };
    clampHeight();
    window.addEventListener("resize", clampHeight);
    return () => window.removeEventListener("resize", clampHeight);
  }, [panelCollapsed]);

  useEffect(() => {
    if (!mapStatsRef.current) return;
    const cards = Array.from(
      mapStatsRef.current.querySelectorAll<HTMLDivElement>(".map-stats-card")
    );
    const toggleCard = cards.find((node) => node.dataset.card === "toggles");
    const metricCards = cards.filter((node) => node !== toggleCard);
    const highlightCard = metricCards.find(
      (node) => node.dataset.card === "highlight"
    );
    const baseCards = highlightCard
      ? metricCards.filter((node) => node !== highlightCard)
      : metricCards;

    const available = Math.max(140, mapHeight - 160);
    const cardHeight = 120;
    const slotCount = Math.max(1, Math.floor(available / cardHeight));

    if (highlightCard) {
      highlightCard.style.display = "";
      const remaining = Math.max(0, slotCount - 1);
      baseCards.forEach((card, index) => {
        card.style.display = index < remaining ? "" : "none";
      });
    } else {
      baseCards.forEach((card, index) => {
        card.style.display = index < slotCount ? "" : "none";
      });
    }

    if (toggleCard) {
      toggleCard.style.display = "";
    }
  }, [mapHeight, activeProject]);

  // Track scroll position in projects panel to hide/show controls
  useEffect(() => {
    const panel = projectsPanelRef.current;
    if (!panel) return;
    const handleScroll = () => {
      setPanelScrolled(panel.scrollTop > 10);
    };
    panel.addEventListener("scroll", handleScroll, { passive: true });
    return () => panel.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (!mapStatsRef.current) return;
    const cards = Array.from(
      mapStatsRef.current.querySelectorAll<HTMLDivElement>(".map-stats-card")
    );
    const toggleCard = cards.find((node) => node.dataset.card === "toggles");
    const metricCards = cards.filter((node) => node !== toggleCard);

    const available = Math.max(140, mapHeight - 160);
    const cardHeight = 118;
    const maxVisible = Math.max(
      1,
      Math.min(metricCards.length, Math.floor(available / cardHeight))
    );

    metricCards.forEach((card, index) => {
      card.style.display = index < maxVisible ? "" : "none";
    });

    if (toggleCard) {
      toggleCard.style.display = "";
    }
  }, [mapHeight]);

  const handleCreateProject = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const payload = {
      name: String(formData.get("name") || ""),
      phase: String(formData.get("phase") || "Construction"),
      status_pct: Number(formData.get("status_pct") || 0),
      status_label: formData.get("status_label")
        ? String(formData.get("status_label"))
        : undefined,
      alerts: Number(formData.get("alerts") || 0),
      image: formData.get("image") ? String(formData.get("image")) : undefined,
      address: formData.get("address")
        ? String(formData.get("address"))
        : undefined,
      geofence_radius_m: formData.get("geofence_radius_m")
        ? Number(formData.get("geofence_radius_m"))
        : undefined,
      lat: formData.get("lat") ? Number(formData.get("lat")) : undefined,
      lng: formData.get("lng") ? Number(formData.get("lng")) : undefined,
    };

    try {
      setIsSaving(true);
      const created = await createProject(payload);
      await loadProjects();
      setSelected(created);
      setShowModal(false);
    } catch (error) {
      console.error(error);
      window.alert((error as Error).message || "Failed to create project");
    } finally {
      setIsSaving(false);
    }
  };

  const { url, attribution } = MAP_STYLES[mapView];
  const projectsAnalytics = analytics ?? {
    total_projects: 0,
    phase_breakdown: {},
    average_progress: 0,
    alerts_total: 0,
  };

  return (
    <>
      <div className="main" style={{ gridTemplateRows: mapRows }}>
        <header className="header px-2 py-1 md:px-4 md:py-2 ">
          <div className="header-leading">
            {/* <Breadcrumbs items={[{ label: 'Dashboard' }]} /> */}
            <div className="header-title-group">
              <h1 className="mb-0 text-base! md:text-xl! font-bold">
                WAPDA Project Portfolio Dashboard
              </h1>
              {/* <p>
              Proposal automation, construction execution, monitoring telemetry, and governance insights — one connected workspace.
            </p> */}
              {/* <div className="header-metrics">
              <span className="metric-chip">
                <strong>{projectsAnalytics.total_projects}</strong>
                Projects
              </span>
              <span className="metric-chip">
                <strong>{Math.round(projectsAnalytics.average_progress)}%</strong>
                Avg. Progress
              </span>
              <span className="metric-chip">
                <strong>{projectsAnalytics.alerts_total}</strong>
                Alerts
              </span>
              {Object.entries(projectsAnalytics.phase_breakdown || {}).map(([phase, value]) => (
                <span key={phase} className="metric-chip subtle">
                  <strong>{value}</strong>
                  {phase}
                </span>
              ))}
            </div> */}
            </div>
          </div>

          <div className="header-controls">
            {/* <div className="phase-toggle" role="group" aria-label="Filter projects by phase">
              {( ['All', 'Construction', 'O&M', 'Planning & Design'] as PhaseFilter[]).map((value) => (
                <button key={value} className={phaseFilter === value ? 'active' : ''} onClick={() => setPhaseFilter(value)}>
                  {value === 'All' ? 'All Projects' : value}
                </button>
              ))}
            </div> */}
            <button
              className="create-btn"
              title="Create New Project"
              onClick={() => setShowModal(true)}
            >
              <GoPlusCircle size={20} />
              <span className="hidden md:block">Create New Project</span>
            </button>
          </div>
        </header>

        <section
          className="map-section"
          style={!panelCollapsed ? { height: mapHeight } : undefined}
        >
          <div className="map-wrapper">
            <div className="map-gradient" aria-hidden="true" />
            <div className="map-toolbar">
              <button
                className="create-btn"
                style={{
                  padding: "10px 18px",
                  fontSize: "0.92rem",
                  boxShadow: "0 14px 30px rgba(59,130,246,0.28)",
                }}
                onClick={() => setPanelCollapsed((prev) => !prev)}
              >
                {panelCollapsed ? "Show Project Gallery" : "Focus Map View"}
              </button>
              <div className="map-view-toggle">
                {(Object.keys(MAP_STYLES) as MapView[]).map((viewKey) => (
                  <button
                    key={viewKey}
                    className={mapView === viewKey ? "active" : ""}
                    onClick={() => setMapView(viewKey)}
                  >
                    {MAP_STYLES[viewKey].label}
                  </button>
                ))}
              </div>
            </div>

            <div className="map-stats" ref={mapStatsRef}>
              <div className="map-stats-card">
                <span className="label">Projects Monitored</span>
                <strong>{projectsAnalytics.total_projects}</strong>
              </div>
              <div className="map-stats-card">
                <span className="label">Average Progress</span>
                <strong>
                  {Math.round(projectsAnalytics.average_progress)}%
                </strong>
              </div>
              <div className="map-stats-card">
                <span className="label">Alerts in Focus</span>
                <strong>{projectsAnalytics.alerts_total}</strong>
              </div>
              {/* {activeProject && (
                <div
                  className="map-stats-card highlight"
                  data-card="highlight"
                  style={highlightStyles}
                >
                  <span className="label text-black!">Highlighted Site</span>
                  <strong
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      display: "block",
                    }}
                    title={activeProject.name}
                  >
                    {activeProject.name}
                  </strong>
                  <div className="map-stat-line subtle text-black!">
                    {Math.round(activeProject.status_pct)}% completion
                  </div>
                  <div className="map-stat-line subtle text-black!">
                    {activeProject.alerts} active alerts
                  </div>
                  {activeProjectWeather && (
                    <div className="map-stat-line subtle">
                      Weather{" "}
                      {activeProjectWeather.temperatureC !== null &&
                      activeProjectWeather.temperatureC !== undefined
                        ? `${Math.round(activeProjectWeather.temperatureC)}°C`
                        : "--"}{" "}
                      ·{" "}
                      {activeProjectWeather.weatherDescription ??
                        "Conditions unavailable"}
                    </div>
                  )}
                </div>
              )} */}
              <div
                className="map-stats-card map-stats-toggle"
                data-card="toggles"
              >
                <button
                  className={`btn-ghost ${
                    featureToggle.geofences ? "active" : ""
                  }`}
                  onClick={() =>
                    setFeatureToggle((prev) => ({
                      ...prev,
                      geofences: !prev.geofences,
                    }))
                  }
                >
                  Geofences
                </button>
                <button
                  className={`btn-ghost ${
                    featureToggle.intensity ? "active" : ""
                  }`}
                  onClick={() =>
                    setFeatureToggle((prev) => ({
                      ...prev,
                      intensity: !prev.intensity,
                    }))
                  }
                >
                  Heat
                </button>
              </div>
            </div>

            <MapContainer
              center={{ lat: 34.75, lng: 73.2 }}
              zoom={7}
              className="map-canvas"
              scrollWheelZoom
              zoomControl={false}
              doubleClickZoom={false}
            >
              <TileLayer
                key={`${mapView}-${theme}`}
                attribution={attribution}
                url={url}
                crossOrigin
              />
              <ZoomControl position="topright" />
              <ScaleControl position="bottomleft" />
              <MapResizeWatcher
                trigger={`${panelCollapsed}-${theme}-${mapView}-${
                  filteredForMap.length
                }-${Math.round(mapHeight)}`}
              />
              <MapFocusUpdater project={selected} />

              {filteredForMap.map((project) => {
                const isActive =
                  project.id === selected?.id || project.id === hovered?.id;
                const weatherPoint = weatherByProject.get(project.id) ?? null;
                const icon = createMarkerIcon(
                  project,
                  theme,
                  isActive,
                  weatherPoint
                );
                return (
                  <Marker
                    key={project.id}
                    position={[project.lat, project.lng]}
                    icon={icon}
                    eventHandlers={{
                      click: () => {
                        setSelected(project);
                        prefetchControlCenter(project.id);
                        setPanelCollapsed(true);
                      },
                      mouseover: () => {
                        setHovered(project);
                        prefetchControlCenter(project.id);
                      },
                      mouseout: () =>
                        setHovered(
                          (prev) =>
                            // prev?.id === project.id ? null : prev
                            null
                        ),
                    }}
                  >
                    <Popup>
                      <div style={{ minWidth: "200px" }}>
                        <strong className="text-[#F86E00] text-base font-bold truncate md:w-[190px] 2xl:w-[245px]">
                          {project.name}
                        </strong>
                        <div>Status: {Math.round(project.status_pct)}%</div>
                        <div>Alerts: {project.alerts}</div>
                        {project.address && <div>{project.address}</div>}
                        {project.status_label && (
                          <div>Label: {project.status_label}</div>
                        )}
                        {weatherPoint && (
                          <div>
                            Weather:{" "}
                            {weatherPoint.temperatureC !== null &&
                            weatherPoint.temperatureC !== undefined
                              ? `${Math.round(weatherPoint.temperatureC)}°C`
                              : "--"}{" "}
                            ·{" "}
                            {weatherPoint.weatherDescription ??
                              "Conditions unavailable"}
                          </div>
                        )}
                      </div>
                    </Popup>
                  </Marker>
                );
              })}

              {featureToggle.geofences &&
                filteredForMap.map((project) =>
                  project.geofence_radius_m ? (
                    <React.Fragment key={`geo-${project.id}`}>
                      <Circle
                        center={[project.lat, project.lng]}
                        radius={project.geofence_radius_m}
                        pathOptions={{
                          color: alertLevelColor(project.alerts),
                          dashArray: "8 6",
                          weight: 2,
                          fillColor: hexToRgba(
                            alertLevelColor(project.alerts),
                            0.18
                          ),
                          fillOpacity: 0.2,
                        }}
                      >
                        <Tooltip
                          direction="center"
                          offset={[0, 0]}
                          opacity={0.92}
                          sticky
                        >
                          <div style={{ textAlign: "center" }}>
                            <strong>{project.name}</strong>
                            <div>
                              {project.geofence_radius_m.toLocaleString()} m
                              geofence
                            </div>
                            <div>{project.alerts} active alerts</div>
                          </div>
                        </Tooltip>
                      </Circle>
                      {/* <CircleMarker
                        center={[project.lat, project.lng]}
                        radius={6}
                        pathOptions={{
                          color: "#ffffff",
                          weight: 2,
                          fillColor: alertLevelColor(project.alerts),
                          fillOpacity: 0.9,
                        }}
                      /> */}
                    </React.Fragment>
                  ) : null
                )}

              {/* featureToggle.intensity &&
                filteredForMap.map((project) => (
                  <CircleMarker
                    key={`intensity-${project.id}`}
                    center={[project.lat, project.lng]}
                    radius={Math.max(
                      6,
                      Math.min(16, Math.round(project.alerts / 2))
                    )}
                    pathOptions={{
                      color: "rgba(249, 115, 22, 0.6)",
                      fillColor: "rgba(249, 115, 22, 0.35)",
                      fillOpacity: 0.6,
                    }}
                  />
                )) */}
            </MapContainer>

            {featureToggle.intensity && (
              <div className="map-legend">
                <span className="legend-title">Alert intensity</span>
                <div className="legend-scale">
                  <span className="legend-dot low" />
                  <span>Stable</span>
                  <span className="legend-dot medium" />

                  <span>Watch</span>
                  <span className="legend-dot high" />
                  <span>Critical</span>
                </div>
              </div>
            )}

            {selected && alerts.length > 0 && (
              <div className="alert-drawer">
                <div className="alert-header">
                  <span className="text-white!">Alert stream</span>
                  <button
                    onClick={() => setSelected(null)}
                    aria-label="Close alert"
                  >
                    ✕
                  </button>
                </div>
                <div>
                  <div style={{ fontWeight: 600 }}>{alerts[0].title}</div>
                  <div
                    style={{ fontSize: "0.86rem", color: "var(--text-muted)" }}
                  >
                    {alerts[0].location && (
                      <div>Location: {alerts[0].location}</div>
                    )}
                    {alerts[0].activity && (
                      <div>Activity: {alerts[0].activity}</div>
                    )}
                  </div>
                </div>
                <div className="alert-items">
                  {alerts[0].items.map((item, idx) => (
                    <div key={idx} className="alert-item">
                      <span>•</span>
                      <span>
                        <strong>{item.label}:</strong> {item.detail}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        {!panelCollapsed && (
          // && !panelScrolled
          <div
            className={`resize-bar ${isResizingMap ? "dragging" : ""}`}
            role="separator"
            aria-orientation="horizontal"
            aria-label="Adjust map and gallery height"
            onMouseDown={handleResizeStart}
          >
            <svg
              width="26"
              height="11"
              viewBox="0 0 26 11"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <rect width="26" height="11" rx="2" fill="#D4D7D9" />
              <rect
                x="2"
                y="3"
                width="22"
                height="1.5"
                rx="0.75"
                fill="white"
              />
              <rect
                x="2"
                y="6.5"
                width="22"
                height="1.5"
                rx="0.75"
                fill="white"
              />
            </svg>

            {/* <span /> */}
          </div>
        )}

        <div
          ref={projectsPanelRef}
          className={`projects-panel py-3 px-2 xl:px-6 xl:py-4 ${
            panelCollapsed ? "collapsed" : ""
          }`}
        >
          {/* <button
            className={`panel-toggle ${panelScrolled ? "hidden" : ""}`}
            onClick={() => setPanelCollapsed((prev) => !prev)}
          >
            {panelCollapsed ? "Expand portfolio ↑" : "Collapse portfolio ↓"}
          </button> */}

          <ProjectsSection
            title="Operations & Maintenance (AOS)"
            badge={om.length}
            projects={om}
            onHover={handleHoverProject}
            onLeave={handleLeaveProject}
            onSelect={handleSelectProject}
            onOpenContract={handleOpenContract}
          />

          <ProjectsSection
            title="Construction Phase (ACCS)"
            badge={construction.length}
            projects={construction}
            onHover={handleHoverProject}
            onLeave={handleLeaveProject}
            onSelect={handleSelectProject}
            onOpenContract={handleOpenContract}
          />

          <ProjectsSection
            title="Planning & Design (CPDS)"
            badge={planning.length}
            projects={planning}
            onHover={handleHoverProject}
            onLeave={handleLeaveProject}
            onSelect={handleSelectProject}
            onOpenContract={handleOpenContract}
          />
        </div>

        {showModal && (
          <div className="modal-backdrop" role="dialog" aria-modal="true">
            <div className="modal" style={{ width: "min(660px, 94vw)" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <h3>Register new project site</h3>
                <button
                  onClick={() => setShowModal(false)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--text-muted)",
                    fontSize: "1.1rem",
                    cursor: "pointer",
                  }}
                  aria-label="Close form"
                >
                  ✕
                </button>
              </div>
              <form onSubmit={handleCreateProject} className="modal-form">
                <div
                  style={{
                    display: "grid",
                    gap: 16,
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  }}
                >
                  <label>
                    Project name
                    <input
                      name="name"
                      placeholder="e.g. Skardu Pumped Storage"
                      required
                    />
                  </label>
                  <label>
                    Phase
                    <select name="phase" defaultValue="Construction">
                      <option value="Construction">Construction</option>
                      <option value="O&M">O&amp;M</option>
                      <option value="Planning & Design">
                        Planning &amp; Design
                      </option>
                    </select>
                  </label>
                  <label>
                    Status %
                    <input
                      name="status_pct"
                      type="number"
                      min={0}
                      max={100}
                      defaultValue={50}
                    />
                  </label>
                  <label>
                    Alerts
                    <input
                      name="alerts"
                      type="number"
                      min={0}
                      defaultValue={0}
                    />
                  </label>
                </div>

                <div
                  style={{
                    display: "grid",
                    gap: 16,
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  }}
                >
                  <label>
                    Status label
                    <input
                      name="status_label"
                      placeholder="e.g. Commissioning"
                    />
                  </label>
                  <label>
                    Primary image URL (optional)
                    <input name="image" placeholder="https://..." />
                  </label>
                  <label>
                    Geofence radius (m)
                    <input
                      name="geofence_radius_m"
                      type="number"
                      min={0}
                      placeholder="1500"
                    />
                  </label>
                </div>

                <label>
                  Site address
                  <input
                    name="address"
                    placeholder="Full site address for geocoding"
                  />
                </label>

                <div
                  style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}
                >
                  Provide either an address for automatic geocoding or explicit
                  latitude/longitude coordinates.
                </div>

                <div
                  style={{
                    display: "grid",
                    gap: 16,
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  }}
                >
                  <label>
                    Latitude
                    <input name="lat" type="number" step="0.0001" />
                  </label>
                  <label>
                    Longitude
                    <input name="lng" type="number" step="0.0001" />
                  </label>
                </div>

                <div className="modal-actions">
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setShowModal(false)}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="primary" disabled={isSaving}>
                    {isSaving ? "Saving…" : "Create project"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function FitContractBounds({
  bounds,
  focus,
}: {
  bounds: LatLngBoundsExpression;
  focus?: [number, number];
}) {
  const map = useMap();
  useEffect(() => {
    if (bounds) {
      map.fitBounds(bounds, { padding: [80, 80] });
    }
    if (focus) {
      map.flyTo(focus, 16, { duration: 0.6 });
    }
  }, [map, bounds, focus]);
  return null;
}

function MapResizeWatcher({ trigger }: { trigger: unknown }) {
  const map = useMap();
  useEffect(() => {
    map.invalidateSize();
  }, [map, trigger]);
  return null;
}

function MapFocusUpdater({ project }: { project: Project | null }) {
  const map = useMap();
  useEffect(() => {
    if (project) {
      map.flyTo([project.lat, project.lng], 8, { duration: 0.8 });
    }
  }, [map, project]);
  return null;
}

type ProjectsSectionProps = {
  title: string;
  badge: number;
  projects: Project[];
  onSelect: (project: Project) => void;
  onHover: (project: Project) => void;
  onLeave: () => void;
  onOpenContract: (project: Project) => void;
};

function ProjectsSection({
  title,
  badge,
  projects,
  onSelect,
  onHover,
  onLeave,
  onOpenContract,
}: ProjectsSectionProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const scrollLeft = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: -400, behavior: "smooth" });
    }
  };

  const scrollRight = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: 400, behavior: "smooth" });
    }
  };

  return (
    <section className="mt-3">
      <div
        className="section-header backdrop-blur-sm rounded-2xl px-6 py-4 mb-6 flex items-center justify-between gap-4"
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--border-subtle)",
          boxShadow: "var(--shadow-soft)",
        }}
      >
        <div className="section-heading flex items-center gap-3">
          <h2
            className="text-xl font-bold"
            style={{ color: "var(--text-primary)" }}
          >
            {title}
          </h2>
          <span
            className="px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide"
            style={{
              background: "rgba(56, 189, 248, 0.2)",
              color: "var(--accent)",
            }}
          >
            {badge} active
          </span>
        </div>
        {/* <div className="section-actions flex items-center gap-4">
          <button
            type="button"
            className="px-4 py-2 rounded-lg text-sm font-medium transition-opacity hover:opacity-80 border"
            style={{
              background: "var(--surface-2)",
              color: "var(--text-primary)",
              borderColor: "var(--border-subtle)",
            }}
          >
            Export snapshot
          </button>
        </div> */}
      </div>
      <div className="relative group flex items-center gap-4">
        <button
          onClick={scrollLeft}
          className="shrink-0 backdrop-blur-sm rounded-full p-3 shadow-lg border flex items-center justify-center"
          style={{
            background: "var(--surface-1)",
            borderColor: "var(--border-subtle)",
            color: "var(--text-primary)",
            width: "48px",
            height: "48px",
          }}
          aria-label="Scroll left"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>
        <div
          ref={scrollContainerRef}
          className="flex gap-6 overflow-x-auto scrollbar-hide scroll-smooth pb-4 flex-1"
          style={{
            scrollbarWidth: "none",
            msOverflowStyle: "none",
          }}
        >
          {projects.map((project) => (
            <article
              key={project.id}
              className="project-card shrink-0 w-[calc((100%-72px)/4)] min-w-[260px] max-w-[360px]"
              onMouseEnter={() => onHover(project)}
              onMouseLeave={onLeave}
              onClick={() => onOpenContract(project)}
            >
              <div className="pill-stack">
                <span
                  className="pill"
                  style={{
                    borderColor: phaseAccent(project.phase),
                    color: phaseAccent(project.phase),
                  }}
                >
                  {phaseLabel(project.phase)}
                </span>
                <span className="pill">Alerts: {project.alerts}</span>
              </div>
              <img
                src={project.image || "/images/ACCS/mohmand.jpg"}
                alt={project.name}
                loading="lazy"
                decoding="async"
                // className="rounded-3xl"
              />
              <div className="flex gap-2 items-center px-3 py-4">
                <div>
                  <div className="w-10 h-10 rounded-full bg-blue-500 text-white flex items-center justify-center text-lg font-semibold mb-3">
                    {project.name.charAt(0).toUpperCase()}
                  </div>
                </div>
                <div>
                  <h3 className="text-base font-bold truncate md:w-[190px] 2xl:w-[245px]">
                    {project.name}
                  </h3>

                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm!">Status: </span>
                      <span className="text-sm!">
                        {project.status_label ||
                          `${Math.round(project.status_pct)}%`}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {/* <span className="dot" /> */}
                      <span className="text-sm!">Phase: </span>
                      <span className="text-sm!">{project.phase}</span>
                    </div>
                  </div>
                </div>
                {/* <div className="progress-bar">
                  <span
                    style={{
                      width: `${Math.min(
                        Math.max(project.status_pct, 0),
                        100
                      )}%`,
                      background: `linear-gradient(135deg, ${phaseAccent(
                        project.phase
                      )}, #38bdf8)`,
                    }}
                  />
                </div> */}
              </div>
            </article>
          ))}
        </div>
        <button
          onClick={scrollRight}
          className="shrink-0 backdrop-blur-sm rounded-full p-3 shadow-lg border flex items-center justify-center"
          style={{
            background: "var(--surface-1)",
            borderColor: "var(--border-subtle)",
            color: "var(--text-primary)",
            width: "48px",
            height: "48px",
          }}
          aria-label="Scroll right"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </button>
      </div>
    </section>
  );
}

function ContractControlCenterPage({
  project,
  onBack,
  theme,
  onToggleTheme,
  isAuthenticated,
  weather,
  initialUtilityView,
  onUtilityViewApplied,
  initialFocusedContractId,
  onFocusedContractApplied,
}: {
  project: Project;
  onBack: () => void;
  theme: Theme;
  onToggleTheme: () => void;
  isAuthenticated: boolean;
  weather: WeatherSummary | null;
  initialUtilityView?: UtilityView;
  onUtilityViewApplied?: () => void;
  initialFocusedContractId?: string;
  onFocusedContractApplied?: () => void;
}) {
  const [payload, setPayload] = useState<ProjectControlCenterPayload | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadControlCenter = useCallback(() => {
    const cached = getCachedProjectControlCenter(project.id);
    if (cached) {
      setPayload(cached);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setPayload(null);
    warmProjectControlCenter(project.id)
      .then((data) => {
        setPayload(data);
      })
      .catch((err: Error) => {
        console.error("Failed to load control center", err);
        setError(err.message || "Unable to load control center data.");
      })
      .finally(() => setLoading(false));
  }, [project.id]);

  useEffect(() => {
    loadControlCenter();
  }, [loadControlCenter]);

  return (
    <div className="contract-page-wrapper">
      <ContractControlCenterOverlay
        project={project}
        payload={payload}
        loading={loading}
        error={error}
        onClose={onBack}
        onRetry={loadControlCenter}
        theme={theme}
        onToggleTheme={onToggleTheme}
        isAuthenticated={isAuthenticated}
        weather={weather}
        initialUtilityView={initialUtilityView}
        onUtilityViewApplied={onUtilityViewApplied}
        initialFocusedContractId={initialFocusedContractId}
        onFocusedContractApplied={onFocusedContractApplied}
      />
    </div>
  );
}

type UtilityView =
  | "scheduling"
  | "financial"
  | "sustainability"
  | "procurement"
  | "atom"
  | "forecasting";

type RouteState = {
  openView?: View;
  projectSnapshot?: Project;
  utilityView?: UtilityView;
  focusContractId?: string | null;
  projectId?: string | null;
} | null;

function ContractControlCenterOverlay({
  project,
  payload,
  loading,
  error,
  onClose,
  onRetry,
  theme,
  onToggleTheme,
  isAuthenticated,
  weather,
  initialUtilityView,
  onUtilityViewApplied,
  initialFocusedContractId,
  onFocusedContractApplied,
}: {
  project: Project | null;
  payload: ProjectControlCenterPayload | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onRetry: () => void;
  theme?: Theme;
  onToggleTheme?: () => void;
  isAuthenticated: boolean;
  weather: WeatherSummary | null;
  initialUtilityView?: UtilityView;
  onUtilityViewApplied?: () => void;
  initialFocusedContractId?: string;
  onFocusedContractApplied?: () => void;
}) {
  const [focusedContractId, setFocusedContractId] = useState<string | null>(
    initialFocusedContractId ?? null
  );
  const [expandedContracts, setExpandedContracts] = useState<
    Record<string, boolean>
  >({});
  const [expandedSows, setExpandedSows] = useState<Record<string, boolean>>({});
  const [mapView, setMapView] = useState<MapView>("atlas");
  const [featureToggle, setFeatureToggle] = useState<MapFeatureToggle>({
    geofences: false,
    intensity: false,
  });
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [mapWipSizes, setMapWipSizes] = useState<number[]>(() =>
    readStoredSplitSizes()
  );
  const [hoveredContract, setHoveredContract] = useState<ContractSite | null>(
    null
  );
  const mapStatsRef = useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();
  const [activeUtilityView, setActiveUtilityView] = useState<UtilityView>(
    initialUtilityView ?? "financial"
  );
  const contractWeatherMap = useMemo(() => {
    const map = new Map<string, WeatherSummary["contracts"][number]>();
    weather?.contracts?.forEach((point) => {
      map.set(point.id, point);
    });
    return map;
  }, [weather]);
  useEffect(() => {
    if (!initialUtilityView) return;
    setActiveUtilityView(initialUtilityView);
    onUtilityViewApplied?.();
  }, [initialUtilityView, onUtilityViewApplied]);

  useEffect(() => {
    if (!initialFocusedContractId) return;
    setFocusedContractId(initialFocusedContractId);
    setExpandedContracts((prev) => ({
      ...prev,
      [initialFocusedContractId]: true,
    }));
    onFocusedContractApplied?.();
  }, [initialFocusedContractId, onFocusedContractApplied]);
  const mapShellRef = useRef<HTMLDivElement | null>(null);
  const [contractFilter, setContractFilter] = useState<"ALL" | string>("ALL");
  const handleSplitSizesChange = useCallback((next: number[]) => {
    setMapWipSizes((prev) => {
      const normalised = normaliseSplitSizes(next);
      if (prev[0] === normalised[0] && prev[1] === normalised[1]) {
        return prev;
      }
      return normalised;
    });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const rounded = mapWipSizes.map((value) => Number(value.toFixed(2)));
    window.localStorage.setItem(
      MAP_WIP_SPLIT_STORAGE_KEY,
      JSON.stringify(rounded)
    );
  }, [mapWipSizes]);

  const utilityViews: Array<{
    id: UtilityView;
    label: string;
    icon: React.ReactNode;
  }> = [
    {
      id: "scheduling",
      label: "Scheduling View",
      icon: (
        <svg
          viewBox="0 0 24 24"
          strokeWidth="1.6"
          stroke="currentColor"
          fill="none"
        >
          <rect x="4" y="5" width="16" height="15" rx="3" />
          <path d="M8 3v4" strokeLinecap="round" />
          <path d="M16 3v4" strokeLinecap="round" />
          <path d="M4 11h16" />
          <path d="M9 15h2" strokeLinecap="round" />
          <path d="M13 15h2" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      id: "financial",
      label: "Financial View",
      icon: (
        <svg
          viewBox="0 0 24 24"
          strokeWidth="1.6"
          stroke="currentColor"
          fill="none"
        >
          <rect x="4" y="6" width="16" height="13" rx="2" />
          <path d="M4 10h16" />
          <path d="M8 14h1" strokeLinecap="round" />
          <path d="M11 14h1" strokeLinecap="round" />
          <path d="M14 14h2" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      id: "sustainability",
      label: "Sustainability View",
      icon: (
        <svg
          viewBox="0 0 24 24"
          strokeWidth="1.6"
          stroke="currentColor"
          fill="none"
        >
          <path d="M12 21c4-2.5 6-5.5 6-9.5a6 6 0 0 0-12 0C6 15.5 8 18.5 12 21Z" />
          <path d="M12 10a2 2 0 0 1 2 2" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      id: "procurement",
      label: "Procurement / SCM View",
      icon: (
        <svg
          viewBox="0 0 24 24"
          strokeWidth="1.6"
          stroke="currentColor"
          fill="none"
        >
          <path d="M4 7h16" strokeLinecap="round" />
          <path d="M6 7v10a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7" />
          <path d="M10 11h4" strokeLinecap="round" />
          <path d="M12 7V3" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      id: "atom",
      label: "Atom Manager",
      icon: (
        // <svg
        //   viewBox="0 0 24 24"
        //   strokeWidth="1.6"
        //   stroke="currentColor"
        //   fill="none"
        // >
        //   <circle cx="12" cy="12" r="2.4" />
        //   <path d="M4.5 8c3.5-6 11.5-6 15 0s-3.5 14-7.5 8-7.5-2-7.5-8Z" />
        // </svg>
        <svg
        // width="18"
        // height="18"
        viewBox="0 0 22 22"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          fill-rule="evenodd"
          clip-rule="evenodd"
          d="M8.02533 0.190301C8.6379 -0.0634337 9.3262 -0.0634337 9.93877 0.190301C10.2104 0.302805 10.434 0.468039 10.6416 0.649131C10.8387 0.821122 11.0618 1.04415 11.3202 1.30262L11.3391 1.32149L11.3524 1.33484C11.6135 1.59585 11.8382 1.82063 12.0114 2.01938C12.1924 2.22721 12.3571 2.45059 12.4695 2.72176C12.7232 3.33433 12.7232 4.02265 12.4695 4.63522C12.3572 4.90637 12.1925 5.12975 12.0114 5.33761C11.8382 5.53646 11.6133 5.76136 11.3521 6.02252L11.3203 6.05436C11.0618 6.31286 10.8388 6.5359 10.6416 6.7079C10.434 6.88899 10.2104 7.05423 9.93877 7.16673C9.3262 7.42046 8.63788 7.42047 8.02531 7.16673C7.75366 7.05421 7.52999 6.88884 7.32243 6.70778C7.12522 6.53575 6.90221 6.31273 6.64388 6.05438L6.60618 6.01668C6.3477 5.75822 6.12467 5.5352 5.95268 5.33802C5.77158 5.1304 5.60635 4.90683 5.49385 4.63522C5.24011 4.02265 5.24011 3.33433 5.49385 2.72176C5.60636 2.45014 5.77164 2.22653 5.95272 2.01894C6.12472 1.82175 6.34774 1.59874 6.60617 1.34034L6.62501 1.32149L6.64386 1.30265C6.90232 1.04417 7.12535 0.821131 7.32253 0.649134C7.53014 0.468043 7.75372 0.302805 8.02533 0.190301ZM9.30097 1.7301C9.09678 1.64552 8.86732 1.64552 8.66313 1.7301C8.62846 1.74446 8.56161 1.77995 8.41809 1.90513C8.26891 2.03525 8.08614 2.21739 7.80352 2.5C7.52098 2.78255 7.33884 2.96533 7.2087 3.11451C7.08348 3.25807 7.04799 3.32494 7.03365 3.35956C6.94907 3.56375 6.94907 3.79323 7.03365 3.99742C7.04801 4.0321 7.0835 4.09895 7.20868 4.24246C7.33879 4.39163 7.52093 4.57441 7.80355 4.85703C8.086 5.13948 8.2688 5.32164 8.41803 5.45182C8.56167 5.57712 8.62856 5.61262 8.66311 5.62693C8.8673 5.71151 9.09677 5.71151 9.30097 5.62693C9.33564 5.61256 9.40249 5.57708 9.54601 5.4519C9.69518 5.32179 9.87795 5.13965 10.1606 4.85703C10.443 4.57463 10.6249 4.39185 10.7547 4.24287C10.8795 4.0996 10.9151 4.03255 10.9297 3.99742C11.0142 3.79323 11.0142 3.56375 10.9297 3.35956C10.9151 3.32444 10.8795 3.25742 10.7547 3.11415C10.6249 2.96518 10.443 2.78242 10.1606 2.5C9.87796 2.21738 9.69518 2.03525 9.54601 1.90513C9.40249 1.77995 9.33564 1.74446 9.30097 1.7301Z"
          fill="currentColor"
        />
        <path
          fill-rule="evenodd"
          clip-rule="evenodd"
          d="M2.72178 5.49344C3.33435 5.23971 4.02265 5.23971 4.63522 5.49344C4.90683 5.60595 5.1304 5.77118 5.33802 5.95227C5.5352 6.12426 5.75822 6.34729 6.01668 6.60577L6.04891 6.638C6.30991 6.899 6.53469 7.12377 6.70783 7.32252C6.88889 7.53035 7.0536 7.75373 7.16592 8.0249C7.41965 8.63747 7.41965 9.32579 7.16592 9.93836C7.0536 10.2095 6.88891 10.4329 6.70785 10.6407C6.53462 10.8396 6.30971 11.0645 6.04854 11.3257L6.01666 11.3576C5.7582 11.616 5.53519 11.8391 5.33802 12.011C5.1304 12.1921 4.90683 12.3574 4.63522 12.4699C4.02266 12.7236 3.33433 12.7236 2.72176 12.4699C2.45011 12.3574 2.22644 12.192 2.01888 12.0109C1.82167 11.8389 1.59865 11.6159 1.34031 11.3575L1.32149 11.3387L1.30262 11.3198C1.04415 11.0614 0.821122 10.8383 0.649131 10.6412C0.468039 10.4335 0.302805 10.21 0.190301 9.93836C-0.0634337 9.32579 -0.0634337 8.63747 0.190301 8.0249C0.302811 7.75328 0.468102 7.52966 0.649177 7.32208C0.82118 7.12489 1.0442 6.90188 1.30261 6.64348L1.32146 6.62463L1.34032 6.60577C1.59879 6.34729 1.8218 6.12426 2.01899 5.95227C2.2266 5.77118 2.45017 5.60595 2.72178 5.49344ZM3.99742 7.03324C3.79323 6.94866 3.56378 6.94866 3.35959 7.03324C3.32491 7.0476 3.25806 7.08309 3.11454 7.20827C2.96537 7.33839 2.7826 7.52052 2.49998 7.80314C2.21744 8.08568 2.0353 8.26846 1.90516 8.41765C1.77993 8.56122 1.74444 8.62808 1.7301 8.6627C1.64552 8.86689 1.64552 9.09637 1.7301 9.30056C1.74446 9.33523 1.77995 9.40208 1.90513 9.5456C2.03525 9.69477 2.21738 9.87755 2.5 10.1602C2.78245 10.4426 2.96526 10.6248 3.11448 10.755C3.25812 10.8803 3.32501 10.9158 3.35956 10.9301C3.56375 11.0146 3.79322 11.0146 3.99742 10.9301C4.0321 10.9157 4.09895 10.8802 4.24246 10.755C4.39163 10.6249 4.57441 10.4428 4.85703 10.1602C5.13943 9.87777 5.32136 9.69499 5.45113 9.54602C5.57594 9.40274 5.61156 9.33569 5.62612 9.30056C5.7107 9.09637 5.7107 8.86689 5.62612 8.6627C5.61157 8.62758 5.57597 8.56056 5.45115 8.41729C5.32137 8.26832 5.13944 8.08556 4.85703 7.80314C4.57441 7.52052 4.39163 7.33839 4.24246 7.20827C4.09895 7.08309 4.0321 7.04761 3.99742 7.03324Z"
          fill="currentColor"
        />
        <path
          fill-rule="evenodd"
          clip-rule="evenodd"
          d="M13.3289 5.49344C13.9414 5.23971 14.6297 5.23971 15.2423 5.49344C15.5139 5.60595 15.7375 5.77118 15.9451 5.95227C16.1423 6.12426 16.3653 6.34728 16.6238 6.60575L16.656 6.638C16.917 6.89899 17.1418 7.12377 17.3149 7.32251C17.496 7.53035 17.6607 7.75373 17.773 8.0249C18.0268 8.63747 18.0268 9.32579 17.773 9.93836C17.6607 10.2095 17.496 10.4329 17.3149 10.6408C17.1417 10.8396 16.9168 11.0645 16.6557 11.3256L16.6237 11.3576C16.3653 11.6161 16.1423 11.8391 15.9451 12.011C15.7375 12.1921 15.5139 12.3574 15.2423 12.4699C14.6298 12.7236 13.9414 12.7236 13.3289 12.4699C13.0572 12.3574 12.8335 12.192 12.626 12.0109C12.4288 11.8389 12.2057 11.6159 11.9474 11.3575L11.9098 11.3199C11.6513 11.0614 11.4282 10.8383 11.2562 10.6412C11.0751 10.4335 10.9099 10.21 10.7974 9.93836C10.5437 9.32579 10.5437 8.63747 10.7974 8.0249C10.9099 7.75328 11.0752 7.52967 11.2563 7.32208C11.4283 7.1249 11.6513 6.90189 11.9097 6.64349L11.9474 6.60578C12.2059 6.3473 12.4289 6.12427 12.6261 5.95227C12.8337 5.77118 13.0573 5.60595 13.3289 5.49344ZM14.6045 7.03324C14.4003 6.94866 14.1709 6.94866 13.9667 7.03324C13.932 7.0476 13.8652 7.08309 13.7216 7.20827C13.5725 7.33839 13.3897 7.52053 13.1071 7.80314C12.8245 8.08569 12.6424 8.26847 12.5123 8.41765C12.387 8.56122 12.3515 8.62808 12.3372 8.6627C12.2526 8.86689 12.2526 9.09637 12.3372 9.30056C12.3516 9.33524 12.387 9.40209 12.5122 9.5456C12.6423 9.69477 12.8245 9.87755 13.1071 10.1602C13.3895 10.4426 13.5724 10.6248 13.7216 10.755C13.8652 10.8803 13.9321 10.9158 13.9667 10.9301C14.1708 11.0146 14.4003 11.0146 14.6045 10.9301C14.6392 10.9157 14.706 10.8802 14.8496 10.755C14.9987 10.6249 15.1815 10.4428 15.4641 10.1602C15.7465 9.87777 15.9285 9.695 16.0582 9.54602C16.183 9.40273 16.2187 9.33569 16.2332 9.30056C16.3178 9.09637 16.3178 8.86689 16.2332 8.6627C16.2187 8.62759 16.1831 8.56057 16.0582 8.41729C15.9285 8.26831 15.7465 8.08555 15.4641 7.80314C15.1815 7.52052 14.9987 7.33839 14.8496 7.20827C14.706 7.08309 14.6392 7.0476 14.6045 7.03324Z"
          fill="currentColor"
        />
        <path
          fill-rule="evenodd"
          clip-rule="evenodd"
          d="M8.02533 10.797C8.6379 10.5433 9.3262 10.5433 9.93877 10.797C10.2104 10.9095 10.434 11.0747 10.6416 11.2558C10.8388 11.4278 11.0618 11.6509 11.3203 11.9094L11.3524 11.9415C11.6134 12.2025 11.8382 12.4273 12.0114 12.6261C12.1924 12.8339 12.3571 13.0573 12.4695 13.3284C12.7232 13.941 12.7232 14.6293 12.4695 15.2419C12.3572 15.5131 12.1925 15.7364 12.0114 15.9443C11.8382 16.1431 11.6133 16.368 11.3521 16.6292L11.3202 16.6611C11.0618 16.9196 10.8387 17.1426 10.6416 17.3146C10.434 17.4957 10.2104 17.6609 9.93877 17.7734C9.32621 18.0271 8.63788 18.0272 8.02531 17.7734C7.75366 17.6609 7.52999 17.4955 7.32243 17.3145C7.12522 17.1424 6.9022 16.9194 6.64387 16.6611L6.62504 16.6422L6.60616 16.6233C6.34769 16.3649 6.12467 16.1419 5.95268 15.9447C5.77159 15.7371 5.60635 15.5135 5.49385 15.2419C5.24011 14.6293 5.24011 13.941 5.49385 13.3284C5.60636 13.0568 5.77165 12.8332 5.95272 12.6256C6.12474 12.4284 6.34778 12.2054 6.60621 11.947L6.64383 11.9094C6.90231 11.6509 7.12534 11.4278 7.32253 11.2558C7.53015 11.0747 7.75372 10.9095 8.02533 10.797ZM9.30097 12.3368C9.09678 12.2522 8.86732 12.2522 8.66313 12.3368C8.62846 12.3512 8.56161 12.3866 8.41809 12.5118C8.26892 12.6419 8.08615 12.8241 7.80353 13.1067C7.52098 13.3892 7.33884 13.572 7.20871 13.7212C7.08348 13.8648 7.04799 13.9316 7.03365 13.9663C6.94907 14.1704 6.94907 14.3999 7.03365 14.6041C7.04801 14.6388 7.08349 14.7056 7.20868 14.8492C7.33879 14.9983 7.52093 15.1811 7.80355 15.4637C8.086 15.7462 8.2688 15.9283 8.41803 16.0585C8.56167 16.1838 8.62856 16.2193 8.66311 16.2336C8.8673 16.3182 9.09677 16.3182 9.30097 16.2336C9.33564 16.2193 9.40249 16.1838 9.54601 16.0586C9.69518 15.9285 9.87795 15.7463 10.1606 15.4637C10.443 15.1813 10.6249 14.9985 10.7547 14.8496C10.8795 14.7063 10.9151 14.6392 10.9297 14.6041C11.0142 14.3999 11.0142 14.1704 10.9297 13.9663C10.9151 13.9311 10.8795 13.8641 10.7547 13.7208C10.6249 13.5719 10.443 13.3891 10.1606 13.1067C9.87795 12.8241 9.69518 12.6419 9.54601 12.5118C9.40249 12.3866 9.33564 12.3512 9.30097 12.3368Z"
          fill="currentColor"
        />
      </svg>
      ),
    },
    {
      id: "forecasting",
      label: "Forecasting View",
      icon: (
        <svg
          viewBox="0 0 24 24"
          strokeWidth="1.6"
          stroke="currentColor"
          fill="none"
        >
          <path d="M4 18h16" strokeLinecap="round" />
          <path
            d="M6 16l3.5-4 2.5 3 4.5-6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M17 9h3v3" strokeLinecap="round" />
        </svg>
      ),
    },
  ];
  const visibleUtilityViews = FEATURE_SCHEDULE_UI
    ? utilityViews
    : utilityViews.filter((view) => view.id !== "scheduling");
  if (!project) {
    return null;
  }

  const contracts = useMemo(() => {
    if (payload?.contracts?.length) {
      return payload.contracts;
    }
    return FALLBACK_CONTRACTS[project.id] ?? [];
  }, [payload, project.id]);
  const contractIds = useMemo(
    () => Array.from(new Set(contracts.map((contract) => contract.id))).sort(),
    [contracts]
  );
  const metrics = payload?.metrics ?? FALLBACK_CONTRACT_METRICS;
  const workInProgressItems = useMemo<WorkInProgressMetric[]>(() => {
    const sanitise = (item: WorkInProgressMetric) => {
      const value = Number(item.percent);
      return {
        contract: item.contract,
        status: normaliseWorkStatus(item.status),
        percent: Number.isFinite(value) ? value : 0,
      };
    };
    if (metrics.workInProgress?.length) {
      return metrics.workInProgress.map(sanitise);
    }
    if (!contracts.length) {
      return [];
    }
    return contracts.map((contract) =>
      sanitise({
        contract: contract.name ?? contract.id,
        status: normaliseWorkStatus(contract.status_label, contract.phase),
        percent: Math.round(contract.status_pct ?? 0),
      })
    );
  }, [contracts, metrics.workInProgress]);
  const hasWorkInProgress = workInProgressItems.length > 0;

  const sowGroups = payload?.sow_tree ?? [];

  const filteredContracts = useMemo(() => {
    if (contractFilter === "ALL") return contracts;
    return contracts.filter((contract) => contract.id === contractFilter);
  }, [contracts, contractFilter]);

  const focusedContract =
    filteredContracts.find((contract) => contract.id === focusedContractId) ??
    filteredContracts[0];

  const handleScheduleNavigate = useCallback(() => {
    if (!FEATURE_SCHEDULE_UI) {
      return;
    }
    if (!isAuthenticated) {
      navigate("/", { state: { openView: "login" } });
      return;
    }
    if (focusedContract) {
      navigate(`/contracts/${focusedContract.id}/schedule`, {
        state: {
          contractName: focusedContract.name,
          projectName: project?.name,
          projectId: project?.id,
          contractId: focusedContract.id,
          projectSnapshot: project ?? null,
          utilityView: "scheduling",
        },
      });
      return;
    }
    if (project?.id) {
      navigate("/schedule", {
        state: { projectId: project.id, projectName: project.name },
      });
    }
  }, [focusedContract, isAuthenticated, navigate, project]);

  const sowByContract = useMemo(() => {
    const map = new Map<string, (typeof sowGroups)[number]["sections"]>();
    sowGroups.forEach((group) => {
      map.set(group.contract_id, group.sections);
    });
    return map;
  }, [sowGroups]);

  const phaseGroups = useMemo(() => {
    const groups: Record<string, ContractSite[]> = {};
    for (const contract of filteredContracts) {
      groups[contract.phase] = groups[contract.phase] || [];
      groups[contract.phase].push(contract);
    }
    return Object.entries(groups);
  }, [filteredContracts]);

  const mapStyle = MAP_STYLES[mapView];

  const bounds = useMemo(() => {
    if (!filteredContracts.length) return undefined;
    const latLngs = filteredContracts.map((contract) => [
      contract.lat,
      contract.lng,
    ]) as [number, number][];
    return L.latLngBounds(latLngs).pad(0.2);
  }, [filteredContracts]);

  useEffect(() => {
    if (filteredContracts.length === 0) {
      setFocusedContractId(null);
      return;
    }
    setFocusedContractId((prev) =>
      prev && filteredContracts.some((contract) => contract.id === prev)
        ? prev
        : filteredContracts[0].id
    );
  }, [filteredContracts]);

  const mapCenter: [number, number] = focusedContract
    ? [focusedContract.lat, focusedContract.lng]
    : [project.lat, project.lng];

  const handleContractSelect = useCallback((contract: ContractSite) => {
    setFocusedContractId(contract.id);
    setExpandedContracts((prev) => ({ ...prev, [contract.id]: true }));
  }, []);

  const toggleContractSections = useCallback((contractId: string) => {
    setExpandedContracts((prev) => ({
      ...prev,
      [contractId]: !prev[contractId],
    }));
  }, []);

  const toggleSow = useCallback((sowId: string) => {
    setExpandedSows((prev) => ({ ...prev, [sowId]: !prev[sowId] }));
  }, []);

  const alertCount = focusedContract?.alerts ?? project.alerts ?? 0;

  const contractIconCache = useRef<Record<string, DivIcon>>({});

  const createContractIcon = useCallback(
    (
      contract: ContractSite,
      active: boolean,
      weatherPoint?: WeatherSummary["contracts"][number] | null
    ) => {
      const statusKey = Math.round(contract.status_pct || 0);
      const weatherKey = weatherPoint
        ? `${Math.round(weatherPoint.temperatureC ?? -999)}-${
            weatherPoint.weatherCode ?? "na"
          }`
        : "none";
      const cacheKey = `${contract.id}-${statusKey}-${contract.alerts}-${
        active ? "on" : "off"
      }-${weatherKey}`;
      if (contractIconCache.current[cacheKey]) {
        return contractIconCache.current[cacheKey];
      }

      const accent = accentColor(contract);
      const intensity = Math.min(1, Math.max(0, contract.alerts / 6));
      const alertsBadge = contract.alerts
        ? `<span class="contract-pin__badge">${contract.alerts}</span>`
        : "";
      const temperature = weatherPoint?.temperatureC;
      const weatherDescription = weatherPoint?.weatherDescription;
      const weatherHtml = weatherPoint
        ? `<div class="contract-pin__weather">${
            temperature !== null && temperature !== undefined
              ? `<span class="temp">${Math.round(temperature)}°C</span>`
              : ""
          }${
            weatherDescription
              ? `<span class="desc">${weatherDescription}</span>`
              : ""
          }</div>`
        : "";

      const icon = L.divIcon({
        className: `contract-pin ${active ? "contract-pin--active" : ""}`,
        html: `
        <div class="contract-pin__glow" style="--contract-accent:${accent};--contract-intensity:${intensity}"></div>
        <div class="contract-pin__core" style="--contract-accent:${accent}">
          <span class="contract-pin__value">${statusKey}%</span>
          ${alertsBadge}
          ${weatherHtml}
        </div>
      `,
        iconSize: [54, 54],
        iconAnchor: [27, 27],
        popupAnchor: [0, -20],
      });

      contractIconCache.current[cacheKey] = icon;
      return icon;
    },
    []
  );

  const activeContractDisplay = hoveredContract ?? focusedContract ?? null;
  const activeContractWeather = activeContractDisplay
    ? contractWeatherMap.get(activeContractDisplay.id) ?? null
    : null;

  const projectCrumbLabel = project.name
    ? project.name.replace(/\s+/g, "_")
    : "Project";

  return (
    <div className="contract-page">
      <header className="contract-topbar">
        <Breadcrumbs
          items={[
            { label: "Dashboard", onClick: onClose },
            { label: projectCrumbLabel },
            { label: "Construction Control Center" },
          ]}
        />
        <div className="contract-top-actions">
          {/* {onToggleTheme && (
            <ThemeToggleButton
              theme={theme ?? "light"}
              onToggle={onToggleTheme}
            />
          )} */}
          {/* <button
            type="button"
            className="top-icon"
            aria-label="Scheduling"
            title="Scheduling"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
            >
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <path d="M16 2v4" strokeLinecap="round" />
              <path d="M8 2v4" strokeLinecap="round" />
              <path d="M3 10h18" />
            </svg>
          </button> */}
          {/* <button
            type="button"
            className="top-icon"
            aria-label="Financials"
            title="Financial dashboards"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
            >
              <path d="M4 20v-6" strokeLinecap="round" />
              <path d="M10 20v-10" strokeLinecap="round" />
              <path d="M16 20v-4" strokeLinecap="round" />
              <path d="M2 20h20" strokeLinecap="round" />
            </svg>
          </button> */}

          <button
            type="button"
            className="top-icon"
            aria-label="Management"
            title="Management"
          >
            <svg
              width="19"
              height="19"
              viewBox="0 0 19 19"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M18.1 1.59998V11.35C18.1 11.7478 17.9419 12.1293 17.6606 12.4106C17.3793 12.6919 16.9978 12.85 16.6 12.85H6.41029L7.3806 13.8194C7.45028 13.889 7.50556 13.9718 7.54327 14.0628C7.58098 14.1538 7.60039 14.2514 7.60039 14.35C7.60039 14.4485 7.58098 14.5461 7.54327 14.6371C7.50556 14.7282 7.45028 14.8109 7.3806 14.8806C7.31092 14.9503 7.22819 15.0056 7.13715 15.0433C7.0461 15.081 6.94852 15.1004 6.84998 15.1004C6.75143 15.1004 6.65385 15.081 6.5628 15.0433C6.47176 15.0056 6.38903 14.9503 6.31935 14.8806L4.06935 12.6306C3.99962 12.5609 3.9443 12.4782 3.90656 12.3872C3.86881 12.2961 3.84939 12.1985 3.84939 12.1C3.84939 12.0014 3.86881 11.9038 3.90656 11.8128C3.9443 11.7217 3.99962 11.639 4.06935 11.5694L6.31935 9.31935C6.46008 9.17862 6.65095 9.09956 6.84998 9.09956C7.049 9.09956 7.23987 9.17862 7.3806 9.31935C7.52133 9.46008 7.60039 9.65095 7.60039 9.84998C7.60039 10.049 7.52133 10.2399 7.3806 10.3806L6.41029 11.35H16.6V1.59998H6.09998V2.34998C6.09998 2.54889 6.02096 2.73965 5.88031 2.88031C5.73965 3.02096 5.54889 3.09998 5.34998 3.09998C5.15106 3.09998 4.9603 3.02096 4.81965 2.88031C4.67899 2.73965 4.59998 2.54889 4.59998 2.34998V1.59998C4.59998 1.20215 4.75801 0.82062 5.03932 0.539315C5.32062 0.258011 5.70215 0.0999756 6.09998 0.0999756H16.6C16.9978 0.0999756 17.3793 0.258011 17.6606 0.539315C17.9419 0.82062 18.1 1.20215 18.1 1.59998ZM12.85 15.1C12.6511 15.1 12.4603 15.179 12.3196 15.3196C12.179 15.4603 12.1 15.6511 12.1 15.85V16.6H1.59998V6.84998H11.7897L10.8194 7.81935C10.6786 7.96008 10.5996 8.15095 10.5996 8.34998C10.5996 8.549 10.6786 8.73987 10.8194 8.8806C10.9601 9.02133 11.151 9.10039 11.35 9.10039C11.549 9.10039 11.7399 9.02133 11.8806 8.8806L14.1306 6.6306C14.2003 6.56095 14.2557 6.47823 14.2934 6.38718C14.3311 6.29613 14.3506 6.19854 14.3506 6.09998C14.3506 6.00141 14.3311 5.90382 14.2934 5.81277C14.2557 5.72172 14.2003 5.63901 14.1306 5.56935L11.8806 3.31935C11.7399 3.17862 11.549 3.09956 11.35 3.09956C11.151 3.09956 10.9601 3.17862 10.8194 3.31935C10.6786 3.46008 10.5996 3.65095 10.5996 3.84998C10.5996 4.049 10.6786 4.23987 10.8194 4.3806L11.7897 5.34998H1.59998C1.20215 5.34998 0.82062 5.50801 0.539315 5.78932C0.258011 6.07062 0.0999756 6.45215 0.0999756 6.84998V16.6C0.0999756 16.9978 0.258011 17.3793 0.539315 17.6606C0.82062 17.9419 1.20215 18.1 1.59998 18.1H12.1C12.4978 18.1 12.8793 17.9419 13.1606 17.6606C13.4419 17.3793 13.6 16.9978 13.6 16.6V15.85C13.6 15.6511 13.521 15.4603 13.3803 15.3196C13.2397 15.179 13.0489 15.1 12.85 15.1Z"
                fill="#1A1A1A"
                stroke="#1A1A1A"
                stroke-width="0.2"
              />
            </svg>
          </button>
          <button
            type="button"
            className="top-icon"
            aria-label="History"
            title="History"
          >
            <svg
              width="20"
              height="19"
              viewBox="0 0 20 19"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M10.75 4.75002V8.82533L14.1362 10.8569C14.3068 10.9593 14.4297 11.1253 14.4779 11.3184C14.526 11.5114 14.4955 11.7157 14.3931 11.8863C14.2907 12.0568 14.1247 12.1797 13.9316 12.2279C13.7386 12.2761 13.5343 12.2456 13.3637 12.1431L9.61374 9.89314C9.50275 9.82646 9.41091 9.73218 9.34717 9.61948C9.28343 9.50678 9.24995 9.37949 9.24999 9.25002V4.75002C9.24999 4.55111 9.329 4.36034 9.46966 4.21969C9.61031 4.07904 9.80107 4.00002 9.99999 4.00002C10.1989 4.00002 10.3897 4.07904 10.5303 4.21969C10.671 4.36034 10.75 4.55111 10.75 4.75002ZM9.99999 0.250028C8.81686 0.247081 7.64489 0.478809 6.55192 0.931802C5.45894 1.3848 4.46666 2.05006 3.6325 2.88909C2.95093 3.57909 2.34531 4.24283 1.75 4.93752V3.25002C1.75 3.05111 1.67098 2.86035 1.53033 2.71969C1.38968 2.57904 1.19891 2.50002 0.999999 2.50002C0.801087 2.50002 0.610322 2.57904 0.46967 2.71969C0.329017 2.86035 0.25 3.05111 0.25 3.25002V7.00002C0.25 7.19893 0.329017 7.3897 0.46967 7.53035C0.610322 7.671 0.801087 7.75002 0.999999 7.75002H4.74999C4.94891 7.75002 5.13967 7.671 5.28032 7.53035C5.42097 7.3897 5.49999 7.19893 5.49999 7.00002C5.49999 6.80111 5.42097 6.61034 5.28032 6.46969C5.13967 6.32904 4.94891 6.25002 4.74999 6.25002H2.59375C3.26406 5.46065 3.93156 4.71721 4.69281 3.94659C5.73517 2.90423 7.06159 2.19216 8.50633 1.89935C9.95108 1.60654 11.4501 1.74597 12.816 2.30023C14.182 2.85449 15.3543 3.79899 16.1865 5.01572C17.0188 6.23244 17.474 7.66744 17.4953 9.14141C17.5166 10.6154 17.1031 12.0629 16.3064 13.3032C15.5097 14.5435 14.3652 15.5215 13.0159 16.1151C11.6665 16.7086 10.1722 16.8913 8.71958 16.6404C7.26697 16.3896 5.92051 15.7161 4.84843 14.7044C4.77678 14.6367 4.69249 14.5837 4.60038 14.5486C4.50827 14.5135 4.41014 14.4968 4.31159 14.4996C4.21305 14.5024 4.11601 14.5245 4.02604 14.5648C3.93606 14.6051 3.85489 14.6627 3.78718 14.7344C3.71947 14.806 3.66653 14.8903 3.63139 14.9824C3.59626 15.0745 3.5796 15.1727 3.58239 15.2712C3.58518 15.3698 3.60734 15.4668 3.64763 15.5568C3.68792 15.6468 3.74553 15.7279 3.81718 15.7956C4.88541 16.8037 6.18413 17.535 7.59999 17.9257C9.01585 18.3164 10.5058 18.3547 11.9399 18.0372C13.3739 17.7196 14.7084 17.0559 15.827 16.104C16.9456 15.1521 17.8142 13.9409 18.357 12.5761C18.8998 11.2113 19.1003 9.73438 18.9411 8.27425C18.7818 6.81413 18.2676 5.41517 17.4434 4.19946C16.6192 2.98375 15.5099 1.98825 14.2125 1.29982C12.915 0.6114 11.4688 0.250984 9.99999 0.250028Z"
                fill="#1A1A1A"
                stroke="#1A1A1A"
                stroke-width="0.5"
              />
            </svg>
          </button>
          <button
            type="button"
            className="top-icon"
            aria-label="Collaborators"
            title="Collaborators"
          >
            <svg
              width="20"
              height="19"
              viewBox="0 0 20 19"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M5 8C5 7.44772 5.44772 7 6 7H6.002C6.27127 7 6.52916 7.10859 6.71732 7.3012C6.90548 7.49381 7.00802 7.75417 7.00173 8.02336L7.00168 8.02536C6.99549 8.2906 6.88414 8.54251 6.69215 8.72563C6.50016 8.90874 6.24327 9.00806 5.97804 9.00172L5.97608 9.00167C5.43327 8.98868 5 8.54492 5 8.00196V8Z"
                fill="#1A1A1A"
              />
              <path
                d="M9 8C9 7.44772 9.44772 7 10 7H10.002C10.2713 7 10.5292 7.10859 10.7173 7.3012C10.9055 7.49381 11.008 7.75417 11.0017 8.02336L11.0017 8.02536C10.9955 8.2906 10.8841 8.54251 10.6921 8.72563C10.5002 8.90874 10.2433 9.00806 9.97804 9.00172L9.97608 9.00167C9.43327 8.98868 9 8.54492 9 8.00196V8Z"
                fill="#1A1A1A"
              />
              <path
                d="M13 8C13 7.44772 13.4477 7 14 7H14.002C14.2713 7 14.5292 7.10859 14.7173 7.3012C14.9055 7.49381 15.008 7.75417 15.0017 8.02336L15.0017 8.02536C14.9955 8.2906 14.8841 8.54251 14.6921 8.72563C14.5002 8.90874 14.2433 9.00806 13.978 9.00172L13.9761 9.00167C13.4333 8.98868 13 8.54492 13 8.00196V8Z"
                fill="#1A1A1A"
              />
              <path
                fill-rule="evenodd"
                clip-rule="evenodd"
                d="M4.16168 8.60056e-07H15.8388C16.3659 -1.70213e-05 16.8205 -3.25181e-05 17.1949 0.0305751C17.5902 0.0628916 17.9831 0.134244 18.3614 0.326982C18.9248 0.614051 19.3851 1.07224 19.6732 1.63781C19.8659 2.016 19.9372 2.40906 19.9695 2.80397C20 3.17815 20 3.6323 20 4.15839V11.8421C20 12.3682 20 12.8222 19.9695 13.1962C19.9372 13.591 19.8659 13.9838 19.6732 14.3619C19.3857 14.9262 18.9266 15.3855 18.362 15.6732C17.9839 15.8659 17.5909 15.9372 17.196 15.9695C16.8218 16 16.3677 16 15.8416 16H7.12207C6.66611 16 6.57738 16.0047 6.50085 16.0204C6.41146 16.0388 6.32585 16.0688 6.24664 16.1093C6.17901 16.1438 6.10813 16.1945 5.75948 16.4734L5.74376 16.4858L5.74047 16.4883L4.18975 17.7289C3.8034 18.038 3.46126 18.3117 3.17105 18.5036C2.88772 18.6909 2.48663 18.9189 2.00206 18.9195C1.39287 18.9201 0.816826 18.6431 0.436918 18.1672C0.134659 17.7885 0.0621401 17.333 0.031411 16.9947C-5.0921e-05 16.6484 -2.62429e-05 16.2104 1.65212e-06 15.7157L2.36738e-06 4.16168C-1.5514e-05 3.63451 -3.0892e-05 3.17965 0.0305707 2.80499C0.0628635 2.40962 0.13416 2.01625 0.326984 1.63781C0.614604 1.07332 1.07332 0.614602 1.63781 0.326982C2.01625 0.134158 2.40962 0.0628619 2.80499 0.0305692C3.17965 -3.23988e-05 3.63451 -1.70213e-05 4.16168 8.60056e-07ZM2.9678 2.02393C2.69595 2.04614 2.59518 2.08383 2.54579 2.109C2.35763 2.20487 2.20487 2.35763 2.109 2.54579C2.08383 2.59517 2.04614 2.69595 2.02393 2.9678C2.00078 3.25126 2 3.62365 2 4.2002V15.6712C2 16.224 2.001 16.5693 2.02321 16.8138C2.02476 16.8309 2.02637 16.8466 2.02799 16.8611C2.04036 16.8533 2.0537 16.8447 2.06805 16.8352C2.27295 16.6998 2.54327 16.4848 2.97492 16.1395L4.49888 14.9203L4.5146 14.908L4.51782 14.9055C4.5333 14.8931 4.54868 14.8808 4.56396 14.8685C4.82855 14.6565 5.06493 14.4671 5.33673 14.3282C5.57847 14.2047 5.83511 14.1154 6.09876 14.0613C6.39992 13.9994 6.70494 13.9997 7.05158 14C7.07489 14 7.09838 14 7.12207 14H15.8031C16.3785 14 16.7502 13.9992 17.033 13.9761C17.3043 13.9539 17.4048 13.9163 17.454 13.8912C17.642 13.7954 17.7953 13.6422 17.8912 13.4539C17.9164 13.4046 17.954 13.3041 17.9761 13.0332C17.9992 12.7505 18 12.379 18 11.8036V4.19691C18 3.62146 17.9992 3.2498 17.9761 2.96686C17.9539 2.69554 17.9163 2.59501 17.8912 2.54579C17.7959 2.35871 17.6427 2.20542 17.4534 2.109C17.4039 2.08375 17.3032 2.04611 17.0319 2.02393C16.7488 2.00078 16.3768 2 15.8002 2H4.2002C3.62365 2 3.25126 2.00078 2.9678 2.02393Z"
                fill="#1A1A1A"
              />
            </svg>
          </button>
          <button
            type="button"
            className="top-icon alert"
            aria-label="Alerts"
            title="Alerts"
          >
            <svg
              width="17"
              height="18"
              viewBox="0 0 17 18"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M8.10083 0C12.0772 9.3855e-05 15.301 3.2238 15.301 7.2002V10.4268L15.5872 10.7129C15.6704 10.7958 15.7752 10.9011 15.8625 11.0225C16.0256 11.2496 16.1315 11.5102 16.176 11.7812L16.2004 12.1973V12.3027C16.2014 12.5653 16.2023 12.888 16.1057 13.1748C15.9266 13.7058 15.5105 14.1255 14.9768 14.3057C14.6904 14.4022 14.3673 14.4014 14.1067 14.4004H11.7004C11.7002 16.3884 10.0889 17.9999 8.10083 18C6.11275 18 4.50046 16.3885 4.50024 14.4004H2.09399C1.83346 14.4014 1.51203 14.4021 1.22583 14.3057C0.693647 14.1261 0.274739 13.7084 0.0949707 13.1758C-0.00183381 12.8888 -0.000746131 12.5653 0.000244141 12.3027V12.1953C2.69493e-05 12.0773 0.000411604 11.9291 0.0246582 11.7812C0.0694829 11.5083 0.176451 11.2489 0.338135 11.0234C0.425823 10.9013 0.531188 10.7959 0.615479 10.7119L0.900635 10.4268V7.2002C0.900635 3.22375 4.12439 1.02997e-05 8.10083 0ZM6.30103 14.4004C6.30124 15.3944 7.10684 16.2002 8.10083 16.2002C9.09477 16.2001 9.90042 15.3943 9.90063 14.4004H6.30103ZM8.10083 1.7998C5.11849 1.79981 2.70044 4.21786 2.70044 7.2002V10.5498C2.70044 10.9491 2.54141 11.3318 2.26001 11.6133L1.90942 11.9639C1.85246 12.0208 1.82406 12.0499 1.80396 12.0713L1.802 12.0732V12.0762C1.80108 12.1057 1.80103 12.1464 1.80103 12.2275C1.80103 12.4108 1.80082 12.5111 1.80493 12.584L1.80591 12.5947L1.81567 12.5957C1.88779 12.5998 1.98717 12.5996 2.16919 12.5996H14.0325C14.2142 12.5996 14.3137 12.5998 14.386 12.5957L14.3948 12.5947L14.3958 12.584C14.3992 12.5224 14.4005 12.4409 14.4006 12.3066V12.2275C14.4006 12.1472 14.4006 12.1063 14.3997 12.0771L14.3987 12.0732L14.3977 12.0713C14.3773 12.0496 14.3483 12.0209 14.2913 11.9639L13.9407 11.6133C13.7677 11.4403 13.6415 11.2292 13.5696 11C13.5244 10.8558 13.5002 10.7037 13.5002 10.5498V7.2002C13.5002 4.21791 11.0831 1.7999 8.10083 1.7998Z"
                fill="currentColor"
              />
            </svg>

            <span className="badge">{alertCount}</span>
          </button>
        </div>
      </header>
      <div className="contract-panel">
        <div className="contract-body pp-layout overflow-auto grid h-full grid-cols-[20%_60%_20%] gap-4 pr-[70px]!">
          <aside className="contract-list pp-leftRail">
            <div className="contract-filter">
              <span className="text-lg font-bold capitalize">Contracts</span>
              <select
                value={contractFilter}
                onChange={(event) => setContractFilter(event.target.value)}
              >
                <option value="ALL">All Contracts</option>
                {contractIds.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
            </div>
            <div className="contract-list-scroll">
              {error && (
                <div className="contract-error">
                  {error}
                  <button onClick={onRetry}>Retry</button>
                </div>
              )}
              {loading && (
                <div className="contract-loading">Loading contracts…</div>
              )}
              {!loading && phaseGroups.length === 0 && (
                <div className="contract-loading">
                  No contract data available yet.
                </div>
              )}
              {phaseGroups.map(([phase, items]) => (
                <div key={phase} className="contract-phase">
                  <div className="contract-phase-title">{phase}</div>
                  <ul>
                    {items.map((contract) => {
                      const isActive = contract.id === focusedContract?.id;
                      const hasSections =
                        (sowByContract.get(contract.id) ?? []).length > 0;
                      const expanded = expandedContracts[contract.id];
                      return (
                        <li
                          key={contract.id}
                          className={isActive ? "active" : ""}
                        >
                          <div
                            className="contract-row"
                            onClick={() => handleContractSelect(contract)}
                          >
                            <div>
                              <div className="contract-name flex items-center justify-between gap-2">
                                <div className="flex gap-2 items-center">
                                  <svg
                                    width="14"
                                    height="14"
                                    viewBox="0 0 14 14"
                                    fill="none"
                                    xmlns="http://www.w3.org/2000/svg"
                                  >
                                    <path
                                      d="M7.00699 0C5.7296 0 4.55012 0.317016 3.46853 0.951049C2.41492 1.57576 1.57576 2.41492 0.951049 3.46853C0.317016 4.55012 0 5.7296 0 7.00699C0 8.27506 0.317016 9.44988 0.951049 10.5315C1.57576 11.5851 2.41492 12.4242 3.46853 13.049C4.55012 13.683 5.72494 14 6.99301 14C8.2704 14 9.44988 13.683 10.5315 13.049C11.5851 12.4242 12.4242 11.5851 13.049 10.5315C13.683 9.44988 14 8.27506 14 7.00699C14 5.7296 13.683 4.55012 13.049 3.46853C12.4242 2.41492 11.5851 1.57576 10.5315 0.951049C9.44988 0.317016 8.2704 0 6.99301 0H7.00699ZM10.5315 9.04895C10.4942 9.12354 10.4429 9.18415 10.3776 9.23077C10.3217 9.27739 10.2611 9.31469 10.1958 9.34266C10.0932 9.38928 9.98601 9.41259 9.87413 9.41259C9.77156 9.40326 9.67366 9.36597 9.58042 9.3007L7.70629 8.23776V10.3776C7.70629 10.4615 7.68765 10.5501 7.65035 10.6434C7.62238 10.7273 7.57576 10.8019 7.51049 10.8671C7.44522 10.9324 7.37063 10.9883 7.28671 11.035C7.2028 11.0723 7.10956 11.0909 7.00699 11.0909C6.90443 11.0909 6.80653 11.0723 6.71329 11.035C6.62937 10.9883 6.55478 10.9371 6.48951 10.8811C6.43357 10.8159 6.38695 10.7413 6.34965 10.6573C6.31235 10.5734 6.29371 10.4802 6.29371 10.3776V8.23776L4.43357 9.3007C4.34965 9.35664 4.26107 9.38928 4.16783 9.3986C4.08392 9.40793 3.99068 9.40326 3.88811 9.38462C3.79487 9.35664 3.71096 9.31469 3.63636 9.25874C3.5711 9.2028 3.51515 9.13753 3.46853 9.06294C3.42191 8.97902 3.38928 8.91375 3.37063 8.86713C3.36131 8.81119 3.35664 8.75058 3.35664 8.68532C3.35664 8.55478 3.38462 8.43823 3.44056 8.33566C3.50583 8.2331 3.59441 8.14452 3.70629 8.06993L5.58042 7.00699L3.70629 5.94406C3.64103 5.89744 3.57576 5.83217 3.51049 5.74825C3.44522 5.66434 3.40326 5.58042 3.38462 5.4965C3.36597 5.40326 3.36131 5.31469 3.37063 5.23077C3.37995 5.14685 3.41259 5.05361 3.46853 4.95105C3.52448 4.83916 3.59907 4.75524 3.69231 4.6993C3.79487 4.64336 3.91608 4.61538 4.05594 4.61538C4.13054 4.61538 4.1958 4.62471 4.25175 4.64336C4.31702 4.662 4.3683 4.68532 4.40559 4.71329L6.29371 5.79021V3.62238C6.29371 3.51981 6.31235 3.42657 6.34965 3.34266C6.38695 3.25874 6.43823 3.18415 6.5035 3.11888C6.56876 3.05361 6.64336 3.00233 6.72727 2.96503C6.81119 2.92774 6.89977 2.90909 6.99301 2.90909C7.09557 2.90909 7.18415 2.92774 7.25874 2.96503C7.34266 3.00233 7.41725 3.05828 7.48252 3.13287C7.55711 3.19814 7.60839 3.27273 7.63636 3.35664C7.67366 3.44056 7.69231 3.52914 7.69231 3.62238V5.77622L9.55245 4.6993C9.63636 4.65268 9.72494 4.62471 9.81818 4.61538C9.92075 4.60606 10.014 4.61072 10.0979 4.62937C10.1911 4.64802 10.2751 4.68998 10.3497 4.75524C10.4336 4.82051 10.4988 4.8951 10.5455 4.97902C10.5921 5.06294 10.62 5.14685 10.6294 5.23077C10.6387 5.31469 10.6294 5.40326 10.6014 5.4965C10.5734 5.58974 10.5315 5.67832 10.4755 5.76224C10.4289 5.83683 10.3636 5.89744 10.2797 5.94406L8.41958 7.00699L10.2937 8.06993L10.5035 8.25175C10.5501 8.31702 10.5874 8.40093 10.6154 8.5035C10.6434 8.59674 10.6527 8.68998 10.6434 8.78322C10.634 8.87646 10.5967 8.96504 10.5315 9.04895Z"
                                      fill="#EE6E27"
                                    />
                                  </svg>

                                  {contract.name}
                                </div>
                                {hasSections && (
                                  <span
                                    className="cursor-pointer text-base"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      toggleContractSections(contract.id);
                                    }}
                                  >
                                    {expanded ? "−" : "+"}
                                  </span>
                                )}
                              </div>
                              <div className="contract-meta">
                                {/* <span>{contract.discipline || "General"}</span> */}
                                {/* <span>{Math.round(contract.status_pct)}%</span> */}
                              </div>
                            </div>
                            {/* {hasSections && (
                              <button
                                className="contract-toggle"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  toggleContractSections(contract.id);
                                }}
                                aria-label={`Toggle SOW for ${contract.name}`}
                              >
                                {expanded ? "−" : "+"}
                              </button>
                            )} */}
                          </div>
                          {hasSections && expanded && (
                            <div className="sow-list text-sm">
                              {(sowByContract.get(contract.id) ?? []).map(
                                (section) => {
                                  const sowExpanded = expandedSows[section.id];
                                  return (
                                    <div
                                      key={section.id}
                                      className="sow-item pl-1"
                                    >
                                      <div
                                        className="sow-header"
                                        onClick={() => toggleSow(section.id)}
                                      >
                                        <div className="sow-header-content">
                                          <div className="sow-title flex gap-2 items-center text-[#EE6E27]!">
                                            <svg
                                              width="10"
                                              height="11"
                                              viewBox="0 0 10 11"
                                              fill="none"
                                              xmlns="http://www.w3.org/2000/svg"
                                            >
                                              <path
                                                d="M0 5.21484C0 3.4375 0.9375 1.79688 2.5 0.898438C4.04297 0 5.9375 0 7.5 0.898438C9.04297 1.79688 10 3.4375 10 5.21484C10 7.01172 9.04297 8.65234 7.5 9.55078C5.9375 10.4492 4.04297 10.4492 2.5 9.55078C0.9375 8.65234 0 7.01172 0 5.21484ZM6.25 7.08984C6.25 6.58203 5.91797 6.13281 5.46875 5.9375V1.93359C5.46875 1.67969 5.25391 1.46484 5 1.46484C4.72656 1.46484 4.53125 1.67969 4.53125 1.93359V5.9375C4.0625 6.13281 3.75 6.58203 3.75 7.08984C3.75 7.79297 4.29688 8.33984 5 8.33984C5.68359 8.33984 6.25 7.79297 6.25 7.08984ZM2.8125 3.65234C3.14453 3.65234 3.4375 3.37891 3.4375 3.02734C3.4375 2.69531 3.14453 2.40234 2.8125 2.40234C2.46094 2.40234 2.1875 2.69531 2.1875 3.02734C2.1875 3.37891 2.46094 3.65234 2.8125 3.65234ZM2.5 5.21484C2.5 4.88281 2.20703 4.58984 1.875 4.58984C1.52344 4.58984 1.25 4.88281 1.25 5.21484C1.25 5.56641 1.52344 5.83984 1.875 5.83984C2.20703 5.83984 2.5 5.56641 2.5 5.21484ZM8.125 5.83984C8.45703 5.83984 8.75 5.56641 8.75 5.21484C8.75 4.88281 8.45703 4.58984 8.125 4.58984C7.77344 4.58984 7.5 4.88281 7.5 5.21484C7.5 5.56641 7.77344 5.83984 8.125 5.83984ZM7.8125 3.02734C7.8125 2.69531 7.51953 2.40234 7.1875 2.40234C6.83594 2.40234 6.5625 2.69531 6.5625 3.02734C6.5625 3.37891 6.83594 3.65234 7.1875 3.65234C7.51953 3.65234 7.8125 3.37891 7.8125 3.02734Z"
                                                fill="#EE6E27"
                                              />
                                            </svg>

                                            {section.title}
                                          </div>
                                        </div>
                                        {section.clauses.length > 0 && (
                                          <span className="sow-toggle text-[#EE6E27]!">
                                            {sowExpanded ? "−" : "+"}
                                          </span>
                                        )}
                                      </div>
                                      {section.clauses.length > 0 &&
                                        sowExpanded && (
                                          <div className="bg-white rounded-lg p-2 mt-2">
                                            <div className="sow-meta pb-2">
                                              <span className="sow-status">
                                                {section.status}
                                              </span>
                                              <span className="sow-progress">
                                                {Math.round(section.progress)}%
                                              </span>
                                            </div>
                                            <ul className="sow-clauses">
                                              {section.clauses.map((clause) => (
                                                <li key={clause.id}>
                                                  <div className="clause-title">
                                                    {clause.title}
                                                  </div>
                                                  <div className="clause-meta">
                                                    <span>{clause.status}</span>
                                                    {clause.lead && (
                                                      <span>
                                                        Lead: {clause.lead}
                                                      </span>
                                                    )}
                                                    <span>
                                                      {clause.progress}%
                                                    </span>
                                                  </div>
                                                </li>
                                              ))}
                                            </ul>
                                          </div>
                                        )}
                                    </div>
                                  );
                                }
                              )}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </aside>
          {/* <div className="bg-amber-50 w-full h-screen">aside</div> */}
          <MapWipSplit
            sizes={mapWipSizes}
            onSizesChange={handleSplitSizesChange}
            minSizes={[MIN_CONTRACT_MAP_HEIGHT, MIN_CONTRACT_WIP_HEIGHT]}
            mapPane={
              <div className="contract-map-shell" ref={mapShellRef}>
                <div className="map-toolbar">
                  <div className="map-toolbar-row">
                    <div
                      className="map-view-toggle"
                      role="tablist"
                      aria-label="Switch basemap style"
                    >
                      {(Object.keys(MAP_STYLES) as MapView[]).map((viewKey) => {
                        const style = MAP_STYLES[viewKey];
                        return (
                          <button
                            key={viewKey}
                            className={mapView === viewKey ? "active" : ""}
                            onClick={() => setMapView(viewKey)}
                            type="button"
                            role="tab"
                            aria-selected={mapView === viewKey}
                          >
                            {style.label}
                          </button>
                        );
                      })}
                    </div>

                    <div
                      className="map-layer-buttons"
                      role="group"
                      aria-label="Map feature overlays"
                    >
                      <button
                        type="button"
                        className={`btn-map-toggle ${
                          featureToggle.geofences ? "active" : ""
                        }`}
                        onClick={() =>
                          setFeatureToggle((prev) => ({
                            ...prev,
                            geofences: !prev.geofences,
                          }))
                        }
                      >
                        Geofence
                      </button>
                      <button
                        type="button"
                        className={`btn-map-toggle ${
                          featureToggle.intensity ? "active" : ""
                        }`}
                        onClick={() =>
                          setFeatureToggle((prev) => ({
                            ...prev,
                            intensity: !prev.intensity,
                          }))
                        }
                      >
                        Heat
                      </button>
                    </div>
                  </div>

                  {activeContractDisplay && (
                    <div className="map-active-card">
                      <div>
                        <span className="map-active-name">
                          {activeContractDisplay.name}
                        </span>
                        <span className="map-active-phase">
                          {activeContractDisplay.phase}
                        </span>
                      </div>
                      <div className="map-active-meta">
                        <span>
                          {Math.round(activeContractDisplay.status_pct)}%
                          complete
                        </span>
                        <span>Alerts {activeContractDisplay.alerts ?? 0}</span>
                        {activeContractDisplay.status_label && (
                          <span>{activeContractDisplay.status_label}</span>
                        )}
                        {activeContractWeather && (
                          <span>
                            Weather{" "}
                            {activeContractWeather.temperatureC !== null &&
                            activeContractWeather.temperatureC !== undefined
                              ? `${Math.round(
                                  activeContractWeather.temperatureC
                                )}°C`
                              : "--"}{" "}
                            ·{" "}
                            {activeContractWeather.weatherDescription ??
                              "Conditions unavailable"}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {loading && (
                  <div className="contract-loading">Preparing map…</div>
                )}
                {!loading && (
                  <MapContainer
                    key={`${mapView}-${theme}`}
                    center={mapCenter}
                    zoom={12}
                    className="contract-leaflet"
                    scrollWheelZoom
                    zoomControl={false}
                    doubleClickZoom={false}
                    style={{ flex: 1 }}
                  >
                    <TileLayer
                      attribution={mapStyle.attribution}
                      url={mapStyle.url}
                    />
                    <ZoomControl position="topright" />
                    <ScaleControl position="bottomleft" />
                    {bounds && (
                      <FitContractBounds
                        bounds={bounds}
                        focus={
                          focusedContract
                            ? [focusedContract.lat, focusedContract.lng]
                            : undefined
                        }
                      />
                    )}
                    <MapResizeWatcher
                      trigger={`${panelCollapsed}-${theme}-${mapView}-${
                        filteredContracts.length
                      }-${Math.round(
                        (mapShellRef.current?.offsetHeight ?? 0) * 100
                      )}-${mapWipSizes
                        .map((size) => size.toFixed(2))
                        .join("-")}`}
                    />

                    {featureToggle.intensity &&
                      filteredContracts.map((contract) => {
                        const index = Math.min(
                          ALERT_COLOR_MAP.length - 1,
                          Math.max(0, contract.alerts - 1)
                        );
                        const [r, g, b] = ALERT_COLOR_MAP[index];
                        return (
                          <Circle
                            key={`${contract.id}-intensity`}
                            center={[contract.lat, contract.lng]}
                            radius={900 + (contract.alerts || 0) * 250}
                            pathOptions={{
                              color: "transparent",
                              fillColor: `rgba(${r}, ${g}, ${b}, 0.22)`,
                              fillOpacity: 0.22,
                            }}
                          />
                        );
                      })}

                    {featureToggle.geofences &&
                      filteredContracts
                        .filter(
                          (contract) =>
                            contract.geofence_radius_m ||
                            project.geofence_radius_m
                        )
                        .map((contract) => {
                          const [r, g, b] = statusColor(
                            contract.status_label ?? ""
                          );
                          const radius =
                            Math.max(
                              contract.geofence_radius_m ??
                                project.geofence_radius_m ??
                                0,
                              900
                            ) * 1.05;
                          return (
                            <Circle
                              key={`${contract.id}-geofence`}
                              center={[contract.lat, contract.lng]}
                              radius={radius}
                              pathOptions={{
                                color: `rgba(${r}, ${g}, ${b}, 0.85)`,
                                opacity: 0.8,
                                weight: 2,
                                dashArray: "6 6",
                                fillOpacity: 0,
                              }}
                            />
                          );
                        })}

                    {filteredContracts.map((contract) => {
                      const isActive = contract.id === focusedContractId;
                      const weatherPoint =
                        contractWeatherMap.get(contract.id) ?? null;
                      const icon = createContractIcon(
                        contract,
                        theme ?? "light",
                        isActive,
                        weatherPoint
                      );
                      return (
                        <Marker
                          key={contract.id}
                          position={[contract.lat, contract.lng]}
                          icon={icon}
                          eventHandlers={{
                            click: () => handleContractSelect(contract),
                            mouseover: () => setHoveredContract(contract),
                            mouseout: () =>
                              setHoveredContract((prev) =>
                                prev?.id === contract.id ? null : prev
                              ),
                          }}
                        >
                          <Tooltip
                            direction="top"
                            offset={[0, -30]}
                            opacity={0.9}
                          >
                            <div style={{ display: "grid", gap: 4 }}>
                              <strong>{contract.name}</strong>
                              <span style={{ fontSize: "0.75rem" }}>
                                {Math.round(contract.status_pct)}% · Alerts{" "}
                                {contract.alerts}
                              </span>
                              {weatherPoint && (
                                <span style={{ fontSize: "0.7rem" }}>
                                  Weather{" "}
                                  {weatherPoint.temperatureC !== null &&
                                  weatherPoint.temperatureC !== undefined
                                    ? `${Math.round(
                                        weatherPoint.temperatureC
                                      )}°C`
                                    : "--"}{" "}
                                  ·{" "}
                                  {weatherPoint.weatherDescription ??
                                    "Conditions unavailable"}
                                </span>
                              )}
                            </div>
                          </Tooltip>
                        </Marker>
                      );
                    })}
                  </MapContainer>
                )}
              </div>
            }
            wipPane={
              loading && !hasWorkInProgress ? (
                <div className="pp-wip-status">Preparing work in progress…</div>
              ) : hasWorkInProgress ? (
                <WorkInProgressBoard
                  items={workInProgressItems}
                  theme={theme}
                />
              ) : (
                <div className="pp-wip-empty">
                  No work in progress data available yet.
                </div>
              )
            }
          />

          <ProjectProductivityPanel
            projectId={project.id}
            initialContractId={focusedContract?.id ?? contracts[0]?.id}
          />
        </div>
      </div>
      <div
        className="contract-utility-floating"
        aria-label="Contract utility views"
      >
        {visibleUtilityViews.map((view) => {
          const active = view.id === activeUtilityView;
          return (
            <button
              key={view.id}
              type="button"
              className={`utility-dock-btn ${active ? "active" : ""}`}
              onClick={() => {
                if (view.id === "scheduling") {
                  setActiveUtilityView(view.id);
                  handleScheduleNavigate();
                } else {
                  setActiveUtilityView(view.id);
                }
              }}
              aria-pressed={active}
              title={view.label}
            >
              <span aria-hidden>{view.icon}</span>
              <span className="sr-only">{view.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const WORK_STATUS_COLORS: Record<string, string> = {
  Construction: "#1d4ed8",
  Bidding: "#c2410c",
  "Pre-PQ": "#d97706",
  PQ: "#7c3aed",
};
const WORK_STATUS_ORDER: Array<keyof typeof WORK_STATUS_COLORS> = [
  "Construction",
  "Bidding",
  "Pre-PQ",
  "PQ",
];

type WorkStatusFilter = keyof typeof WORK_STATUS_COLORS | "All";

const normaliseWorkStatus = (
  status?: string | null,
  phase?: string | null
): keyof typeof WORK_STATUS_COLORS => {
  const source = `${status ?? ""} ${phase ?? ""}`.toLowerCase();
  if (
    source.includes("pre-pq") ||
    source.includes("pre pq") ||
    source.includes("prequalification") ||
    source.includes("prequal")
  ) {
    return "Pre-PQ";
  }
  if (source.includes("pq")) {
    return "PQ";
  }
  if (
    source.includes("bid") ||
    source.includes("tender") ||
    source.includes("procure")
  ) {
    return "Bidding";
  }
  return "Construction";
};

function WorkInProgressBoard({
  items,
  theme,
}: {
  items: WorkInProgressMetric[];
  theme?: Theme;
}) {
  if (!items.length) {
    return null;
  }

  const summaryOrder: Array<keyof typeof WORK_STATUS_COLORS> = [
    "Construction",
    "Bidding",
    "Pre-PQ",
    "PQ",
  ];
  const [activeStatus, setActiveStatus] = useState<WorkStatusFilter>("All");

  const summary = useMemo(
    () =>
      summaryOrder.map((status) => {
        const bucket = items.filter((item) => item.status === status);
        const count = bucket.length;
        const average = count
          ? bucket.reduce((sum, item) => sum + item.percent, 0) / count
          : null;
        return { status, count, color: WORK_STATUS_COLORS[status], average };
      }),
    [items]
  );

  const filteredItems = useMemo(() => {
    if (activeStatus === "All") return items;
    return items.filter((item) => item.status === activeStatus);
  }, [items, activeStatus]);

  const legendEntries = useMemo(
    () =>
      Array.from(
        new Map(
          filteredItems.map((item) => [
            item.contract,
            { contract: item.contract, color: contractAccent(item.contract) },
          ])
        ).values()
      ),
    [filteredItems]
  );

  const rankedItems = useMemo(
    () => [...filteredItems].sort((a, b) => b.percent - a.percent),
    [filteredItems]
  );
  const totalProjects = items.length;
  const emptyState = !rankedItems.length;
  const filterLabel =
    activeStatus === "All" ? "All stages" : `${activeStatus} stage`;
  const stageHint =
    activeStatus === "All"
      ? `Showing ${rankedItems.length} of ${totalProjects} contracts`
      : rankedItems.length
      ? `Showing ${rankedItems.length} ${
          rankedItems.length === 1 ? "contract" : "contracts"
        }`
      : `No contracts currently in ${activeStatus}`;

  return (
    <div className="contract-wip-board pp-wip">
      <div className="wip-header">
        <h4>Work in progress</h4>
        <span>
          {filterLabel} · {stageHint}
        </span>
      </div>
      <div className="min-h-[120px] overflow-auto">
        {/* <div className="wip-summary">
          {summary.map(({ status, count, color, average }) => {
            const isActive = activeStatus === status;
            const displayAverage =
              average !== null ? `${Math.round(average)}% avg` : "—";
            return (
              <button
                key={status}
                type="button"
                className={`wip-summary-chip ${isActive ? "active" : ""}`}
                style={{ "--chip-accent": color } as React.CSSProperties}
                aria-pressed={isActive}
                onClick={() =>
                  setActiveStatus((prev) => (prev === status ? "All" : status))
                }
              >
                <span className="wip-summary-count">{count}</span>
                <span className="wip-summary-label">{status}</span>
                <span className="wip-summary-sub">{displayAverage}</span>
              </button>
            );
          })}
        </div> */}

        {emptyState ? (
          <div className="wip-empty-state">
            No active contracts in this stage. Try another status.
          </div>
        ) : (
          <>
            <div className="wip-track wip-track-horizontal">
              {rankedItems.map((item) => {
                const progress = Math.max(0, Math.min(100, item.percent));
                const accent =
                  WORK_STATUS_COLORS[item.status] ??
                  contractAccent(item.contract);
                const circumference = 2 * Math.PI * 40;
                const dashOffset = circumference * (1 - progress / 100);

                return (
                  <div
                    key={item.contract + item.status}
                    className="wip-chart-item"
                  >
                    <div className="wip-chart-circle">
                      <svg
                        className="wip-chart-svg"
                        viewBox="0 0 100 100"
                        role="presentation"
                        aria-hidden
                      >
                        <circle
                          className="wip-chart-track"
                          cx="50"
                          cy="50"
                          r="40"
                          fill="none"
                          stroke="#e2e8f0"
                          strokeWidth="2"
                        />
                        <circle
                          className="wip-chart-progress"
                          cx="50"
                          cy="50"
                          r="40"
                          fill="none"
                          stroke={accent}
                          strokeWidth="15"
                          strokeDasharray={circumference}
                          strokeDashoffset={dashOffset}
                          // strokeLinecap="round"
                          transform="rotate(-90 50 50)"
                        />
                        <text
                          x="50"
                          y="55"
                          className="wip-chart-text"
                          textAnchor="middle"
                          fill="#1a1a1a"
                          fontSize="16"
                          fontWeight="600"
                        >
                          {Math.round(progress)}%
                        </text>
                      </svg>
                      {/* <div
                        className="wip-chart-indicator"
                        style={{ backgroundColor: accent }}
                      /> */}
                    </div>
                    <div className="wip-chart-label" title={item.contract}>
                      {item.contract}
                    </div>
                    <div className="wip-chart-status font-semibold">
                      Status: {item.status}
                    </div>
                  </div>
                );
              })}
              {/* {rankedItems.map((item) => {
                const progress = Math.max(0, Math.min(100, item.percent));
                const accent =
                  WORK_STATUS_COLORS[item.status] ??
                  contractAccent(item.contract);
                const circumference = 2 * Math.PI * 36;
                const dashOffset = circumference * (1 - progress / 100);
                const gradientId = `wip-dial-${item.contract.replace(
                  /[^a-z0-9]/gi,
                  ""
                )}-${item.status.replace(/[^a-z0-9]/gi, "")}`;
                const haloId = `${gradientId}-halo`;
                const textColor = theme === "light" ? "#0f172a" : "#f8fafc";
                const trackColor =
                  theme === "light" ? "#e2e8f0" : "rgba(148, 163, 184, 0.35)";
                const tone =
                  progress >= 65
                    ? "ahead"
                    : progress >= 40
                    ? "steady"
                    : "lagging";
                return (
                  <div
                    key={item.contract + item.status}
                    className={`wip-card tone-${tone}`}
                  >
                    <svg
                      className="wip-dial"
                      viewBox="0 0 120 120"
                      role="presentation"
                      aria-hidden
                    >
                      <defs>
                        <radialGradient id={haloId} cx="50%" cy="50%" r="60%">
                          <stop
                            offset="0%"
                            stopColor={accent}
                            stopOpacity={0.55}
                          />
                          <stop
                            offset="65%"
                            stopColor={accent}
                            stopOpacity={0.16}
                          />
                          <stop
                            offset="100%"
                            stopColor={accent}
                            stopOpacity={0}
                          />
                        </radialGradient>
                        <linearGradient
                          id={gradientId}
                          x1="0%"
                          y1="0%"
                          x2="100%"
                          y2="100%"
                        >
                          <stop
                            offset="0%"
                            stopColor={accent}
                            stopOpacity={0.9}
                          />
                          <stop
                            offset="100%"
                            stopColor={accent}
                            stopOpacity={0.5}
                          />
                        </linearGradient>
                      </defs>
                      <circle
                        className="wip-dial-halo"
                        cx="60"
                        cy="60"
                        r="50"
                        fill={`url(#${haloId})`}
                      />
                      <circle
                        className="wip-dial-track"
                        cx="60"
                        cy="60"
                        r="36"
                        stroke={trackColor}
                      />
                      <circle
                        className="wip-dial-progress"
                        cx="60"
                        cy="60"
                        r="36"
                        stroke={`url(#${gradientId})`}
                        strokeDasharray={`${circumference} ${circumference}`}
                        strokeDashoffset={dashOffset}
                      />
                      <text
                        x="60"
                        y="64"
                        className="wip-dial-text"
                        fill={textColor}
                      >
                        {Math.round(progress)}%
                      </text>
                    </svg>
                    <div className="wip-details">
                      <strong>{item.contract}</strong>
                      <span className="wip-status-chip">{item.status}</span>
                    </div>
                  </div>
                );
              })} */}
            </div>

            <div className="wip-legend">
              {legendEntries.map((entry) => (
                <div key={entry.contract} className="wip-legend-chip">
                  <span
                    className="wip-legend-dot"
                    style={{ background: entry.color }}
                  />
                  <span>{entry.contract}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
