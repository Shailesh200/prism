import Link from "next/link";
import { notFound } from "next/navigation";
import { DataTable } from "@/components/paper/blocks";
import { InstallTabs } from "@/components/paper/install-tabs";
import { Shell } from "@/components/paper/shell";
import { CLIENTS } from "@/lib/paper/install-facts";
import { pageMetadata } from "@/lib/seo";

export function generateStaticParams() {
  return CLIENTS.map((client) => ({ client: client.slug }));
}

export async function generateMetadata(props: {
  params: Promise<{ client: string }>;
}) {
  const { client: slug } = await props.params;
  const client = CLIENTS.find((item) => item.slug === slug);
  if (!client) return {};
  return pageMetadata({
    title: `Install · ${client.name}`,
    description: client.lede,
    path: `/install/${slug}`,
  });
}

export default async function ClientInstallPage(props: {
  params: Promise<{ client: string }>;
}) {
  const { client: slug } = await props.params;
  const client = CLIENTS.find((item) => item.slug === slug);
  if (!client) notFound();

  return (
    <Shell>
      <div className="subnav">
        <div className="wrap">
          <Link href="/install" className="eyebrow" style={{ marginRight: 12 }}>
            ← Install
          </Link>
          {CLIENTS.map((item) => (
            <Link
              key={item.slug}
              href={`/install/${item.slug}`}
              className={item.slug === slug ? "on" : undefined}
            >
              {item.name}
            </Link>
          ))}
        </div>
      </div>
      <section style={{ padding: "72px 0" }}>
        <div className="wrap grid2">
          <div>
            <div className="eyebrow">Install · {client.name}</div>
            <h1 className="d2" style={{ margin: "16px 0 18px" }}>
              Prism for <em>{client.name}.</em>
            </h1>
            <p className="lede">{client.lede}</p>
          </div>
          <InstallTabs
            command={client.command}
            commandLines={[...client.lines]}
            configPath={client.configPath}
            configLang={client.configLang}
            config={client.config}
            configNote={client.configNote}
          />
        </div>
      </section>
      <section className="sec">
        <div className="wrap grid2" style={{ alignItems: "start" }}>
          <div>
            <h2 className="d3" style={{ marginBottom: 20 }}>
              Where it is read
            </h2>
            <div className="card" style={{ padding: "8px 24px" }}>
              <DataTable
                headers={["Where", "What"]}
                rows={client.writes.map(([where, what]) => [
                  <code key={where}>{where}</code>,
                  what,
                ])}
              />
            </div>
          </div>
          <div>
            <h2 className="d3" style={{ marginBottom: 20 }}>
              Then
            </h2>
            <ol
              style={{
                color: "var(--ink2)",
                fontSize: 17,
                lineHeight: 1.9,
                paddingLeft: 22,
                margin: 0,
              }}
            >
              <li>Save the config, or use Add to Cursor.</li>
              <li>Restart {client.name} and enable the prism server.</li>
              <li>
                Run <code>npx -y @repo-prism/cli doctor</code> in the repo.
              </li>
              <li>Ask for a change in plain words.</li>
            </ol>
          </div>
        </div>
      </section>
    </Shell>
  );
}
