import defaultMdxComponents from "fumadocs-ui/mdx";
import { Tab, Tabs } from "fumadocs-ui/components/tabs";
import { Step, Steps } from "fumadocs-ui/components/steps";
import { Cards } from "fumadocs-ui/components/card";
import Link from "fumadocs-core/link";
import type { MDXComponents } from "mdx/types";
import type { ComponentPropsWithoutRef, ComponentType, ReactNode } from "react";
import { Callout } from "@/components/ui/callout";
import { Table } from "@/components/ui/table";
import { installLinkAttrs } from "@/lib/pulse";

export function withPulseAnchors(
  Anchor: ComponentType<ComponentPropsWithoutRef<"a">>,
) {
  return function PulseWrappedAnchor(props: ComponentPropsWithoutRef<"a">) {
    const attrs = installLinkAttrs(
      typeof props.href === "string" ? props.href : undefined,
    );
    return <Anchor {...props} {...attrs} />;
  };
}

/**
 * fumadocs' Card with the title as text, not an h3: on the docs intro the
 * cards come before the first h2, so an h3 there breaks the heading order.
 */
function Card({
  title,
  description,
  href,
  children,
}: {
  title: string;
  description?: string;
  href?: string;
  children?: ReactNode;
}) {
  const body = (
    <>
      <span className="docs-card-t">{title}</span>
      {description ? (
        <p className="my-0! text-sm text-fd-muted-foreground">{description}</p>
      ) : null}
      {children ? (
        <div className="prose-no-margin text-sm text-fd-muted-foreground">
          {children}
        </div>
      ) : null}
    </>
  );
  const className =
    "block rounded-xl border bg-fd-card p-4 text-fd-card-foreground transition-colors @max-lg:col-span-full";
  return href ? (
    <Link
      href={href}
      data-card
      className={`${className} hover:bg-fd-accent/80`}
    >
      {body}
    </Link>
  ) : (
    <div data-card className={className}>
      {body}
    </div>
  );
}

function PulseAnchor(props: ComponentPropsWithoutRef<"a">) {
  const attrs = installLinkAttrs(
    typeof props.href === "string" ? props.href : undefined,
  );
  return <a {...props} {...attrs} />;
}

export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...defaultMdxComponents,
    // The page title is the h1; a "# " heading in the file sits under it.
    h1: defaultMdxComponents.h2,
    a: PulseAnchor,
    table: Table,
    Callout,
    Tabs,
    Tab,
    Steps,
    Step,
    Card,
    Cards,
    ...components,
  };
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
