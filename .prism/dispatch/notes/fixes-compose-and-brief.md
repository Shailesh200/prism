# Compose polish, playbooks, and in-place brief edits

New Job and Queue job use the primary (brand) button. Compose now spaces the playbook block away from Agent/Model, and the brief away from Placement. The brief textarea placeholder is **Write prompt here**. Playbook has helper text; Review is a general audit (PR, uncommitted, or test), and From a finding lists that repo’s write-ups so their text is attached to the queued PRD.

Drawers close with Esc and run the primary action with ⌘↵ / Ctrl+Enter. Selects, toggle groups, and job-table rows are keyboard operable. Focus / the job inspector can edit the stored brief in place (`PATCH /api/jobs/:id`) and save with the same keys.
