import { GITHUB, fetchStarCount, formatStarCount } from "@/lib/github";
import { Button } from "./button";
import { GithubIcon, StarIcon } from "./icons";

/** Star on GitHub, with the live star count when GitHub answers. */
export async function StarButton({ size }: { size?: "sm" }) {
  const stars = await fetchStarCount();
  // The accessible name is the visible text plus a hidden "stars", so voice control can say what it sees.
  return (
    <Button href={GITHUB} variant="star" size={size}>
      <GithubIcon />
      <span>Star on GitHub</span>
      <span className="st">
        <StarIcon />
        {stars !== null && (
          <span className="n">
            {formatStarCount(stars)}
            <span className="sr-only"> stars</span>
          </span>
        )}
      </span>
    </Button>
  );
}
