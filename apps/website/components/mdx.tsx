import defaultMdxComponents from "fumadocs-ui/mdx";
import { Tab, Tabs } from "fumadocs-ui/components/tabs";
import { Step, Steps } from "fumadocs-ui/components/steps";
import { Card, Cards } from "fumadocs-ui/components/card";
import type { MDXComponents } from "mdx/types";
import type { ComponentPropsWithoutRef, ComponentType } from "react";
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

function PulseAnchor(props: ComponentPropsWithoutRef<"a">) {
  const attrs = installLinkAttrs(
    typeof props.href === "string" ? props.href : undefined,
  );
  return <a {...props} {...attrs} />;
}

export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...defaultMdxComponents,
    a: PulseAnchor,
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
