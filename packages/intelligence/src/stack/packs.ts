import { join } from "node:path";
import { DeveloperPersona, StackDomain } from "@prism/shared";
import { createUnknownDetector } from "../detectors.js";
import type { StackDetector } from "../types.js";
import {
  createManifestDetector,
  existingEvidence,
  findFilesWithExt,
  hasAnyDep,
  pathExists,
  readPackageJson,
} from "./manifest.js";

function toolingPmDetectors(): StackDetector[] {
  return [
    createManifestDetector({
      id: "pm-bun",
      domains: [StackDomain.TOOLING],
      personaHints: [],
      async match(ctx) {
        const evidence = await existingEvidence(ctx.rootPath, [
          "bun.lock",
          "bun.lockb",
        ]);
        if (evidence.length === 0) return null;
        return { confidence: 0.9, evidence };
      },
    }),
    createManifestDetector({
      id: "pm-pnpm",
      domains: [StackDomain.TOOLING],
      personaHints: [],
      async match(ctx) {
        const evidence = await existingEvidence(ctx.rootPath, [
          "pnpm-lock.yaml",
          "pnpm-workspace.yaml",
        ]);
        if (evidence.length === 0) return null;
        return { confidence: 0.85, evidence };
      },
    }),
    createManifestDetector({
      id: "pm-yarn",
      domains: [StackDomain.TOOLING],
      personaHints: [],
      async match(ctx) {
        const evidence = await existingEvidence(ctx.rootPath, [
          "yarn.lock",
          ".yarnrc.yml",
        ]);
        if (evidence.length === 0) return null;
        return { confidence: 0.8, evidence };
      },
    }),
    createManifestDetector({
      id: "pm-npm",
      domains: [StackDomain.TOOLING],
      personaHints: [],
      async match(ctx) {
        const evidence = await existingEvidence(ctx.rootPath, [
          "package-lock.json",
        ]);
        if (evidence.length === 0) return null;
        return { confidence: 0.75, evidence };
      },
    }),
    createManifestDetector({
      id: "nodejs-manifest",
      domains: [StackDomain.TOOLING],
      personaHints: [],
      async match(ctx) {
        const evidence = await existingEvidence(ctx.rootPath, ["package.json"]);
        if (evidence.length === 0) return null;
        return { confidence: 0.4, evidence };
      },
    }),
    createManifestDetector({
      id: "mono-turbo",
      domains: [StackDomain.TOOLING],
      personaHints: [DeveloperPersona.PLATFORM_ENGINEER],
      async match(ctx) {
        const evidence = await existingEvidence(ctx.rootPath, ["turbo.json"]);
        const pkg = await readPackageJson(ctx.rootPath);
        if (evidence.length === 0 && !(pkg && hasAnyDep(pkg, ["turbo"]))) {
          return null;
        }
        return {
          confidence: 0.8,
          evidence: evidence.length > 0 ? evidence : ["package.json"],
        };
      },
    }),
    createManifestDetector({
      id: "mono-nx",
      domains: [StackDomain.TOOLING],
      personaHints: [DeveloperPersona.PLATFORM_ENGINEER],
      async match(ctx) {
        const evidence = await existingEvidence(ctx.rootPath, [
          "nx.json",
          "workspace.json",
        ]);
        const pkg = await readPackageJson(ctx.rootPath);
        if (
          evidence.length === 0 &&
          !(pkg && hasAnyDep(pkg, ["nx", "@nx/devkit"]))
        ) {
          return null;
        }
        return {
          confidence: 0.8,
          evidence: evidence.length > 0 ? evidence : ["package.json"],
        };
      },
    }),
    createManifestDetector({
      id: "mono-moon",
      domains: [StackDomain.TOOLING],
      personaHints: [DeveloperPersona.PLATFORM_ENGINEER],
      async match(ctx) {
        const evidence = await existingEvidence(ctx.rootPath, [
          ".moon/workspace.yml",
          "moon.yml",
        ]);
        if (evidence.length === 0) return null;
        return { confidence: 0.85, evidence };
      },
    }),
    createManifestDetector({
      id: "test-vitest",
      domains: [StackDomain.TOOLING],
      personaHints: [DeveloperPersona.QA_ENGINEER],
      async match(ctx) {
        const pkg = await readPackageJson(ctx.rootPath);
        if (!pkg || !hasAnyDep(pkg, ["vitest"])) return null;
        return { confidence: 0.85, evidence: ["package.json"] };
      },
    }),
    createManifestDetector({
      id: "test-jest",
      domains: [StackDomain.TOOLING],
      personaHints: [DeveloperPersona.QA_ENGINEER],
      async match(ctx) {
        const pkg = await readPackageJson(ctx.rootPath);
        if (!pkg || !hasAnyDep(pkg, ["jest", "@jest/core"])) return null;
        return { confidence: 0.8, evidence: ["package.json"] };
      },
    }),
    createManifestDetector({
      id: "test-pytest",
      domains: [StackDomain.TOOLING],
      personaHints: [DeveloperPersona.QA_ENGINEER],
      async match(ctx) {
        const evidence = await existingEvidence(ctx.rootPath, [
          "pytest.ini",
          "pyproject.toml",
        ]);
        const req = join(ctx.rootPath, "requirements.txt");
        if (await pathExists(req)) {
          const { readFile } = await import("node:fs/promises");
          const text = await readFile(req, "utf8");
          if (/pytest/i.test(text)) {
            return { confidence: 0.8, evidence: ["requirements.txt"] };
          }
        }
        if (evidence.includes("pytest.ini")) {
          return { confidence: 0.85, evidence: ["pytest.ini"] };
        }
        return null;
      },
    }),
  ];
}

