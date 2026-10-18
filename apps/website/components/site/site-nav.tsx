import { Beam } from "@/components/ui/beam";
import { Button } from "@/components/ui/button";
import { StarButton } from "@/components/ui/star-button";
import { Container } from "@/components/ui/container";
import { Logo } from "./logo";
import { MobileMenu, NavLinks } from "./nav-menu";

export function SiteNav() {
  return (
    <div className="topbar">
      <Beam />
      <header className="nav">
        <Container>
          <Logo />
          <NavLinks />
          <div className="right">
            <StarButton size="sm" />
            <Button href="/install" size="sm">
              Install
            </Button>
          </div>
          <MobileMenu star={<StarButton />} />
        </Container>
      </header>
    </div>
  );
}
