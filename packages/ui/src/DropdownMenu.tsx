import * as RadixDropdown from "@radix-ui/react-dropdown-menu";
import type { ReactElement, ReactNode } from "react";

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
            <RadixDropdown.Item
              key={item.id}
              className={[
                "prism-menu__item",
                item.danger ? "prism-menu__item--danger" : "",
                item.tone === "amber" ? "prism-menu__item--amber" : "",
                item.tone === "brand" ? "prism-menu__item--brand" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onSelect={() => item.onSelect()}
            >
              {item.icon}
              {item.label}
            </RadixDropdown.Item>
          ))}
        </RadixDropdown.Content>
      </RadixDropdown.Portal>
    </RadixDropdown.Root>
  );
}
