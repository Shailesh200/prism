import { CHANGELOG_REVALIDATE_SECONDS } from "@/lib/changelog-pages";
import { pageMetadata } from "@/lib/seo";
import { ChangelogView } from "./changelog-view";

export const revalidate = CHANGELOG_REVALIDATE_SECONDS;

export const metadata = pageMetadata({
  title: "Changelog",
  description:
    "What changed in Prism 2.0, then the 1.x release notes as they were written.",
  path: "/changelog",
});

export default function ChangelogPage() {
  return <ChangelogView page={1} />;
}
