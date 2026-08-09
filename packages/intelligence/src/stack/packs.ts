import { join } from "node:path";
import { DeveloperPersona, StackDomain } from "@repo-prism/shared";
import { createUnknownDetector } from "../detectors.js";
import type { StackDetector } from "../types.js";
import {
  createManifestDetector,
  existingEvidence,
  filterNoiseEvidence,
  findFilesNamed,
  findFilesWithExt,
  findPathConventionHits,
  hasDevDep,
  hasProdDep,
  pathExists,
  readPackageJson,
  requirementsMentions,
  scoreMultiSignal,
} from "./manifest.js";

async function hasJsxPath(rootPath: string): Promise<string[]> {
  const tsx = filterNoiseEvidence(
    await findFilesWithExt(rootPath, ".tsx", 3, 3),
  );
  if (tsx.length > 0) return tsx;
  return filterNoiseEvidence(await findFilesWithExt(rootPath, ".jsx", 3, 3));
}

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
        return scoreMultiSignal({ ecosystemRoot: true, evidence });
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
        return scoreMultiSignal({ ecosystemRoot: true, evidence });
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
        return scoreMultiSignal({ ecosystemRoot: true, evidence });
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
        return scoreMultiSignal({ ecosystemRoot: true, evidence });
      },
    }),
    createManifestDetector({
      id: "nodejs-manifest",
      domains: [StackDomain.TOOLING],
      personaHints: [],
      async match(ctx) {
        const evidence = await existingEvidence(ctx.rootPath, ["package.json"]);
        if (evidence.length === 0) return null;
        // Weak marker only — stays below threshold unless combined elsewhere.
        return scoreMultiSignal({ config: true, evidence });
      },
    }),
    createManifestDetector({
      id: "mono-turbo",
      domains: [StackDomain.TOOLING],
      personaHints: [DeveloperPersona.PLATFORM_ENGINEER],
      async match(ctx) {
        const evidence = await existingEvidence(ctx.rootPath, ["turbo.json"]);
        const pkg = await readPackageJson(ctx.rootPath);
        const toolingDep =
          pkg !== null &&
          (hasDevDep(pkg, ["turbo"]) || hasProdDep(pkg, ["turbo"]));
        if (evidence.length === 0 && !toolingDep) return null;
        return scoreMultiSignal({
          toolingDep,
          config: evidence.length > 0,
          evidence: evidence.length > 0 ? evidence : ["package.json"],
        });
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
        const toolingDep =
          pkg !== null &&
          (hasDevDep(pkg, ["nx", "@nx/devkit"]) ||
            hasProdDep(pkg, ["nx", "@nx/devkit"]));
        if (evidence.length === 0 && !toolingDep) return null;
        return scoreMultiSignal({
          toolingDep,
          config: evidence.length > 0,
          evidence: evidence.length > 0 ? evidence : ["package.json"],
        });
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
        return scoreMultiSignal({ ecosystemRoot: true, evidence });
      },
    }),
    createManifestDetector({
      id: "test-vitest",
      domains: [StackDomain.TOOLING],
      personaHints: [DeveloperPersona.QA_ENGINEER],
      async match(ctx) {
        const pkg = await readPackageJson(ctx.rootPath);
        if (!pkg) return null;
        const toolingDep =
          hasDevDep(pkg, ["vitest"]) || hasProdDep(pkg, ["vitest"]);
        if (!toolingDep) return null;
        const config = (
          await existingEvidence(ctx.rootPath, [
            "vitest.config.ts",
            "vitest.config.js",
            "vitest.config.mts",
          ])
        ).length;
        const pathHits = filterNoiseEvidence(
          await findFilesWithExt(ctx.rootPath, ".test.ts", 3, 2),
        );
        // package.json declaring the runner counts as the config channel for tooling.
        return scoreMultiSignal({
          toolingDep: true,
          config: true,
          path: pathHits.length > 0 || config > 0,
          evidence: ["package.json", ...pathHits.slice(0, 1)],
        });
      },
    }),
    createManifestDetector({
      id: "test-jest",
      domains: [StackDomain.TOOLING],
      personaHints: [DeveloperPersona.QA_ENGINEER],
      async match(ctx) {
        const pkg = await readPackageJson(ctx.rootPath);
        if (!pkg) return null;
        const toolingDep =
          hasDevDep(pkg, ["jest", "@jest/core"]) ||
          hasProdDep(pkg, ["jest", "@jest/core"]);
        if (!toolingDep) return null;
        const configFiles = (
          await existingEvidence(ctx.rootPath, [
            "jest.config.js",
            "jest.config.ts",
            "jest.config.mjs",
          ])
        ).length;
        const pathHits = filterNoiseEvidence(
          await findFilesWithExt(ctx.rootPath, ".test.js", 3, 2),
        );
        return scoreMultiSignal({
          toolingDep: true,
          config: true,
          path: pathHits.length > 0 || configFiles > 0,
          evidence: ["package.json"],
        });
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
        const inReq = await requirementsMentions(ctx.rootPath, /pytest/i);
        if (!inReq && !evidence.includes("pytest.ini")) return null;
        return scoreMultiSignal({
          prodDep: inReq,
          config: evidence.includes("pytest.ini"),
          evidence: inReq
            ? ["requirements.txt"]
            : evidence.includes("pytest.ini")
              ? ["pytest.ini"]
              : evidence,
        });
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
        if (!pkg) return null;
        const names = ["react", "react-dom"] as const;
        const prodDep = hasProdDep(pkg, names);
        const devDepOnly = !prodDep && hasDevDep(pkg, names);
        if (!prodDep && !devDepOnly) return null;
        const jsx = await hasJsxPath(ctx.rootPath);
        return scoreMultiSignal({
          prodDep,
          devDepOnly,
          path: jsx.length > 0,
          evidence:
            prodDep || devDepOnly ? ["package.json", ...jsx.slice(0, 1)] : jsx,
        });
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
        // Monorepos often keep next.config under apps/* — shallow search.
        const nestedConfig =
          evidence.length === 0
            ? (
                await Promise.all([
                  findFilesNamed(ctx.rootPath, "next.config.js", 3, 2),
                  findFilesNamed(ctx.rootPath, "next.config.mjs", 3, 2),
                  findFilesNamed(ctx.rootPath, "next.config.ts", 3, 2),
                ])
              ).flat()
            : [];
        const configs = evidence.length > 0 ? evidence : nestedConfig;
        const prodDep = pkg !== null && hasProdDep(pkg, ["next"]);
        const devDepOnly = pkg !== null && !prodDep && hasDevDep(pkg, ["next"]);
        const pathHits = [
          ...(await existingEvidence(ctx.rootPath, [
            "app",
            "pages",
            "src/app",
            "src/pages",
          ])),
          ...(await findPathConventionHits(ctx.rootPath, ["app", "pages"])),
        ];
        if (!prodDep && !devDepOnly && configs.length === 0) return null;
        return scoreMultiSignal({
          prodDep,
          devDepOnly,
          config: configs.length > 0,
          path: pathHits.length > 0,
          evidence: [
            ...configs.slice(0, 2),
            ...(pkg ? ["package.json"] : []),
            ...pathHits.slice(0, 1),
          ],
        });
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
        const prodDep = pkg !== null && hasProdDep(pkg, ["vite"]);
        const toolingDep = pkg !== null && !prodDep && hasDevDep(pkg, ["vite"]);
        if (!prodDep && !toolingDep && evidence.length === 0) return null;
        // Vite is typically a devDependency — treat as tooling dep channel.
        // Declaring vite without a config file is not enough to claim a Vite app.
        return scoreMultiSignal({
          toolingDep: prodDep || toolingDep,
          config: evidence.length > 0,
          evidence: evidence.length > 0 ? evidence : ["package.json"],
        });
      },
    }),
    createManifestDetector({
      id: "frontend-vue",
      domains: [StackDomain.FRONTEND],
      personaHints: [DeveloperPersona.FRONTEND_ENGINEER],
      async match(ctx) {
        const pkg = await readPackageJson(ctx.rootPath);
        if (!pkg) return null;
        const names = ["vue", "nuxt"] as const;
        const prodDep = hasProdDep(pkg, names);
        const devDepOnly = !prodDep && hasDevDep(pkg, names);
        if (!prodDep && !devDepOnly) return null;
        const vueFiles = filterNoiseEvidence(
          await findFilesWithExt(ctx.rootPath, ".vue", 3, 2),
        );
        return scoreMultiSignal({
          prodDep,
          devDepOnly,
          path: vueFiles.length > 0,
          evidence: ["package.json", ...vueFiles.slice(0, 1)],
        });
      },
    }),
    createManifestDetector({
      id: "frontend-svelte",
      domains: [StackDomain.FRONTEND],
      personaHints: [DeveloperPersona.FRONTEND_ENGINEER],
      async match(ctx) {
        const pkg = await readPackageJson(ctx.rootPath);
        if (!pkg) return null;
        const names = ["svelte", "@sveltejs/kit"] as const;
        const prodDep = hasProdDep(pkg, names);
        const devDepOnly = !prodDep && hasDevDep(pkg, names);
        if (!prodDep && !devDepOnly) return null;
        const files = filterNoiseEvidence(
          await findFilesWithExt(ctx.rootPath, ".svelte", 3, 2),
        );
        return scoreMultiSignal({
          prodDep,
          devDepOnly,
          path: files.length > 0,
          evidence: ["package.json", ...files.slice(0, 1)],
        });
      },
    }),
    createManifestDetector({
      id: "frontend-angular",
      domains: [StackDomain.FRONTEND],
      personaHints: [DeveloperPersona.FRONTEND_ENGINEER],
      async match(ctx) {
        const pkg = await readPackageJson(ctx.rootPath);
        if (!pkg) return null;
        const prodDep = hasProdDep(pkg, ["@angular/core"]);
        const devDepOnly = !prodDep && hasDevDep(pkg, ["@angular/core"]);
        if (!prodDep && !devDepOnly) return null;
        const config = await existingEvidence(ctx.rootPath, ["angular.json"]);
        return scoreMultiSignal({
          prodDep,
          devDepOnly,
          config: config.length > 0,
          evidence: ["package.json", ...config],
        });
      },
    }),
    createManifestDetector({
      id: "frontend-astro",
      domains: [StackDomain.FRONTEND],
      personaHints: [DeveloperPersona.FRONTEND_ENGINEER],
      async match(ctx) {
        const pkg = await readPackageJson(ctx.rootPath);
        if (!pkg) return null;
        const prodDep = hasProdDep(pkg, ["astro"]);
        const devDepOnly = !prodDep && hasDevDep(pkg, ["astro"]);
        if (!prodDep && !devDepOnly) return null;
        const config = await existingEvidence(ctx.rootPath, [
          "astro.config.mjs",
          "astro.config.ts",
          "astro.config.js",
        ]);
        return scoreMultiSignal({
          prodDep,
          devDepOnly,
          config: config.length > 0,
          evidence: ["package.json", ...config],
        });
      },
    }),
    createManifestDetector({
      id: "frontend-remix",
      domains: [StackDomain.FRONTEND],
      personaHints: [DeveloperPersona.FRONTEND_ENGINEER],
      async match(ctx) {
        const pkg = await readPackageJson(ctx.rootPath);
        if (!pkg) return null;
        const names = ["@remix-run/react", "@remix-run/node"] as const;
        const prodDep = hasProdDep(pkg, names);
        const devDepOnly = !prodDep && hasDevDep(pkg, names);
        if (!prodDep && !devDepOnly) return null;
        const pathHits = await existingEvidence(ctx.rootPath, [
          "app/routes",
          "app/root.tsx",
        ]);
        return scoreMultiSignal({
          prodDep,
          devDepOnly,
          path: pathHits.length > 0,
          evidence: ["package.json", ...pathHits.slice(0, 1)],
        });
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
        if (!pkg) return null;
        const prodDep = hasProdDep(pkg, ["express"]);
        const devDepOnly = !prodDep && hasDevDep(pkg, ["express"]);
        if (!prodDep && !devDepOnly) return null;
        const pathHits = await findPathConventionHits(ctx.rootPath, [
          "routes",
          "controllers",
          "api",
        ]);
        const entry = await existingEvidence(ctx.rootPath, [
          "main.ts",
          "server.ts",
          "app.ts",
          "src/main.ts",
          "src/server.ts",
          "src/app.ts",
        ]);
        return scoreMultiSignal({
          prodDep,
          devDepOnly,
          config: entry.length > 0,
          path: pathHits.length > 0,
          evidence: [
            "package.json",
            ...entry.slice(0, 1),
            ...pathHits.slice(0, 1),
          ],
        });
      },
    }),
    createManifestDetector({
      id: "backend-fastify",
      domains: [StackDomain.BACKEND],
      personaHints: [DeveloperPersona.BACKEND_ENGINEER],
      async match(ctx) {
        const pkg = await readPackageJson(ctx.rootPath);
        if (!pkg) return null;
        const prodDep = hasProdDep(pkg, ["fastify"]);
        const devDepOnly = !prodDep && hasDevDep(pkg, ["fastify"]);
        if (!prodDep && !devDepOnly) return null;
        const pathHits = await findPathConventionHits(ctx.rootPath, [
          "routes",
          "plugins",
        ]);
        const entry = await existingEvidence(ctx.rootPath, [
          "main.ts",
          "server.ts",
          "app.ts",
          "src/main.ts",
          "src/server.ts",
        ]);
        return scoreMultiSignal({
          prodDep,
          devDepOnly,
          config: entry.length > 0,
          path: pathHits.length > 0,
          evidence: [
            "package.json",
            ...entry.slice(0, 1),
            ...pathHits.slice(0, 1),
          ],
        });
      },
    }),
    createManifestDetector({
      id: "backend-nest",
      domains: [StackDomain.BACKEND],
      personaHints: [DeveloperPersona.BACKEND_ENGINEER],
      async match(ctx) {
        const pkg = await readPackageJson(ctx.rootPath);
        if (!pkg) return null;
        const names = ["@nestjs/core", "@nestjs/common"] as const;
        const prodDep = hasProdDep(pkg, names);
        const devDepOnly = !prodDep && hasDevDep(pkg, names);
        if (!prodDep && !devDepOnly) return null;
        const config = await existingEvidence(ctx.rootPath, [
          "nest-cli.json",
          "main.ts",
          "src/main.ts",
        ]);
        const pathHits = filterNoiseEvidence(
          await findFilesWithExt(ctx.rootPath, ".controller.ts", 3, 2),
        );
        return scoreMultiSignal({
          prodDep,
          devDepOnly,
          config: config.length > 0,
          path: pathHits.length > 0,
          evidence: [
            "package.json",
            ...config.slice(0, 1),
            ...pathHits.slice(0, 1),
          ],
        });
      },
    }),
    createManifestDetector({
      id: "backend-go",
      domains: [StackDomain.BACKEND],
      personaHints: [DeveloperPersona.BACKEND_ENGINEER],
      async match(ctx) {
        const evidence = await existingEvidence(ctx.rootPath, ["go.mod"]);
        if (evidence.length === 0) return null;
        const goFiles = filterNoiseEvidence(
          await findFilesWithExt(ctx.rootPath, ".go", 2, 2),
        );
        return scoreMultiSignal({
          ecosystemRoot: true,
          path: goFiles.length > 0,
          evidence: [...evidence, ...goFiles.slice(0, 1)],
        });
      },
    }),
    createManifestDetector({
      id: "backend-python-django",
      domains: [StackDomain.BACKEND],
      personaHints: [DeveloperPersona.BACKEND_ENGINEER],
      async match(ctx) {
        const manage = await existingEvidence(ctx.rootPath, ["manage.py"]);
        const inReq = await requirementsMentions(ctx.rootPath, /django/i);
        const settings = await findPathConventionHits(ctx.rootPath, [
          "settings.py",
        ]);
        // Bare manage.py is not enough (negative fixture).
        if (!inReq && settings.length === 0) return null;
        return scoreMultiSignal({
          prodDep: inReq,
          config: manage.length > 0,
          path: settings.length > 0,
          evidence: [
            ...(inReq ? ["requirements.txt"] : []),
            ...manage,
            ...settings.slice(0, 1),
          ],
        });
      },
    }),
    createManifestDetector({
      id: "backend-python-fastapi",
      domains: [StackDomain.BACKEND],
      personaHints: [DeveloperPersona.BACKEND_ENGINEER],
      async match(ctx) {
        const inReq = await requirementsMentions(ctx.rootPath, /fastapi/i);
        if (!inReq) return null;
        const py = filterNoiseEvidence(
          await findFilesWithExt(ctx.rootPath, ".py", 2, 2),
        );
        return scoreMultiSignal({
          prodDep: true,
          config: true, // requirements.txt is the config channel for the pin
          path: py.length > 0,
          evidence: ["requirements.txt", ...py.slice(0, 1)],
        });
      },
    }),
    createManifestDetector({
      id: "backend-python-flask",
      domains: [StackDomain.BACKEND],
      personaHints: [DeveloperPersona.BACKEND_ENGINEER],
      async match(ctx) {
        const inReq = await requirementsMentions(ctx.rootPath, /flask/i);
        if (!inReq) return null;
        const py = filterNoiseEvidence(
          await findFilesWithExt(ctx.rootPath, ".py", 2, 2),
        );
        return scoreMultiSignal({
          prodDep: true,
          config: true,
          path: py.length > 0,
          evidence: ["requirements.txt", ...py.slice(0, 1)],
        });
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
        return scoreMultiSignal({
          ecosystemRoot: true,
          evidence,
        });
      },
    }),
    createManifestDetector({
      id: "backend-dotnet",
      domains: [StackDomain.BACKEND],
      personaHints: [DeveloperPersona.BACKEND_ENGINEER],
      async match(ctx) {
        const csproj = filterNoiseEvidence(
          await findFilesWithExt(ctx.rootPath, ".csproj", 2, 3),
        );
        if (csproj.length === 0) return null;
        return scoreMultiSignal({ ecosystemRoot: true, evidence: csproj });
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
        return scoreMultiSignal({
          ecosystemRoot: true,
          config: evidence.includes("config/application.rb"),
          evidence,
        });
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
        if (!pkg) return null;
        const prodDep = hasProdDep(pkg, ["react-native"]);
        const devDepOnly = !prodDep && hasDevDep(pkg, ["react-native"]);
        if (!prodDep && !devDepOnly) return null;
        const pathHits = await existingEvidence(ctx.rootPath, [
          "android",
          "ios",
          "App.tsx",
          "app.json",
        ]);
        return scoreMultiSignal({
          prodDep,
          devDepOnly,
          path: pathHits.length > 0,
          config: pathHits.includes("app.json"),
          evidence: ["package.json", ...pathHits.slice(0, 1)],
        });
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
        const prodDep = pkg !== null && hasProdDep(pkg, ["expo"]);
        const devDepOnly = pkg !== null && !prodDep && hasDevDep(pkg, ["expo"]);
        if (!prodDep && !devDepOnly) return null;
        return scoreMultiSignal({
          prodDep,
          devDepOnly,
          config: evidence.length > 0,
          evidence:
            evidence.length > 0
              ? [...evidence, "package.json"]
              : ["package.json"],
        });
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
        return scoreMultiSignal({ ecosystemRoot: true, evidence });
      },
    }),
    createManifestDetector({
      id: "desktop-electron",
      domains: [StackDomain.DESKTOP],
      personaHints: [DeveloperPersona.DESKTOP_ENGINEER],
      async match(ctx) {
        const pkg = await readPackageJson(ctx.rootPath);
        if (!pkg) return null;
        const prodDep = hasProdDep(pkg, ["electron"]);
        const toolingDep = !prodDep && hasDevDep(pkg, ["electron"]);
        if (!prodDep && !toolingDep) return null;
        const pathHits = await existingEvidence(ctx.rootPath, [
          "electron",
          "src/main",
        ]);
        return scoreMultiSignal({
          // Electron is often a devDependency of the app package.
          toolingDep: prodDep || toolingDep,
          path: pathHits.length > 0,
          evidence: ["package.json", ...pathHits.slice(0, 1)],
        });
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
        const prodDep =
          pkg !== null &&
          hasProdDep(pkg, ["@tauri-apps/api", "@tauri-apps/cli"]);
        const toolingDep =
          pkg !== null &&
          !prodDep &&
          hasDevDep(pkg, ["@tauri-apps/api", "@tauri-apps/cli"]);
        if (evidence.length === 0 && !prodDep && !toolingDep) return null;
        return scoreMultiSignal({
          toolingDep: prodDep || toolingDep,
          config: evidence.length > 0,
          ecosystemRoot: evidence.length > 0,
          evidence: evidence.length > 0 ? evidence : ["package.json"],
        });
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
        const notebooks = filterNoiseEvidence(
          await findFilesWithExt(ctx.rootPath, ".ipynb", 3, 5),
        );
        const pkg = await readPackageJson(ctx.rootPath);
        const prodDep =
          pkg !== null &&
          hasProdDep(pkg, ["jupyter", "notebook", "jupyterlab"]);
        const inReq = await requirementsMentions(
          ctx.rootPath,
          /jupyter|notebook|jupyterlab/i,
        );
        // A lone sample notebook is not enough (negative fixture).
        if (notebooks.length === 0 && !prodDep && !inReq) return null;
        if (!prodDep && !inReq && notebooks.length > 0) {
          return scoreMultiSignal({
            path: true,
            evidence: notebooks,
          });
        }
        return scoreMultiSignal({
          prodDep: prodDep || inReq,
          config: inReq,
          path: notebooks.length > 0,
          evidence:
            notebooks.length > 0
              ? notebooks
              : inReq
                ? ["requirements.txt"]
                : ["package.json"],
        });
      },
    }),
    createManifestDetector({
      id: "data-pytorch",
      domains: [StackDomain.DATA_ML_AI],
      personaHints: [DeveloperPersona.ML_ENGINEER],
      async match(ctx) {
        const inReq = await requirementsMentions(ctx.rootPath, /torch/i);
        if (!inReq) return null;
        const py = filterNoiseEvidence(
          await findFilesWithExt(ctx.rootPath, ".py", 2, 2),
        );
        const notebooks = filterNoiseEvidence(
          await findFilesWithExt(ctx.rootPath, ".ipynb", 3, 2),
        );
        return scoreMultiSignal({
          prodDep: true,
          config: true,
          path: py.length > 0 || notebooks.length > 0,
          evidence: [
            "requirements.txt",
            ...notebooks.slice(0, 1),
            ...py.slice(0, 1),
          ],
        });
      },
    }),
    createManifestDetector({
      id: "data-tensorflow",
      domains: [StackDomain.DATA_ML_AI],
      personaHints: [DeveloperPersona.ML_ENGINEER],
      async match(ctx) {
        const inReq = await requirementsMentions(ctx.rootPath, /tensorflow/i);
        if (!inReq) return null;
        return scoreMultiSignal({
          prodDep: true,
          config: true,
          evidence: ["requirements.txt"],
        });
      },
    }),
    createManifestDetector({
      id: "data-langchain",
      domains: [StackDomain.DATA_ML_AI],
      personaHints: [DeveloperPersona.AI_ENGINEER],
      async match(ctx) {
        const pkg = await readPackageJson(ctx.rootPath);
        const prodDep =
          pkg !== null && hasProdDep(pkg, ["langchain", "@langchain/core"]);
        const inReq = await requirementsMentions(
          ctx.rootPath,
          /langchain|llama-index|llamaindex/i,
        );
        if (!prodDep && !inReq) return null;
        return scoreMultiSignal({
          prodDep: prodDep || inReq,
          config: inReq,
          evidence: inReq ? ["requirements.txt"] : ["package.json"],
        });
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
        return scoreMultiSignal({ ecosystemRoot: true, evidence });
      },
    }),
    createManifestDetector({
      id: "data-eng-airflow",
      domains: [StackDomain.DATA_ENGINEERING],
      personaHints: [DeveloperPersona.DATA_ENGINEER],
      async match(ctx) {
        const evidence = filterNoiseEvidence(
          await existingEvidence(ctx.rootPath, ["airflow.cfg", "dags"]),
        );
        const pathHits = await findPathConventionHits(ctx.rootPath, ["dags"]);
        if (evidence.length === 0 && pathHits.length === 0) return null;
        return scoreMultiSignal({
          ecosystemRoot: evidence.includes("airflow.cfg"),
          path: pathHits.length > 0 || evidence.includes("dags"),
          evidence: evidence.length > 0 ? evidence : pathHits,
        });
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
        const evidence = filterNoiseEvidence(
          await existingEvidence(ctx.rootPath, [
            "Dockerfile",
            "docker-compose.yml",
            "docker-compose.yaml",
            "compose.yml",
          ]),
        );
        if (evidence.length === 0) return null;
        return scoreMultiSignal({ ecosystemRoot: true, evidence });
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
        // Path hits exclude docs/examples (negative: docs/k8s).
        const pathHits = await findPathConventionHits(ctx.rootPath, [
          "k8s",
          "kubernetes",
          "helm",
        ]);
        const chart = filterNoiseEvidence(
          await existingEvidence(ctx.rootPath, ["Chart.yaml"]),
        );
        if (pathHits.length === 0 && chart.length === 0) return null;
        return scoreMultiSignal({
          ecosystemRoot: chart.length > 0,
          path: pathHits.length > 0,
          config: chart.length > 0,
          evidence: [...chart, ...pathHits.slice(0, 1)],
        });
      },
    }),
    createManifestDetector({
      id: "devops-terraform",
      domains: [StackDomain.DEVOPS_PLATFORM],
      personaHints: [DeveloperPersona.DEVOPS_SRE],
      async match(ctx) {
        const tf = filterNoiseEvidence(
          await findFilesWithExt(ctx.rootPath, ".tf", 2, 3),
        );
        if (tf.length === 0) return null;
        return scoreMultiSignal({
          ecosystemRoot: true,
          evidence: tf,
        });
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
        return scoreMultiSignal({ ecosystemRoot: true, evidence });
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
        return scoreMultiSignal({ ecosystemRoot: true, evidence });
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
        return scoreMultiSignal({
          ecosystemRoot: true,
          path: true,
          evidence: [versionFile, "Assets"],
        });
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
