import React from "react";

export function Badge(props: { label: string }): JSX.Element {
  return <span>{props.label}</span>;
}

export default function Page(): JSX.Element {
  return <Badge label="ok" />;
}
