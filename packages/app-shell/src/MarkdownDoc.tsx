import { type ReactElement, type ReactNode } from "react";
import { parseMarkdown, type MdBlock } from "./markdown.js";

function renderInline(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return <em key={index}>{part.slice(1, -1)}</em>;
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return <code key={index}>{part.slice(1, -1)}</code>;
    }
    return part;
  });
}

function BlockView(props: { block: MdBlock }): ReactElement {
  const { block } = props;
  if (block.type === "heading") {
    const Tag = (["h2", "h3", "h4", "h5"] as const)[block.depth - 1] ?? "h5";
    return (
      <Tag className={`md-doc__h md-doc__h--${block.depth}`}>
        {renderInline(block.text)}
      </Tag>
    );
  }
  if (block.type === "list") {
    return (
      <ul className="md-doc__list">
        {block.items.map((item, itemIndex) => (
          <li key={itemIndex}>{renderInline(item)}</li>
        ))}
      </ul>
    );
  }
  if (block.type === "table") {
    return (
      <div className="md-doc__table-wrap">
        <table className="md-doc__table">
          <thead>
            <tr>
              {block.headers.map((cell, cellIndex) => (
                <th key={cellIndex}>{renderInline(cell)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex}>{renderInline(cell)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (block.type === "code") {
    return (
      <pre className="md-doc__code">
        <code>{block.text}</code>
      </pre>
    );
  }
  return <p className="md-doc__p">{renderInline(block.text)}</p>;
}

export function MarkdownDoc(props: {
  readonly text: string;
  readonly className?: string;
}): ReactElement {
  const blocks = parseMarkdown(props.text);
  return (
    <div className={props.className ? `md-doc ${props.className}` : "md-doc"}>
      {blocks.map((block, index) => (
        <BlockView key={index} block={block} />
      ))}
    </div>
  );
}
