import Link from "next/link";
import { CommandBar, InfoCallout } from "@/components/paper/blocks";
import { DoctorExample } from "@/components/paper/examples";
import { Shell } from "@/components/paper/shell";
import {
  CLIENTS,
  DOCTOR_COMMAND,
  NODE_REQUIREMENT,
} from "@/lib/paper/install-facts";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Install",
  description:
    "Connect Prism to Claude Code, Cursor, Codex or opencode, then check the repo with the CLI.",
  path: "/install",
});

export default function InstallPage() {
  return (
    <Shell>
      <section style={{ padding: "80px 0 72px" }}>
        <div className="wrap grid2">
          <div>
            <div className="eyebrow">Install</div>
            <h1 className="d1" style={{ margin: "18px 0 20px" }}>
              One check.
            </h1>
            <p className="lede">
              Open a terminal in your repo and run doctor. Then add the MCP
              server for the agent you use. {NODE_REQUIREMENT} There is no{" "}
              <code>prism start</code> command and no agent picker.
            </p>
            <div style={{ marginTop: 28 }}>
              <CommandBar command={DOCTOR_COMMAND} />
            </div>
            <p className="src" style={{ marginTop: 12 }}>
              Global install, if you prefer a <code>prism</code> binary:{" "}
              <code>npm install -g @repo-prism/cli</code>, then{" "}
              <code>prism doctor</code>.
            </p>
          </div>
          <DoctorExample />
        </div>
      </section>
      <section className="sec">
        <div className="wrap">
          <h2 className="d3" style={{ marginBottom: 10 }}>
            Pick an agent
          </h2>
          <p className="muted" style={{ margin: "0 0 26px" }}>
            Each page has the terminal command, the MCP config, and an Add to
            Cursor button. The server entry is{" "}
            <code>npx -y --prefer-online @repo-prism/mcp-server@latest</code>.
          </p>
          <div className="grid4">
            {CLIENTS.map((client) => (
              <Link
                key={client.slug}
                className="card fx"
                href={`/install/${client.slug}`}
              >
                <h3 className="t">{client.name}</h3>
                <p>{client.lede}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>
      <section className="sec">
        <div className="wrap" style={{ maxWidth: 860 }}>
          <InfoCallout title="What this release installs">
            The MCP config gives your agent the tools. It does not write hooks,
            a skill file, or a rule for you. After the server is listed, run
            doctor in the repo.
          </InfoCallout>
        </div>
      </section>
    </Shell>
  );
}
