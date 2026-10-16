import Link from "next/link";
import { Terminal } from "@/components/paper/blocks";
import { Shell } from "@/components/paper/shell";

export default function NotFound() {
  return (
    <Shell>
      <section style={{ padding: "110px 0 130px" }}>
        <div className="wrap grid2">
          <div>
            <div className="eyebrow">404</div>
            <h1 className="d1" style={{ margin: "18px 0 20px" }}>
              This page is <em>off the map.</em>
            </h1>
            <p className="lede">The link may be old. Try the docs or go back home.</p>
            <div style={{ display: "flex", gap: 12, marginTop: 28, flexWrap: "wrap" }}>
              <Link className="btn dark" href="/">
                Back home
              </Link>
              <Link className="btn line" href="/docs">
                Open the docs
              </Link>
            </div>
          </div>
          <Terminal
            title="~/your-repo"
            command="prism explain /this-page"
            lines={[
              <>
                <span className="r">PRISM_NOT_FOUND</span>: File not found in index: /this-page
              </>,
            ]}
          />
        </div>
      </section>
    </Shell>
  );
}
