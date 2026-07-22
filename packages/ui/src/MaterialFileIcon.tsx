import type { ReactElement } from "react";
import {
  materialIconForFile,
  materialIconForFolder,
  materialSvg,
} from "./material-file-icon.js";

export type MaterialFileIconProps = {
  /** File name / path (used when `folder` is not set). */
  readonly name: string;
  /** Render a folder icon instead of a file icon. */
  readonly folder?: boolean;
  /** Folder open state (only used when `folder`). */
  readonly open?: boolean;
  readonly size?: number;
};

/**
 * Material Icon Theme file/folder glyph. Icons are inlined SVG (bundled, no
 * network) resolved from the file name or folder name via the generated maps.
 */
export function MaterialFileIcon(props: MaterialFileIconProps): ReactElement {
  const size = props.size ?? 24;
  const iconName = props.folder
    ? materialIconForFolder(props.name, props.open ?? false)
    : materialIconForFile(props.name);
  const svg = materialSvg(iconName) ?? materialSvg("file") ?? "";
  return (
    <span
      className="prism-file-icon prism-file-icon--material"
      style={{ width: size, height: size }}
      aria-hidden
      // Inlined, trusted SVG from the bundled Material Icon Theme set.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
