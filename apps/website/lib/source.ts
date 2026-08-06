import { docs, adminDocs } from "@/.source/server";
import { loader } from "fumadocs-core/source";
import { icons } from "lucide-react";
import { createElement } from "react";

function icon(name?: string) {
  if (!name) return undefined;
  const Icon = icons[name as keyof typeof icons];
  if (!Icon) return undefined;
  return createElement(Icon, { className: "size-4" });
}

export const source = loader({
  baseUrl: "/docs",
  source: docs.toFumadocsSource(),
  icon,
});

export const adminSource = loader({
  baseUrl: "/admin/docs",
  source: adminDocs.toFumadocsSource(),
  icon,
});
