import Link from "next/link";
import { Shell } from "@/components/paper/shell";
import { PRODUCT_LINKS } from "@/lib/paper/nav";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Product",
  description: "Prepare, blast radius, guardrails, receipts, review, and the CLI.",
  path: "/products",
});

export default function ProductsPage() {
  return (
    <Shell>
      <section style={{ padding: "80px 0" }}>
        <div className="wrap">
          <div className="eyebrow">Product</div>
          <h1 className="d1" style={{ margin: "18px 0 28px" }}>
            What Prism <em>answers.</em>
          </h1>
          <div className="grid2">
            {PRODUCT_LINKS.map((item) => (
              <Link key={item.href} href={item.href} className="card" style={{ display: "block" }}>
                <h2 className="t">{item.label}</h2>
                <p>{item.text}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </Shell>
  );
}