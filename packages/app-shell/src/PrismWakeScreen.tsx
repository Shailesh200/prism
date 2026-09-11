import { Button, IconButton, Pip } from "@repo-prism/ui";
import { X } from "lucide-react";
import { type ReactElement, type ReactNode, useEffect } from "react";
import {
  surfaceLiveLabel,
  wakeHeadline,
  wakeLede,
  type SurfaceLive,
} from "./surface-status.js";
import { WakeHexMapArt, WakeJobRailArt } from "./wake-art.js";

export type PrismWakeHere = "dispatch" | "spectrum";

export type PrismWakeScreenProps = {
  readonly here: PrismWakeHere;
  readonly dispatchLive: SurfaceLive;
  readonly spectrumLive: SurfaceLive;
  readonly onOpenDispatch: () => void;
  readonly onOpenSpectrum: () => void;
  readonly onClose?: () => void;
  readonly spectrumBlurb?: string;
  readonly children?: ReactNode;
};

export function PrismSurfacePips(props: {
  readonly dispatchLive: SurfaceLive;
  readonly spectrumLive: SurfaceLive;
  readonly href?: string;
}): ReactElement {
  const chips = (
    <div className="wake-pills" aria-label="Dispatch and Spectrum">
      <SurfacePip label="Dispatch" live={props.dispatchLive} />
      <SurfacePip label="Spectrum" live={props.spectrumLive} />
    </div>
  );
  if (!props.href) return chips;
  return (
    <a className="wake-pips-link" href={props.href}>
      {chips}
    </a>
  );
}

export function PrismWakeScreen(props: PrismWakeScreenProps): ReactElement {
  const spectrumBlurb =
    props.spectrumBlurb ?? "Maps, DNA, blast radius for the repo you pick.";
  useEffect(() => {
    if (!props.onClose) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      props.onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [props.onClose]);
  return (
    <div className="wake-layout">
      <div className="wake-layout__top">
        <PrismSurfacePips
          dispatchLive={props.dispatchLive}
          spectrumLive={props.spectrumLive}
        />
        {props.onClose ? (
          <IconButton
            className="wake-close"
            label="Close"
            onClick={props.onClose}
          >
            <X size={16} aria-hidden />
          </IconButton>
        ) : null}
      </div>
      <h1>{wakeHeadline(props.dispatchLive, props.spectrumLive)}</h1>
      <p className="wake-lede">
        {wakeLede(props.dispatchLive, props.spectrumLive)}
      </p>
      {props.children}
      <section className="wake-doors" aria-label="Open a tool">
        <SurfaceDoor
          here={props.here === "dispatch"}
          live={props.dispatchLive}
          title="Dispatch"
          blurb="Dispatch jobs."
          action="Open Dispatch"
          onOpen={props.onOpenDispatch}
          art={<WakeJobRailArt />}
        />
        <SurfaceDoor
          here={props.here === "spectrum"}
          live={props.spectrumLive}
          title="Spectrum"
          blurb={spectrumBlurb}
          action="Open Spectrum"
          onOpen={props.onOpenSpectrum}
          art={<WakeHexMapArt />}
        />
      </section>
      <p className="wake-foot">
        Spectrum follows the repo you pick. Sleep parks both; wake starts both.
      </p>
    </div>
  );
}

function SurfacePip(props: {
  readonly label: string;
  readonly live: SurfaceLive;
}): ReactElement {
  const tone =
    props.live === true ? "brand" : props.live === false ? "rose" : "muted";
  return (
    <p
      className={
        props.live === false ? "wake-pill wake-pill--down" : "wake-pill"
      }
    >
      <Pip
        tone={tone}
        size="sm"
        pulse={props.live === true}
        className="wake-pill__pip"
      />
      <span>
        {props.label}
        {" · "}
        {surfaceLiveLabel(props.live).toLowerCase()}
      </span>
    </p>
  );
}

function SurfaceDoor(props: {
  readonly here: boolean;
  readonly live: SurfaceLive;
  readonly title: string;
  readonly blurb: string;
  readonly action: string;
  readonly onOpen: () => void;
  readonly art: ReactElement;
}): ReactElement {
  const down = props.live === false;
  return (
    <article
      className={down ? "wake-door wake-door--down" : "wake-door"}
      aria-current={props.here ? "true" : undefined}
    >
      <div className="wake-door__art">{props.art}</div>
      <div className="wake-door__body">
        <div className="wake-door__title">
          <h2>{props.title}</h2>
          <p
            className={
              down ? "wake-door__live wake-door__live--down" : "wake-door__live"
            }
          >
            <Pip
              tone={
                props.live === true
                  ? "brand"
                  : props.live === false
                    ? "rose"
                    : "muted"
              }
              size="sm"
              pulse={props.live === true}
            />
            {surfaceLiveLabel(props.live)}
          </p>
        </div>
        <p className="wake-door__blurb">{props.blurb}</p>
      </div>
      <div className="wake-door__actions">
        <Button
          variant="primary"
          onClick={props.onOpen}
          title={down ? `${props.title} is down — open anyway` : props.action}
        >
          {props.action}
          <span className="wake-door__arrow" aria-hidden>
            →
          </span>
        </Button>
      </div>
    </article>
  );
}
