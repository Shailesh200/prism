declare module "highcharts/modules/treemap" {
  import type Highcharts from "highcharts";
  const factory: (hc: typeof Highcharts) => void;
  export default factory;
}

declare module "highcharts/modules/heatmap" {
  import type Highcharts from "highcharts";
  const factory: (hc: typeof Highcharts) => void;
  export default factory;
}

declare module "highcharts-react-official" {
  import type { ComponentType } from "react";
  import type Highcharts from "highcharts";

  export type HighchartsReactProps = {
    highcharts: typeof Highcharts;
    options: Highcharts.Options;
    containerProps?: Record<string, unknown>;
    immutable?: boolean;
    allowChartUpdate?: boolean;
    updateArgs?: unknown[];
    callback?: (chart: Highcharts.Chart) => void;
  };

  const HighchartsReact: ComponentType<HighchartsReactProps>;
  export default HighchartsReact;
  export type { HighchartsReactProps };
}
