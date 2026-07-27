/**
 * Shared stack-signal presentation: brand icons + friendly labels for DNA /
 * Domains chips. Presentation-only — does not change detector output.
 */
import type { ComponentType } from "react";
import {
  AppWindow,
  Boxes,
  Cloud,
  Cpu,
  Database,
  FlaskConical,
  Monitor,
  Package,
  Server,
  Smartphone,
  Wrench,
} from "lucide-react";
import {
  SiAngular,
  SiAstro,
  SiBun,
  SiDjango,
  SiDocker,
  SiElectron,
  SiExpo,
  SiExpress,
  SiFastapi,
  SiFastify,
  SiFlask,
  SiFlutter,
  SiJest,
  SiJupyter,
  SiKubernetes,
  SiNestjs,
  SiNextdotjs,
  SiNodedotjs,
  SiNpm,
  SiNx,
  SiNuxt,
  SiPnpm,
  SiPytorch,
  SiReact,
  SiRemix,
  SiSpring,
  SiSvelte,
  SiTensorflow,
  SiTerraform,
  SiTurborepo,
  SiVite,
  SiVitest,
  SiVuedotjs,
  SiYarn,
} from "react-icons/si";

export type SignalIcon = ComponentType<{
  size?: number | string;
  "aria-hidden"?: boolean;
}>;

/** Signal id prefix → category label + icon + accent (ordered; first wins). */
const SIGNAL_CATEGORIES: {
  prefix: string;
  category: string;
  icon: SignalIcon;
  color: string;
}[] = [
  {
    prefix: "pm-",
    category: "Package Manager",
    icon: Package,
    color: "#00C2C2",
  },
  { prefix: "mono-", category: "Monorepo", icon: Boxes, color: "#3B82F6" },
  {
    prefix: "frontend-",
    category: "Frontend",
    icon: Monitor,
    color: "#6C63FF",
  },
  { prefix: "backend-", category: "Backend", icon: Server, color: "#10B981" },
  { prefix: "mobile-", category: "Mobile", icon: Smartphone, color: "#F59E0B" },
  {
    prefix: "desktop-",
    category: "Desktop",
    icon: AppWindow,
    color: "#38BDF8",
  },
  { prefix: "devops-", category: "DevOps", icon: Cloud, color: "#FB923C" },
  { prefix: "ci-", category: "CI / CD", icon: Cloud, color: "#FB923C" },
  { prefix: "data-", category: "Data / ML", icon: Database, color: "#A855F7" },
  {
    prefix: "test-",
    category: "Testing",
    icon: FlaskConical,
    color: "#F43F5E",
  },
  { prefix: "lang-", category: "Language", icon: Cpu, color: "#94A3B8" },
  { prefix: "runtime-", category: "Runtime", icon: Cpu, color: "#84CC16" },
  { prefix: "nodejs", category: "Runtime", icon: Cpu, color: "#84CC16" },
  { prefix: "node-", category: "Runtime", icon: Cpu, color: "#84CC16" },
  { prefix: "game-", category: "Game", icon: AppWindow, color: "#EC4899" },
];

/** Real brand logos (Simple Icons) per signal id; falls back to category icon. */
const BRAND_ICONS: Record<string, SignalIcon> = {
  "frontend-next": SiNextdotjs,
  "frontend-react": SiReact,
  "frontend-vue": SiVuedotjs,
  "frontend-svelte": SiSvelte,
  "frontend-angular": SiAngular,
  "frontend-nuxt": SiNuxt,
  "frontend-vite": SiVite,
  "frontend-astro": SiAstro,
  "frontend-remix": SiRemix,
  "backend-nest": SiNestjs,
  "backend-express": SiExpress,
  "backend-fastify": SiFastify,
  "backend-python-django": SiDjango,
  "backend-python-fastapi": SiFastapi,
  "backend-python-flask": SiFlask,
  "backend-java-spring": SiSpring,
  "mobile-expo": SiExpo,
  "mobile-react-native": SiReact,
  "mobile-flutter": SiFlutter,
  "desktop-electron": SiElectron,
  "pm-bun": SiBun,
  "pm-pnpm": SiPnpm,
  "pm-npm": SiNpm,
  "pm-yarn": SiYarn,
  "test-vitest": SiVitest,
  "test-jest": SiJest,
  "data-jupyter": SiJupyter,
  "data-pytorch": SiPytorch,
  "data-tensorflow": SiTensorflow,
  "mono-turbo": SiTurborepo,
  "mono-nx": SiNx,
  "devops-docker": SiDocker,
  "devops-k8s": SiKubernetes,
  "devops-terraform": SiTerraform,
  "nodejs-manifest": SiNodedotjs,
};

/** Friendly tech names for signal ids that don't title-case nicely. */
const SIGNAL_LABELS: Record<string, string> = {
  "pm-npm": "npm",
  "pm-pnpm": "pnpm",
  "frontend-next": "Next.js",
  "frontend-nuxt": "Nuxt",
  "frontend-vite": "Vite",
  "frontend-astro": "Astro",
  "frontend-remix": "Remix",
  "backend-nest": "NestJS",
  "backend-express": "Express",
  "backend-fastify": "Fastify",
  "backend-python-django": "Django",
  "backend-python-fastapi": "FastAPI",
  "backend-python-flask": "Flask",
  "backend-java-spring": "Spring",
  "backend-dotnet": ".NET",
  "backend-rails": "Rails",
  "mobile-react-native": "React Native",
  "mobile-flutter": "Flutter",
  "desktop-electron": "Electron",
  "desktop-tauri": "Tauri",
  "data-jupyter": "Jupyter",
  "data-pytorch": "PyTorch",
  "data-tensorflow": "TensorFlow",
  "data-langchain": "LangChain",
  "data-eng-dbt": "dbt",
  "data-eng-airflow": "Airflow",
  "devops-docker": "Docker",
  "devops-k8s": "Kubernetes",
  "devops-terraform": "Terraform",
  "devops-pulumi": "Pulumi",
  "mono-turbo": "Turborepo",
  "mono-nx": "Nx",
  "mono-moon": "Moon",
  "nodejs-manifest": "Node.js",
  "game-unity": "Unity",
};

function titleCase(id: string): string {
  return id
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export type SignalMeta = {
  label: string;
  category: string;
  icon: SignalIcon;
  color: string;
};

/** Split a signal id into a heading (tech), a category tag, an icon, accent. */
export function describeSignal(id: string, domain: string): SignalMeta {
  const match = SIGNAL_CATEGORIES.find((c) => id.startsWith(c.prefix));
  const rest = match ? id.slice(match.prefix.length) : id;
  const label =
    SIGNAL_LABELS[id] ?? (rest === "" ? titleCase(id) : titleCase(rest));
  return {
    label,
    category: match?.category ?? titleCase(domain),
    icon: BRAND_ICONS[id] ?? match?.icon ?? Wrench,
    color: match?.color ?? "#8AA0AA",
  };
}

/** Hover copy for a detected framework/signal (evidence + confidence). */
export function signalDetectionTip(
  signal: { confidence: number; evidence?: readonly string[] } | undefined,
): string {
  if (!signal) return "Detected from local manifests and import signals.";
  const pct = Math.round(signal.confidence * 100);
  const evidence = (signal.evidence ?? []).slice(0, 4);
  if (evidence.length === 0)
    return `Based on stack signals · ${pct}% confidence`;
  return `Based on ${evidence.join(", ")} · ${pct}% confidence`;
}