function frontendDetectors(): StackDetector[] {
  return [
    createManifestDetector({
      id: "frontend-react",
      domains: [StackDomain.FRONTEND],
      personaHints: [DeveloperPersona.FRONTEND_ENGINEER],
      async match(ctx) {
        const pkg = await readPackageJson(ctx.rootPath);
        if (!pkg || !hasAnyDep(pkg, ["react", "react-dom"])) return null;
        return { confidence: 0.9, evidence: ["package.json"] };
      },
    }),
    createManifestDetector({
      id: "frontend-next",
      domains: [StackDomain.FRONTEND],
      personaHints: [DeveloperPersona.FRONTEND_ENGINEER],
      async match(ctx) {
        const pkg = await readPackageJson(ctx.rootPath);
        const evidence = await existingEvidence(ctx.rootPath, [
          "next.config.js",
          "next.config.mjs",
          "next.config.ts",
        ]);
        const hasNext = pkg !== null && hasAnyDep(pkg, ["next"]);
        if (!hasNext && evidence.length === 0) return null;
        const paths = [...evidence];
        if (pkg) paths.push("package.json");
        return { confidence: 0.92, evidence: paths };
      },
    }),
    createManifestDetector({
      id: "frontend-vite",
      domains: [StackDomain.FRONTEND],
      personaHints: [DeveloperPersona.FRONTEND_ENGINEER],
      async match(ctx) {
        const pkg = await readPackageJson(ctx.rootPath);
        const evidence = await existingEvidence(ctx.rootPath, [
          "vite.config.ts",
          "vite.config.js",
          "vite.config.mts",
        ]);
        if (!(pkg && hasAnyDep(pkg, ["vite"])) && evidence.length === 0) {
          return null;
        }
        return {
          confidence: 0.85,
          evidence: evidence.length > 0 ? evidence : ["package.json"],
        };
      },
    }),
    createManifestDetector({
      id: "frontend-vue",
      domains: [StackDomain.FRONTEND],
      personaHints: [DeveloperPersona.FRONTEND_ENGINEER],
      async match(ctx) {
        const pkg = await readPackageJson(ctx.rootPath);
        if (!pkg || !hasAnyDep(pkg, ["vue", "nuxt"])) return null;
        return { confidence: 0.88, evidence: ["package.json"] };
      },
    }),
    createManifestDetector({
      id: "frontend-svelte",
      domains: [StackDomain.FRONTEND],
      personaHints: [DeveloperPersona.FRONTEND_ENGINEER],
      async match(ctx) {
        const pkg = await readPackageJson(ctx.rootPath);
        if (!pkg || !hasAnyDep(pkg, ["svelte", "@sveltejs/kit"])) return null;
        return { confidence: 0.88, evidence: ["package.json"] };
      },
    }),
    createManifestDetector({
      id: "frontend-angular",
      domains: [StackDomain.FRONTEND],
      personaHints: [DeveloperPersona.FRONTEND_ENGINEER],
      async match(ctx) {
        const pkg = await readPackageJson(ctx.rootPath);
        if (!pkg || !hasAnyDep(pkg, ["@angular/core"])) return null;
        return { confidence: 0.9, evidence: ["package.json"] };
      },
    }),
    createManifestDetector({
      id: "frontend-astro",
      domains: [StackDomain.FRONTEND],
      personaHints: [DeveloperPersona.FRONTEND_ENGINEER],
      async match(ctx) {
        const pkg = await readPackageJson(ctx.rootPath);
        if (!pkg || !hasAnyDep(pkg, ["astro"])) return null;
        return { confidence: 0.88, evidence: ["package.json"] };
      },
    }),
    createManifestDetector({
      id: "frontend-remix",
      domains: [StackDomain.FRONTEND],
      personaHints: [DeveloperPersona.FRONTEND_ENGINEER],
      async match(ctx) {
        const pkg = await readPackageJson(ctx.rootPath);
        if (!pkg || !hasAnyDep(pkg, ["@remix-run/react", "@remix-run/node"])) {
          return null;
        }
        return { confidence: 0.88, evidence: ["package.json"] };
      },
    }),
  ];
}

