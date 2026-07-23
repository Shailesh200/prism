import {
  AppWindow,
  Cloud,
  Database,
  Monitor,
  Server,
  Smartphone,
} from "lucide-react";
import type { ComponentType } from "react";

export type DomainCatalogEntry = {
  readonly id: string;
  readonly label: string;
  readonly shortLabel: string;
  readonly description: string;
  readonly icon: ComponentType<{
    size?: number | string;
    "aria-hidden"?: boolean;
  }>;
};

/** Stack domains surfaced across Profile, Domains explorer, and domain screens. */
export const DOMAIN_CATALOG: readonly DomainCatalogEntry[] = [
  {
    id: "frontend",
    label: "Web · Frontend",
    shortLabel: "Frontend",
    description:
      "Core Web Vitals and frontend performance surface (local lab / CWV report).",
    icon: Monitor,
  },
  {
    id: "backend",
    label: "Backend · Services & APIs",
    shortLabel: "Backend",
    description:
      "API surface, handlers, security and test-coverage heuristics.",
    icon: Server,
  },
  {
    id: "devops_platform",
    label: "DevOps · Platform",
    shortLabel: "DevOps",
    description:
      "IaC resources, containers, and CI/CD pipelines (GitHub Actions).",
    icon: Cloud,
  },
  {
    id: "mobile",
    label: "Mobile",
    shortLabel: "Mobile",
    description: "Screens, navigators and mobile navigation surface.",
    icon: Smartphone,
  },
  {
    id: "desktop",
    label: "Desktop",
    shortLabel: "Desktop",
    description:
      "Main / preload / renderer process surface and IPC-touching files.",
    icon: AppWindow,
  },
  {
    id: "data_ml_ai",
    label: "Data / ML",
    shortLabel: "Data / ML",
    description: "Pipelines, DAGs, models and notebooks.",
    icon: Database,
  },
];
