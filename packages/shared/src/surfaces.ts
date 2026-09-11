/**
 * Dispatch and Spectrum liveness on this machine.
 *
 * Separate from ConsoleStatus: that type is the Integrations / jobs-link
 * payload (tokenised URL, connectors). This is the Wake doors — whether each
 * surface is answering, and where to open it.
 */

export type PrismSurfaceState = {
  readonly live: boolean;
  readonly url: string;
};

export type PrismSurfacesStatus = {
  readonly dispatch: PrismSurfaceState;
  readonly spectrum: PrismSurfaceState;
};

export const DEFAULT_DISPATCH_URL = "http://prismhq.localhost:17330/";
export const DEFAULT_SPECTRUM_URL = "http://prismhq.localhost:17331/";

/** Hub down-page copy. Anything else on the port counts as awake. */
export function htmlLooksAwake(body: string): boolean {
  return !/Prism is down/i.test(body);
}
