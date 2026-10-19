import { pageMetadata } from "@/lib/seo";
import { ChangelogView } from "./changelog-view";

/** Literal: Next reads this at build time. Same interval as CHANGELOG_REVALIDATE_SECONDS. */
export const revalidate = 300;

export const metadata = pageMetadata({
  title: "Changelog",
  description:
    "What changed in Prism 2.0, then the 1.x release notes as they were written.",
  path: "/changelog",
});

export default function ChangelogPage() {
  return <ChangelogView page={1} />;
}
