import { describe, expect, it } from "vitest";
import { linearAuthHeader, parseLinear } from "./drivers.js";

describe("Linear OAuth GraphQL", () => {
  it("sends Bearer for OAuth access tokens", () => {
    expect(linearAuthHeader("lin_oauth_abc")).toBe("Bearer lin_oauth_abc");
    expect(linearAuthHeader("Bearer already")).toBe("Bearer already");
  });

  it("surfaces GraphQL auth errors instead of an empty issue list", () => {
    const snapshot = parseLinear({
      errors: [{ message: "Authentication required, not authenticated" }],
    });
    expect(snapshot.connected).toBe(true);
    expect(snapshot.available).toBe(false);
    expect(snapshot.error).toMatch(/Authentication required/i);
    expect(snapshot.items).toEqual([]);
  });

  it("maps open assigned issues and yesterday completions", () => {
    const snapshot = parseLinear({
      data: {
        viewer: {
          name: "Shailesh Jha",
          displayName: "Shailesh",
          open: {
            nodes: [
              {
                id: "1",
                identifier: "ENG-9",
                title: "Standup briefing",
                url: "https://linear.app/eng-9",
              },
            ],
          },
          done: {
            nodes: [{ id: "2", identifier: "ENG-8", title: "Connect Linear" }],
          },
        },
      },
    });
    expect(snapshot.available).toBe(true);
    expect(snapshot.viewerName).toBe("Shailesh");
    expect(snapshot.items[0]?.title).toBe("ENG-9 Standup briefing");
    expect(snapshot.recentlyDone?.[0]?.title).toBe("ENG-8 Connect Linear");
  });
});