function backendDetectors(): StackDetector[] {
  return [
    createManifestDetector({
      id: "backend-express",
      domains: [StackDomain.BACKEND],
      personaHints: [DeveloperPersona.BACKEND_ENGINEER],
      async match(ctx) {
        const pkg = await readPackageJson(ctx.rootPath);
        if (!pkg || !hasAnyDep(pkg, ["express"])) return null;
        return { confidence: 0.85, evidence: ["package.json"] };
      },
    }),
    createManifestDetector({
      id: "backend-fastify",
      domains: [StackDomain.BACKEND],
      personaHints: [DeveloperPersona.BACKEND_ENGINEER],
      async match(ctx) {
        const pkg = await readPackageJson(ctx.rootPath);
        if (!pkg || !hasAnyDep(pkg, ["fastify"])) return null;
        return { confidence: 0.85, evidence: ["package.json"] };
      },
    }),
    createManifestDetector({
      id: "backend-nest",
      domains: [StackDomain.BACKEND],
      personaHints: [DeveloperPersona.BACKEND_ENGINEER],
      async match(ctx) {
        const pkg = await readPackageJson(ctx.rootPath);
        if (!pkg || !hasAnyDep(pkg, ["@nestjs/core", "@nestjs/common"])) {
          return null;
        }
        return { confidence: 0.9, evidence: ["package.json"] };
      },
    }),
    createManifestDetector({
      id: "backend-go",
      domains: [StackDomain.BACKEND],
      personaHints: [DeveloperPersona.BACKEND_ENGINEER],
      async match(ctx) {
        const evidence = await existingEvidence(ctx.rootPath, ["go.mod"]);
        if (evidence.length === 0) return null;
        return { confidence: 0.9, evidence };
      },
    }),
    createManifestDetector({
      id: "backend-python-django",
      domains: [StackDomain.BACKEND],
      personaHints: [DeveloperPersona.BACKEND_ENGINEER],
      async match(ctx) {
        const evidence = await existingEvidence(ctx.rootPath, [
          "manage.py",
          "requirements.txt",
          "pyproject.toml",
        ]);
        if (await pathExists(join(ctx.rootPath, "requirements.txt"))) {
          const { readFile } = await import("node:fs/promises");
          const text = await readFile(
            join(ctx.rootPath, "requirements.txt"),
            "utf8",
          );
          if (/django/i.test(text)) {
            return { confidence: 0.88, evidence: ["requirements.txt"] };
          }
        }
        if (evidence.includes("manage.py")) {
          return { confidence: 0.85, evidence: ["manage.py"] };
        }
        return null;
      },
    }),
    createManifestDetector({
      id: "backend-python-fastapi",
      domains: [StackDomain.BACKEND],
      personaHints: [DeveloperPersona.BACKEND_ENGINEER],
      async match(ctx) {
        if (!(await pathExists(join(ctx.rootPath, "requirements.txt")))) {
          return null;
        }
        const { readFile } = await import("node:fs/promises");
        const text = await readFile(
          join(ctx.rootPath, "requirements.txt"),
          "utf8",
        );
        if (!/fastapi/i.test(text)) return null;
        return { confidence: 0.9, evidence: ["requirements.txt"] };
      },
    }),
    createManifestDetector({
      id: "backend-python-flask",
      domains: [StackDomain.BACKEND],
      personaHints: [DeveloperPersona.BACKEND_ENGINEER],
      async match(ctx) {
        if (!(await pathExists(join(ctx.rootPath, "requirements.txt")))) {
          return null;
        }
        const { readFile } = await import("node:fs/promises");
        const text = await readFile(
          join(ctx.rootPath, "requirements.txt"),
          "utf8",
        );
        if (!/flask/i.test(text)) return null;
        return { confidence: 0.85, evidence: ["requirements.txt"] };
      },
    }),
    createManifestDetector({
      id: "backend-java-spring",
      domains: [StackDomain.BACKEND],
      personaHints: [DeveloperPersona.BACKEND_ENGINEER],
      async match(ctx) {
        const evidence = await existingEvidence(ctx.rootPath, [
          "pom.xml",
          "build.gradle",
          "build.gradle.kts",
        ]);
        if (evidence.length === 0) return null;
        if (await pathExists(join(ctx.rootPath, "pom.xml"))) {
          const { readFile } = await import("node:fs/promises");
          const text = await readFile(join(ctx.rootPath, "pom.xml"), "utf8");
          if (!/spring/i.test(text)) return null;
        }
        return { confidence: 0.85, evidence };
      },
    }),
    createManifestDetector({
      id: "backend-dotnet",
      domains: [StackDomain.BACKEND],
      personaHints: [DeveloperPersona.BACKEND_ENGINEER],
      async match(ctx) {
        const csproj = await findFilesWithExt(ctx.rootPath, ".csproj", 2, 3);
        if (csproj.length === 0) return null;
        return { confidence: 0.85, evidence: csproj };
      },
    }),
    createManifestDetector({
      id: "backend-rails",
      domains: [StackDomain.BACKEND],
      personaHints: [DeveloperPersona.BACKEND_ENGINEER],
      async match(ctx) {
        const evidence = await existingEvidence(ctx.rootPath, [
          "Gemfile",
          "config/application.rb",
        ]);
        if (!evidence.includes("Gemfile")) return null;
        const { readFile } = await import("node:fs/promises");
        const text = await readFile(join(ctx.rootPath, "Gemfile"), "utf8");
        if (!/rails/i.test(text)) return null;
        return { confidence: 0.88, evidence };
      },
    }),
  ];
}

