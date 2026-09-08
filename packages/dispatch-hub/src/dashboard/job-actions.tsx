import {
  canRetryJob,
  canRetryVerification,
  isLiveJob,
  jobNotePaths,
  jobReviewPending,
  type JobSummary,
} from "@repo-prism/app-shell";
import {
  DropdownMenu,
  HoverTip,
  IconButton,
  type ButtonVariant,
  type DropdownMenuItem,
} from "@repo-prism/ui";
import {
  Check,
  CopyPlus,
  Eye,
  FileText,
  FolderMinus,
  Link2,
  Loader2,
  MessageSquarePlus,
  MoreVertical,
  Pause,
  Play,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import { type ReactElement } from "react";
import { canInstructJob, canStartFromJob, jobChecksRunning } from "./fleet.js";
import { showConsoleToast } from "./console-toast.js";
import { consoleJobShareUrl, readToken } from "./session.js";

function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text).catch(() => copyViaExec(text));
  }
  return copyViaExec(text);
}

function copyViaExec(text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const field = document.createElement("textarea");
    field.value = text;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.left = "-9999px";
    document.body.appendChild(field);
    field.select();
    try {
      if (!document.execCommand("copy")) reject(new Error("copy failed"));
      else resolve();
    } catch (cause) {
      reject(cause instanceof Error ? cause : new Error(String(cause)));
    } finally {
      field.remove();
    }
  });
}

function copyJobLink(job: JobSummary): void {
  const url = consoleJobShareUrl(job, readToken(), window.location.href);
  copyText(url).then(
    () => showConsoleToast("Copied job link."),
    () => showConsoleToast("Could not copy the link.", "error"),
  );
}

export type FleetPendingControl = {
  readonly jobId: string;
  readonly action: "retry" | "reverify";
};

export type JobActionHandlers = {
  readonly onOpenFinding?: (job: JobSummary) => void;
  readonly onPause?: (job: JobSummary) => void;
  readonly onCancel?: (job: JobSummary) => void;
  readonly onConfirm?: (job: JobSummary) => void;
  readonly onResume?: (job: JobSummary) => void;
  readonly onKeepAll?: (job: JobSummary) => void;
  readonly onRetry?: (job: JobSummary) => void;
  readonly onReverify?: (job: JobSummary) => void;
  readonly onDelete?: (job: JobSummary) => void;
  readonly onStartFromJob?: (job: JobSummary) => void;
  readonly onAddInstruction?: (job: JobSummary) => void;
  readonly pending?: FleetPendingControl;
};

export function jobActionHandlers(props: JobActionHandlers): JobActionHandlers {
  return {
    ...(props.onOpenFinding ? { onOpenFinding: props.onOpenFinding } : {}),
    ...(props.onPause ? { onPause: props.onPause } : {}),
    ...(props.onCancel ? { onCancel: props.onCancel } : {}),
    ...(props.onConfirm ? { onConfirm: props.onConfirm } : {}),
    ...(props.onResume ? { onResume: props.onResume } : {}),
    ...(props.onKeepAll ? { onKeepAll: props.onKeepAll } : {}),
    ...(props.onRetry ? { onRetry: props.onRetry } : {}),
    ...(props.onReverify ? { onReverify: props.onReverify } : {}),
    ...(props.onDelete ? { onDelete: props.onDelete } : {}),
    ...(props.onStartFromJob ? { onStartFromJob: props.onStartFromJob } : {}),
    ...(props.onAddInstruction
      ? { onAddInstruction: props.onAddInstruction }
      : {}),
    ...(props.pending ? { pending: props.pending } : {}),
  };
}

function retryGlyph(spinning: boolean, size = 14): ReactElement {
  return spinning ? (
    <Loader2 size={size} className="fleet-spin" aria-hidden />
  ) : (
    <RotateCcw size={size} aria-hidden />
  );
}

