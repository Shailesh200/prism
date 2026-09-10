# Compose drawer and Dispatch keyboard

New job and Queue job stay primary. The brief has a “Write prompt here”
placeholder, playbook helper text, and extra space above the agent row and
the prompt.

Playbooks include Review (PR, uncommitted, audit, or test), From a finding,
and the rest of the pack. From a finding filters this repo’s write-ups by
range and search before attaching one.

Drawers close on Esc, trap Tab, and treat Cmd/Ctrl+Enter as the primary
action. `/` still focuses the visible filter. j/k and Enter move Attention,
Findings, List, and job-list overlays without stealing Enter from a focused
button.
