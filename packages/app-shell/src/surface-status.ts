import { htmlLooksAwake } from "@repo-prism/shared";

export type SurfaceLive = boolean | undefined;

export function surfaceLiveLabel(live: SurfaceLive): string {
  if (live === undefined) return "Checking";
  return live ? "Awake" : "Down";
}

/** One Dashboard — jobs and maps share the same page. */
export function dashboardLive(
  dispatchLive: SurfaceLive,
  spectrumLive: SurfaceLive,
): SurfaceLive {
  if (dispatchLive === true || spectrumLive === true) return true;
  if (dispatchLive === false && spectrumLive === false) return false;
  return undefined;
}

export function wakeHeadline(
  dispatchLive: SurfaceLive,
  spectrumLive: SurfaceLive,
): string {
  const live = dashboardLive(dispatchLive, spectrumLive);
  if (live === false) return "Prism is down.";
  return "Prism is awake.";
}

export function wakeLede(
  dispatchLive: SurfaceLive,
  spectrumLive: SurfaceLive,
): string {
  const live = dashboardLive(dispatchLive, spectrumLive);
  if (live === false) {
    return "The Dashboard is not answering. Say prism wake in chat.";
  }
  return "This is the Prism Dashboard. Say prism wake anytime to bring it back.";
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