function mobileDesktopDetectors(): StackDetector[] {
  return [
    createManifestDetector({
      id: "mobile-react-native",
      domains: [StackDomain.MOBILE],
      personaHints: [DeveloperPersona.MOBILE_ENGINEER],
      async match(ctx) {
        const pkg = await readPackageJson(ctx.rootPath);
        if (!pkg || !hasAnyDep(pkg, ["react-native"])) return null;
        return { confidence: 0.9, evidence: ["package.json"] };
      },
    }),
    createManifestDetector({
      id: "mobile-expo",
      domains: [StackDomain.MOBILE],
      personaHints: [DeveloperPersona.MOBILE_ENGINEER],
      async match(ctx) {
        const pkg = await readPackageJson(ctx.rootPath);
        const evidence = await existingEvidence(ctx.rootPath, [
          "app.json",
          "app.config.js",
          "app.config.ts",
        ]);
        if (!(pkg && hasAnyDep(pkg, ["expo"])) && evidence.length === 0) {
          return null;
        }
        if (!(pkg && hasAnyDep(pkg, ["expo"]))) return null;
        return {
          confidence: 0.92,
          evidence:
            evidence.length > 0
              ? [...evidence, "package.json"]
              : ["package.json"],
        };
      },
    }),
    createManifestDetector({
      id: "mobile-flutter",
      domains: [StackDomain.MOBILE],
      personaHints: [DeveloperPersona.MOBILE_ENGINEER],
      async match(ctx) {
        const evidence = await existingEvidence(ctx.rootPath, ["pubspec.yaml"]);
        if (evidence.length === 0) return null;
        const { readFile } = await import("node:fs/promises");
        const text = await readFile(join(ctx.rootPath, "pubspec.yaml"), "utf8");
        if (!/flutter:/i.test(text) && !/sdk:\s*flutter/i.test(text)) {
          return null;
        }
        return { confidence: 0.9, evidence };
      },
    }),
    createManifestDetector({
      id: "desktop-electron",
      domains: [StackDomain.DESKTOP],
      personaHints: [DeveloperPersona.DESKTOP_ENGINEER],
      async match(ctx) {
        const pkg = await readPackageJson(ctx.rootPath);
        if (!pkg || !hasAnyDep(pkg, ["electron"])) return null;
        return { confidence: 0.9, evidence: ["package.json"] };
      },
    }),
    createManifestDetector({
      id: "desktop-tauri",
      domains: [StackDomain.DESKTOP],
      personaHints: [DeveloperPersona.DESKTOP_ENGINEER],
      async match(ctx) {
        const evidence = await existingEvidence(ctx.rootPath, [
          "src-tauri/tauri.conf.json",
          "tauri.conf.json",
        ]);
        const pkg = await readPackageJson(ctx.rootPath);
        if (
          evidence.length === 0 &&
          !(pkg && hasAnyDep(pkg, ["@tauri-apps/api", "@tauri-apps/cli"]))
        ) {
          return null;
        }
        return {
          confidence: 0.9,
          evidence: evidence.length > 0 ? evidence : ["package.json"],
        };
      },
    }),
  ];
}

