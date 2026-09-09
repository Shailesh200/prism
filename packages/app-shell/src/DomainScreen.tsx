import type { ReactElement } from "react";
import { BackendSection } from "./domains/BackendSection.js";
import { DataMlSection } from "./domains/DataMlSection.js";
import { DesktopSection } from "./domains/DesktopSection.js";
import { DevopsSection } from "./domains/DevopsSection.js";
import { FrontendSection } from "./domains/FrontendSection.js";
import { MobileSection } from "./domains/MobileSection.js";
import type { DomainScreenProps } from "./domains/shared.js";

export type {
  DomainOverlayStatus,
  DomainScreenProps,
} from "./domains/shared.js";

export function DomainScreen(props: DomainScreenProps): ReactElement {
  switch (props.domainId) {
    case "frontend":
      return <FrontendSection {...props} />;
    case "devops_platform":
      return <DevopsSection {...props} />;
    case "mobile":
      return <MobileSection {...props} />;
    case "desktop":
      return <DesktopSection {...props} />;
    case "backend":
      return <BackendSection {...props} />;
    default:
      return <DataMlSection {...props} />;
  }
}
