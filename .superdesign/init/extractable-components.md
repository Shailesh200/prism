# Extractable components

## Drawer
- Source: `packages/ui/src/Drawer.tsx`
- Category: layout
- Description: Right-side overlay with title, close, scroll body, optional footer
- Extractable props: title (string), size (md|lg, default lg)
- Hardcoded: Close icon, Esc/⌘↵ behavior, scrim, CSS classes

## AttentionCard
- Source: `packages/dispatch-hub/src/dashboard/console-app.tsx`
- Category: layout
- Description: Inbox card for gated/stalled jobs
- Extractable props: title, statusLabel, question, gated (boolean)
- Hardcoded: Start anyway / Cancel / Open job labels

Skip Button/Badge/Textarea — too primitive; inline in drafts.
