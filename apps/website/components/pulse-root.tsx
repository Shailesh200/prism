"use client";

import { useEffect } from "react";
import {
  PULSE_ORIGIN,
  PULSE_WEBSITE_ID,
  bindDocsCodeCopy,
  bindPulseClicks,
  loadPulse,
  pulseDomains,
} from "@/lib/pulse";

/**
 * Loads Pulse on every marketing and docs page. Umami records History
 * page views; copy/install clicks are tagged in the install surfaces.
 */
export function PulseRoot() {
  const domains = pulseDomains();

  useEffect(() => {
    if (!PULSE_WEBSITE_ID) return;
    return loadPulse({
      websiteId: PULSE_WEBSITE_ID,
      origin: PULSE_ORIGIN,
      domains,
    });
  }, [domains]);

  useEffect(() => {
    if (!PULSE_WEBSITE_ID) return;
    return bindPulseClicks();
  }, []);

  useEffect(() => {
    if (!PULSE_WEBSITE_ID) return;
    return bindDocsCodeCopy();
  }, []);

  return null;
}
