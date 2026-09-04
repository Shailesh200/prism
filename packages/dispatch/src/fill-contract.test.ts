import { describe, expect, it } from "vitest";
import { buildFillContract, fillSectionsFromConfig } from "./fill-contract.js";
import type { HostConnector } from "./host-connectors.js";

const slack: HostConnector = {
  id: "plugin-slack-slack",
  label: "Slack",
  hosts: ["cursor"],
  skills: ["slack-search"],
  source: "/fake",
};

const linear: HostConnector = {
  id: "linear",
  label: "Linear",
  hosts: ["cursor"],
  skills: [],
  source: "/fake",
};

describe("fillSectionsFromConfig", () => {
  it("drops vendor sections the user turned off", () => {
    expect(
      fillSectionsFromConfig({
        sectionOrder: ["jobs", "slack", "github", "calendar"],
        sectionsOff: ["github"],
      }),
    ).toEqual(["messages", "calendar"]);
  });
});

describe("buildFillContract", () => {
  it("matches a vendor from the plugin id or label, not only an exact id", () => {
    const contract = buildFillContract([slack], { sections: ["messages"] });
    expect(contract.requests).toEqual([
      expect.objectContaining({
        section: "messages",
        connectors: ["plugin-slack-slack"],
      }),
    ]);
  });

  it("puts Slack channel and mention caps into the ask so they are used", () => {
    const contract = buildFillContract([slack], {
      sections: ["messages"],
      slack: {
        channelIds: ["C123", "C456"],
        mentionWindowHours: 12,
        mentionLimit: 5,
        trackedMessageLimit: 8,
      },
    });
    expect(contract.requests[0]?.ask).toContain("last 12 hours");
    expect(contract.requests[0]?.ask).toContain("at most 5");
    expect(contract.requests[0]?.ask).toContain("C123, C456");
    expect(contract.requests[0]?.ask).toContain("up to 8");
  });

  it("omits a turned-off Slack section instead of asking the host to fill it", () => {
    const contract = buildFillContract([slack, linear], {
      sectionOrder: ["tickets", "slack", "github"],
      sectionsOff: ["slack"],
    });
    expect(contract.requests.map((row) => row.section)).toEqual(["tickets"]);
    expect(contract.unfillable).toEqual(["reviews"]);
  });
});