function dataDetectors(): StackDetector[] {
  return [
    createManifestDetector({
      id: "data-jupyter",
      domains: [StackDomain.DATA_ML_AI],
      personaHints: [DeveloperPersona.DATA_SCIENTIST],
      async match(ctx) {
        const notebooks = await findFilesWithExt(ctx.rootPath, ".ipynb", 3, 5);
        const pkg = await readPackageJson(ctx.rootPath);
        const jupyterDep =
          pkg !== null && hasAnyDep(pkg, ["jupyter", "notebook", "jupyterlab"]);
        if (notebooks.length === 0 && !jupyterDep) return null;
        return {
          confidence: notebooks.length > 0 ? 0.9 : 0.7,
          evidence: notebooks.length > 0 ? notebooks : ["package.json"],
        };
      },
    }),
    createManifestDetector({
      id: "data-pytorch",
      domains: [StackDomain.DATA_ML_AI],
      personaHints: [DeveloperPersona.ML_ENGINEER],
      async match(ctx) {
        if (!(await pathExists(join(ctx.rootPath, "requirements.txt")))) {
          return null;
        }
        const { readFile } = await import("node:fs/promises");
        const text = await readFile(
          join(ctx.rootPath, "requirements.txt"),
          "utf8",
        );
        if (!/torch/i.test(text)) return null;
        return { confidence: 0.9, evidence: ["requirements.txt"] };
      },
    }),
    createManifestDetector({
      id: "data-tensorflow",
      domains: [StackDomain.DATA_ML_AI],
      personaHints: [DeveloperPersona.ML_ENGINEER],
      async match(ctx) {
        if (!(await pathExists(join(ctx.rootPath, "requirements.txt")))) {
          return null;
        }
        const { readFile } = await import("node:fs/promises");
        const text = await readFile(
          join(ctx.rootPath, "requirements.txt"),
          "utf8",
        );
        if (!/tensorflow/i.test(text)) return null;
        return { confidence: 0.9, evidence: ["requirements.txt"] };
      },
    }),
    createManifestDetector({
      id: "data-langchain",
      domains: [StackDomain.DATA_ML_AI],
      personaHints: [DeveloperPersona.AI_ENGINEER],
      async match(ctx) {
        const pkg = await readPackageJson(ctx.rootPath);
        if (pkg && hasAnyDep(pkg, ["langchain", "@langchain/core"])) {
          return { confidence: 0.88, evidence: ["package.json"] };
        }
        if (!(await pathExists(join(ctx.rootPath, "requirements.txt")))) {
          return null;
        }
        const { readFile } = await import("node:fs/promises");
        const text = await readFile(
          join(ctx.rootPath, "requirements.txt"),
          "utf8",
        );
        if (!/langchain|llama-index|llamaindex/i.test(text)) return null;
        return { confidence: 0.88, evidence: ["requirements.txt"] };
      },
    }),
    createManifestDetector({
      id: "data-eng-dbt",
      domains: [StackDomain.DATA_ENGINEERING],
      personaHints: [DeveloperPersona.DATA_ENGINEER],
      async match(ctx) {
        const evidence = await existingEvidence(ctx.rootPath, [
          "dbt_project.yml",
          "dbt_project.yaml",
        ]);
        if (evidence.length === 0) return null;
        return { confidence: 0.9, evidence };
      },
    }),
    createManifestDetector({
      id: "data-eng-airflow",
      domains: [StackDomain.DATA_ENGINEERING],
      personaHints: [DeveloperPersona.DATA_ENGINEER],
      async match(ctx) {
        const evidence = await existingEvidence(ctx.rootPath, [
          "airflow.cfg",
          "dags",
        ]);
        if (evidence.length === 0) return null;
        return { confidence: 0.8, evidence };
      },
    }),
  ];
}

