import { DispatchTheater } from "@/components/dispatch-theater";

/** Magazine plate — current Dispatch Console Pulse, not a stale screenshot. */
export function WhatsNewStill() {
  return (
    <figure className="wn-plate wn-plate--console">
      <DispatchTheater variant="magazine" />
      <figcaption className="wn-plate__cap">
        Console · Pulse · New job
        <span>prismhq.localhost:17330</span>
      </figcaption>
    </figure>
  );
}