export type JobActionsProps = {
  readonly job?: JobSummary;
  readonly reverifyJob?: JobSummary;
  readonly onOpenJob?: (job: JobSummary) => void;
  readonly onOpenFinding?: (job: JobSummary) => void;
  readonly onPause?: (job: JobSummary) => void;
  readonly onCancel?: (job: JobSummary) => void;
  readonly onConfirm?: (job: JobSummary) => void;
  readonly onResume?: (job: JobSummary) => void;
  readonly onKeepAll?: (job: JobSummary) => void;
  readonly onRetry?: (job: JobSummary) => void;
  readonly onReverify?: (job: JobSummary) => void;
  readonly onDelete?: (job: JobSummary) => void;
  readonly onStartFromJob?: (job: JobSummary) => void;
  readonly onAddInstruction?: (job: JobSummary) => void;
  readonly onRemoveRepo?: () => void;
  readonly pending?: FleetPendingControl;
};

export function jobActionItems(
  props: JobActionsProps,
): readonly DropdownMenuItem[] {
  const job = props.job;
  const notes = job ? jobNotePaths(job) : [];
  const checkJob = props.reverifyJob ?? job;
  const retrying =
    Boolean(job) &&
    props.pending?.jobId === job?.id &&
    props.pending.action === "retry";
  const reverifying =
    Boolean(checkJob) &&
    (jobChecksRunning(checkJob) ||
      (props.pending?.jobId === checkJob?.id &&
        props.pending.action === "reverify"));
  return [
    ...(job && props.onOpenJob
      ? [
          {
            id: "details",
            label: "View details",
            icon: <Eye size={14} aria-hidden />,
            onSelect: () => props.onOpenJob?.(job),
          },
        ]
      : []),
    ...(job
      ? [
          {
            id: "copy-link",
            label: "Copy job link",
            icon: <Link2 size={14} aria-hidden />,
            onSelect: () => copyJobLink(job),
          },
        ]
      : []),
    ...(job && canInstructJob(job.status) && props.onAddInstruction
      ? [
          {
            id: "instruct",
            label: "Add instruction",
            icon: <MessageSquarePlus size={14} aria-hidden />,
            tone: "brand" as const,
            onSelect: () => props.onAddInstruction?.(job),
          },
        ]
      : []),
    ...(job && canStartFromJob(job.status) && props.onStartFromJob
      ? [
          {
            id: "start-from",
            label: "Start New job from this finding",
            icon: <CopyPlus size={14} aria-hidden />,
            onSelect: () => props.onStartFromJob?.(job),
          },
        ]
      : []),
    ...(job && notes.length > 0 && props.onOpenFinding
      ? [
          {
            id: "finding",
            label: "View finding",
            icon: <FileText size={14} aria-hidden />,
            onSelect: () => props.onOpenFinding?.(job),
          },
        ]
      : []),
    ...(job && job.status === "needs_confirm" && props.onConfirm
      ? [
          {
            id: "confirm",
            label: "Start anyway",
            icon: <Play size={14} aria-hidden />,
            tone: "brand" as const,
            onSelect: () => props.onConfirm?.(job),
          },
        ]
      : []),
    ...(job &&
    (job.status === "paused" ||
      job.status === "waiting_on_you" ||
      job.status === "blocked" ||
      job.status === "error") &&
    props.onResume
      ? [
          {
            id: "resume",
            label: "Resume",
            icon: <Play size={14} aria-hidden />,
            tone: "brand" as const,
            onSelect: () => props.onResume?.(job),
          },
        ]
      : []),
    ...(job && jobReviewPending(job) && props.onKeepAll
      ? [
          {
            id: "keep-all",
            label: "Keep all",
            icon: <Check size={14} aria-hidden />,
            tone: "brand" as const,
            onSelect: () => props.onKeepAll?.(job),
          },
        ]
      : []),
    ...(job && isLiveJob(job.status) && props.onPause
      ? [
          {
            id: "pause",
            label: "Pause",
            icon: <Pause size={14} aria-hidden />,
            tone: "amber" as const,
            onSelect: () => props.onPause?.(job),
          },
        ]
      : []),
    ...(job &&
    (isLiveJob(job.status) || job.status === "paused") &&
    props.onCancel
      ? [
          {
            id: "cancel",
            label: "Cancel",
            icon: <X size={14} aria-hidden />,
            danger: true,
            onSelect: () => props.onCancel?.(job),
          },
        ]
      : []),
    ...(job && canRetryJob(job) && props.onRetry
      ? [
          {
            id: "retry",
            label: retrying ? "Retrying…" : "Retry job",
            icon: retryGlyph(retrying),
            tone: "brand" as const,
            onSelect: () => {
              if (!retrying) props.onRetry?.(job);
            },
          },
        ]
      : []),
    ...(checkJob && canRetryVerification(checkJob) && props.onReverify
      ? [
          {
            id: "reverify",
            label: reverifying ? "Running checks…" : "Retry verification",
            icon: retryGlyph(reverifying),
            tone: "amber" as const,
            onSelect: () => {
              if (!reverifying) props.onReverify?.(checkJob);
            },
          },
        ]
      : []),
    ...(job &&
    props.onDelete &&
    !isLiveJob(job.status) &&
    job.status !== "needs_confirm"
      ? [
          {
            id: "delete",
            label: "Delete",
            icon: <Trash2 size={14} aria-hidden />,
            danger: true,
            onSelect: () => props.onDelete?.(job),
          },
        ]
      : []),
    ...(props.onRemoveRepo
      ? [
          {
            id: "remove-repo",
            label: "Remove repository",
            icon: <FolderMinus size={14} aria-hidden />,
            danger: true,
            onSelect: () => props.onRemoveRepo?.(),
          },
        ]
      : []),
  ];
}

