import { expect, test, type ConsoleMessage, type Page } from "@playwright/test";

/**
 * Every screen loads, renders something, and logs no error.
 *
 * The bar is deliberately low and broad. A screen that throws during render,
 * loses its data contract, or references a component that no longer exists
 * fails here — and those are the breakages that a refactor actually causes.
 * Asserting on specific copy would instead fail every time someone improves a
 * heading.
 */

const SCREENS = [
  "Overview",
  "Repository Map",
  "Codebase Profile",
  "Domains",
  "DNA Analysis",
  "Blast Radius",
  "Trends",
  "Integrations",
  "Settings",
] as const;

/** Noise that is not the application failing. */
const IGNORED = [
  /favicon/i,
  /Download the React DevTools/i,
  /\[vite\]/i,
  // Gravatar is off by default, but a stray avatar request failing offline is
  // a network condition, not a defect in the screen.
  /gravatar\.com/i,
];

function watchConsole(page: Page): string[] {
  const errors: string[] = [];
  const record = (message: string): void => {
    if (IGNORED.some((pattern) => pattern.test(message))) return;
    errors.push(message);
  };
  page.on("console", (message: ConsoleMessage) => {
    if (message.type() !== "error") return;
    // Chrome logs resource failures as a bare "Failed to load resource",
    // which names nothing. The response listener below reports the URL, so
    // drop the duplicate rather than print a line nobody can act on.
    if (/Failed to load resource/i.test(message.text())) return;
    record(message.text());
  });
  page.on("pageerror", (error) => record(`uncaught: ${error.message}`));
  page.on("response", (response) => {
    if (response.status() >= 400) {
      record(`${response.status()} ${response.url()}`);
    }
  });
  return errors;
}

async function openScreen(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name, exact: true }).click();
}

test.describe("every screen", () => {
  for (const screen of SCREENS) {
    test(`${screen} renders without a console error`, async ({ page }) => {
      const errors = watchConsole(page);
      await page.goto("/");
      await expect(
        page.getByRole("complementary", { name: "Primary navigation" }),
      ).toBeVisible();

      await openScreen(page, screen);

      // Something has to be on the page, and the shell has to survive it.
      // Screens do not share a container class — the map has its own layout —
      // so assert on what is true of all of them: the nav is still there, and
      // the screen rendered more than an empty frame.
      await expect(
        page.getByRole("complementary", { name: "Primary navigation" }),
      ).toBeVisible();
      const text = (await page.locator("body").innerText()).trim();
      expect(
        text.length,
        `${screen} rendered almost nothing:\n${text}`,
      ).toBeGreaterThan(200);

      // The boundary renders this when a screen throws. It is the single most
      // informative thing to assert the absence of.
      await expect(page.getByRole("alert")).toHaveCount(0);

      expect(
        errors,
        `console errors on ${screen}:\n${errors.join("\n")}`,
      ).toEqual([]);
    });
  }
});

test.describe("navigating between screens", () => {
  test("keeps the shell alive across every screen in one session", async ({
    page,
  }) => {
    const errors = watchConsole(page);
    await page.goto("/");

    // Screens share stores and effects. Visiting them one at a time in
    // separate tests would miss a screen that only breaks after another has
    // mounted — which is the more common failure.
    for (const screen of SCREENS) {
      await openScreen(page, screen);
      await expect(page.getByRole("alert")).toHaveCount(0);
    }

    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("marks the screen you are on in the sidebar", async ({ page }) => {
    await page.goto("/");
    await openScreen(page, "Trends");

    // Without this a user has no way to tell where they are.
    await expect(
      page.getByRole("button", { name: "Trends", exact: true }),
    ).toHaveAttribute("data-active", "true");
    await expect(
      page.getByRole("button", { name: "Overview", exact: true }),
    ).toHaveAttribute("data-active", "false");
  });
});

test.describe("consent is off until asked for", () => {
  test("settings shows every purpose, all denied on a fresh workspace", async ({
    page,
  }) => {
    await page.goto("/");
    await openScreen(page, "Settings");
    await page.getByRole("button", { name: "Privacy", exact: true }).click();

    // Consent switches label themselves "Allowed"/"Not allowed", which
    // separates them from the other privacy switches on the same panel — and
    // is itself worth pinning, since "On"/"Off" would not tell a user what
    // they are permitting.
    const toggles = page.getByRole("switch", {
      name: /^(Allowed|Not allowed)$/,
    });
    const count = await toggles.count();

    // One per consent purpose. Zero would mean the panel silently rendered
    // none of them and the user has no way to grant or withdraw anything.
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i += 1) {
      await expect(toggles.nth(i)).toHaveAttribute("aria-checked", "false");
      await expect(toggles.nth(i)).toHaveAccessibleName("Not allowed");
    }
  });
});