function devopsDetectors(): StackDetector[] {
  return [
    createManifestDetector({
      id: "devops-docker",
      domains: [StackDomain.DEVOPS_PLATFORM],
      personaHints: [DeveloperPersona.DEVOPS_SRE],
      async match(ctx) {
        const evidence = await existingEvidence(ctx.rootPath, [
          "Dockerfile",
          "docker-compose.yml",
          "docker-compose.yaml",
          "compose.yml",
        ]);
        if (evidence.length === 0) return null;
        return { confidence: 0.85, evidence };
      },
    }),
    createManifestDetector({
      id: "devops-k8s",
      domains: [StackDomain.DEVOPS_PLATFORM],
      personaHints: [
        DeveloperPersona.DEVOPS_SRE,
        DeveloperPersona.PLATFORM_ENGINEER,
      ],
      async match(ctx) {
        const evidence = await existingEvidence(ctx.rootPath, [
          "k8s",
          "kubernetes",
          "helm",
          "Chart.yaml",
        ]);
        if (evidence.length === 0) return null;
        return { confidence: 0.8, evidence };
      },
    }),
    createManifestDetector({
      id: "devops-terraform",
      domains: [StackDomain.DEVOPS_PLATFORM],
      personaHints: [DeveloperPersona.DEVOPS_SRE],
      async match(ctx) {
        const tf = await findFilesWithExt(ctx.rootPath, ".tf", 2, 3);
        if (tf.length === 0) return null;
        return { confidence: 0.88, evidence: tf };
      },
    }),
    createManifestDetector({
      id: "devops-pulumi",
      domains: [StackDomain.DEVOPS_PLATFORM],
      personaHints: [DeveloperPersona.PLATFORM_ENGINEER],
      async match(ctx) {
        const evidence = await existingEvidence(ctx.rootPath, [
          "Pulumi.yaml",
          "Pulumi.yml",
        ]);
        if (evidence.length === 0) return null;
        return { confidence: 0.88, evidence };
      },
    }),
  ];
}

function nicheDetectors(): StackDetector[] {
  return [
    createManifestDetector({
      id: "embedded-platformio",
      domains: [StackDomain.EMBEDDED_SYSTEMS],
      personaHints: [DeveloperPersona.EMBEDDED_ENGINEER],
      async match(ctx) {
        const evidence = await existingEvidence(ctx.rootPath, [
          "platformio.ini",
        ]);
        if (evidence.length === 0) return null;
        return { confidence: 0.85, evidence };
      },
    }),
    createManifestDetector({
      id: "game-unity",
      domains: [StackDomain.GAME],
      personaHints: [DeveloperPersona.GAME_DEVELOPER],
      async match(ctx) {
        // Require the Unity project version file — a bare `Assets/` folder is
        // common in web apps and must not false-positive as Unity.
        const versionFile = "ProjectSettings/ProjectVersion.txt";
        if (!(await pathExists(join(ctx.rootPath, versionFile)))) return null;
        if (!(await pathExists(join(ctx.rootPath, "Assets")))) return null;
        return {
          confidence: 0.9,
          evidence: [versionFile, "Assets"],
        };
      },
    }),
  ];
}

/**
 * Default M-013 detector packs (local manifests / paths only).
 * Includes `unknown` + tooling through domain packs.
 */
export function createDefaultDetectorPacks(): StackDetector[] {
  return [
    createUnknownDetector(),
    ...toolingPmDetectors(),
    ...frontendDetectors(),
    ...backendDetectors(),
    ...mobileDesktopDetectors(),
    ...dataDetectors(),
    ...devopsDetectors(),
    ...nicheDetectors(),
  ];
}
