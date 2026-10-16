import { CommandBar, DataTable } from "@/components/paper/blocks";
import { Rich } from "@/components/paper/rich";
import type { DocBlock } from "@/lib/paper/docs-content";

export function headingId(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function DocBlocks({ blocks }: { blocks: DocBlock[] }) {
  return (
    <>
      {blocks.map((block, index) => {
        if (block.kind === "h2") {
          const id = headingId(block.text);
          return (
            <h2 id={id} key={id}>
              {block.text}
            </h2>
          );
        }
        if (block.kind === "p") {
          return (
            <p key={index}>
              <Rich text={block.text} />
            </p>
          );
        }
        if (block.kind === "note") {
          return (
            <div className="callout" key={index}>
              <Rich text={block.text} />
            </div>
          );
        }
        if (block.kind === "ul" || block.kind === "ol") {
          const Tag = block.kind;
          return (
            <Tag key={index}>
              {block.items.map((item) => (
                <li key={item}>
                  <Rich text={item} />
                </li>
              ))}
            </Tag>
          );
        }
        if (block.kind === "commands") {
          return (
            <div key={index} style={{ display: "grid", gap: 10, margin: "16px 0" }}>
              {block.commands.map((command) => (
                <CommandBar key={command} command={command} />
              ))}
            </div>
          );
        }
        return (
          <DataTable
            key={index}
            headers={block.headers}
            rows={block.rows.map((row) => row.map((cell) => <Rich key={cell} text={cell} />))}
          />
        );
      })}
    </>
  );
}
