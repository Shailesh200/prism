import * as RadixDropdown from "@radix-ui/react-dropdown-menu";
import { useRef, type ReactElement, type ReactNode } from "react";

export type DropdownMenuItem = {
  readonly id: string;
  readonly label: string;
  readonly icon?: ReactNode;
  readonly danger?: boolean;
  readonly tone?: "amber" | "brand";
  readonly onSelect: () => void;
};

export type DropdownMenuProps = {
  readonly trigger: ReactElement;
  readonly items: readonly DropdownMenuItem[];
  readonly align?: "start" | "center" | "end";
  readonly side?: "top" | "right" | "bottom" | "left";
  /** Defaults to false so more than one menu can stay open. */
  readonly modal?: boolean;
};

function DropdownMenuEntry(props: {
  readonly item: DropdownMenuItem;
}): ReactElement {
  const item = props.item;
  const last = useRef(0);
  const run = (): void => {
    const now = Date.now();
    if (now - last.current < 200) return;
    last.current = now;
    item.onSelect();
  };
  return (
    <RadixDropdown.Item
      className={[
        "prism-menu__item",
        item.danger ? "prism-menu__item--danger" : "",
        item.tone === "amber" ? "prism-menu__item--amber" : "",
        item.tone === "brand" ? "prism-menu__item--brand" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onPointerDown={(event) => {
        // modal={false} can close the portal before click/onSelect.
        if (event.button === 0) run();
      }}
      onSelect={() => run()}
    >
      {item.icon}
      {item.label}
    </RadixDropdown.Item>
  );
}

/**
 * Action menu on Prism tokens. Built on Radix Dropdown Menu with
 * `modal={false}` so List/Board action menus do not steal the page.
 */
export function DropdownMenu(props: DropdownMenuProps): ReactElement {
  return (
    <RadixDropdown.Root modal={props.modal ?? false}>
      <RadixDropdown.Trigger asChild>{props.trigger}</RadixDropdown.Trigger>
      <RadixDropdown.Portal>
        <RadixDropdown.Content
          className="prism-menu"
          align={props.align ?? "end"}
          side={props.side ?? "bottom"}
          sideOffset={6}
          collisionPadding={8}
        >
          {props.items.map((item) => (
            <DropdownMenuEntry key={item.id} item={item} />
          ))}
        </RadixDropdown.Content>
      </RadixDropdown.Portal>
    </RadixDropdown.Root>
  );
}
