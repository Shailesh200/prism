import Highcharts from "highcharts";
import HighchartsHeatmap from "highcharts/modules/heatmap";
import HighchartsTreemap from "highcharts/modules/treemap";

let ready = false;

/** Initialize Highcharts treemap (+ heatmap for colorAxis) once in the browser. */
export function ensureHighchartsTreemap(): typeof Highcharts {
  if (!ready && typeof Highcharts === "object") {
    const treemapInit =
      typeof HighchartsTreemap === "function"
        ? HighchartsTreemap
        : (HighchartsTreemap as { default?: (hc: typeof Highcharts) => void })
            .default;
    const heatmapInit =
      typeof HighchartsHeatmap === "function"
        ? HighchartsHeatmap
        : (HighchartsHeatmap as { default?: (hc: typeof Highcharts) => void })
            .default;
    if (typeof heatmapInit === "function") heatmapInit(Highcharts);
    if (typeof treemapInit === "function") treemapInit(Highcharts);
    ready = true;
  }
  return Highcharts;
}

export { Highcharts };
