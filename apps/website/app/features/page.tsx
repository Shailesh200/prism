import { redirect } from "next/navigation";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Features",
  description: "Moved to Features & Benchmarks.",
  path: "/features",
  index: false,
  follow: true,
});

export default function FeaturesRedirect() {
  redirect("/benchmarks");
}
