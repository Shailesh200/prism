import * as RadixPopover from "@radix-ui/react-popover";
import type { ReactElement, ReactNode } from "react";

export type PopoverAlign = "start" | "center" | "end";
export type PopoverSide = "top" | "right" | "bottom" | "left";

export type PopoverProps = {
  readonly trigger: ReactElement;
  readonly children: ReactNode;
  readonly align?: PopoverAlign;
  readonly side?: PopoverSide;
  /**
   * When false (default), other Prism popovers and menus stay open.
   * Radix modal popovers would dismiss the rest of the overlay stack.
   */
  readonly modal?: boolean;
  readonly className?: string;
  readonly contentClassName?: string;
};

/**
 * Overlay panel on Prism tokens. `modal` defaults to false so several
 * popovers can stay open at once (job actions, tile menus, range).
 */
export function Popover(props: PopoverProps): ReactElement {
  const classes = ["prism-popover", props.contentClassName]
    .filter(Boolean)
    .join(" ");
  return (
    <RadixPopover.Root modal={props.modal ?? false}>
      <RadixPopover.Trigger asChild>{props.trigger}</RadixPopover.Trigger>
      <RadixPopover.Portal>
        <RadixPopover.Content
          className={classes}
          align={props.align ?? "end"}
          side={props.side ?? "bottom"}
          sideOffset={6}
          collisionPadding={8}
        >
          {props.children}
        </RadixPopover.Content>
      </RadixPopover.Portal>
    </RadixPopover.Root>
  );
}
