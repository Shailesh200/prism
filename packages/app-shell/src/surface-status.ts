import { htmlLooksAwake } from "@repo-prism/shared";

export type SurfaceLive = boolean | undefined;

export function surfaceLiveLabel(live: SurfaceLive): string {
  if (live === undefined) return "Checking";
  return live ? "Awake" : "Down";
}

export function wakeHeadline(
  dispatchLive: SurfaceLive,
  spectrumLive: SurfaceLive,
): string {
  if (dispatchLive === true && spectrumLive === true) return "Prism is awake.";
  if (dispatchLive === true && spectrumLive === false) {
    return "Dispatch is awake.";
  }
  if (spectrumLive === true && dispatchLive === false) {
    return "Spectrum is awake.";
  }
  if (dispatchLive === false && spectrumLive === false) return "Prism is down.";
  return "Prism is awake.";
}

export function wakeLede(
  dispatchLive: SurfaceLive,
  spectrumLive: SurfaceLive,
): string {
  if (dispatchLive === true && spectrumLive === false) {
    return "Dispatch is on this machine. Spectrum is down — wake it, or open the door to retry.";
  }
  if (spectrumLive === true && dispatchLive === false) {
    return "Spectrum is on this machine. Dispatch is down — jobs stay queued until it is awake.";
  }
  if (dispatchLive === false && spectrumLive === false) {
    return "Neither Dispatch nor Spectrum is answering on this machine.";
  }
  return "Dispatch and Spectrum are on this machine. The repo you pick retargets both.";
}

export async function probeSurfaceAwake(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
    if (!response.ok) return false;
    return htmlLooksAwake(await response.text());
  } catch {
    return false;
  }
}