export function JobActions(props: JobActionsProps): ReactElement {
  const items = jobActionItems(props);
  if (items.length === 0) return <span />;
  return (
    <DropdownMenu
      trigger={
        <IconButton
          label={props.job ? "Job actions" : "Repository actions"}
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <MoreVertical size={16} aria-hidden />
        </IconButton>
      }
      items={items}
    />
  );
}

const FOCUS_BAR_IDS = new Set([
  "copy-link",
  "confirm",
  "resume",
  "keep-all",
  "pause",
  "cancel",
  "retry",
  "reverify",
  "start-from",
  "finding",
  "delete",
]);

function focusBarVariant(id: string): ButtonVariant {
  switch (id) {
    case "resume":
    case "confirm":
    case "keep-all":
      return "primary";
    case "start-from":
      return "secondary";
    case "retry":
      return "ghost";
    case "reverify":
    case "pause":
      return "warning";
    case "cancel":
    case "delete":
      return "danger";
    default:
      return "tertiary";
  }
}

function focusBarLabel(id: string, fallback: string): string {
  switch (id) {
    case "copy-link":
      return "Copy";
    case "start-from":
      return "Start new job";
    case "finding":
      return "Findings";
    case "reverify":
      return "Verification";
    case "retry":
      return "Job";
    case "delete":
      return "Delete";
    case "resume":
      return "Resume";
    case "keep-all":
      return "Keep all";
    default:
      return fallback;
  }
}

function focusBarDetail(id: string): string {
  switch (id) {
    case "copy-link":
      return "Copy a link to this job";
    case "start-from":
      return "Start a new job from this finding";
    case "finding":
      return "Open the write-up this job left";
    case "reverify":
      return "Retry supervisor checks";
    case "retry":
      return "Retry this job";
    case "delete":
      return "Delete this job";
    case "resume":
      return "Resume this job";
    case "keep-all":
      return "Keep every file this job changed";
    case "pause":
      return "Pause this job";
    case "cancel":
      return "Cancel this job";
    case "confirm":
      return "Start this job anyway";
    default:
      return focusBarLabel(id, "");
  }
}

export function focusBarMeta(
  id: string,
  fallback: string,
): {
  readonly label: string;
  readonly detail: string;
  readonly variant: ButtonVariant;
} {
  return {
    label: focusBarLabel(id, fallback),
    detail: focusBarDetail(id),
    variant: focusBarVariant(id),
  };
}

export function FocusJobBar(
  props: JobActionsProps & { readonly job: JobSummary },
): ReactElement | null {
  const items = jobActionItems(props).filter((item) =>
    FOCUS_BAR_IDS.has(item.id),
  );
  if (items.length === 0) return null;
  return (
    <div className="focus-job-bar">
      {items.map((item) => {
        const meta = focusBarMeta(item.id, item.label);
        return (
          <HoverTip key={item.id} label={meta.label} detail={meta.detail}>
            <IconButton
              label={meta.label}
              title=""
              variant={meta.variant}
              {...(item.id === "retry"
                ? { className: "focus-job-bar__retry" }
                : {})}
              onClick={() => item.onSelect()}
            >
              {item.icon}
            </IconButton>
          </HoverTip>
        );
      })}
    </div>
  );
}
