import Link from "next/link";
import { GITHUB } from "@/lib/github";
import { FOOTER_COLUMNS } from "@/lib/nav";
import { StarButton } from "@/components/ui/star-button";
import { Container } from "@/components/ui/container";
import { Logo } from "./logo";

export function SiteFooter() {
  return (
    <footer className="foot">
      <Container>
        <div className="cols">
          <div>
            <Logo />
            <p className="blurb">
              Your agent’s second pair of eyes. Know before you ship. Local
              software intelligence that catches what the agent missed. Free,
              MIT, runs on your machine.
            </p>
            <StarButton size="sm" />
          </div>
          {FOOTER_COLUMNS.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <h2>{col.title}</h2>
              {col.links.map((l) => (
                <Link key={l.href} href={l.href}>
                  {l.label}
                </Link>
              ))}
            </nav>
          ))}
        </div>
        <div className="base">
          <span>MIT licence · prismhq.in</span>
          <a href={GITHUB}>github.com/Shailesh200/prism</a>
        </div>
      </Container>
    </footer>
  );
}
