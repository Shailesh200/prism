import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { DataTable } from "@/components/paper/blocks";
import {
  BlastExample,
  EnvelopeExample,
  GuardExample,
  HabitExample,
  MapExample,
  PrepareExample,
  RefsExample,
  RenameExample,
  ReviewExample,
  SafeDeleteExample,
  TestsExample,
  DoctorExample,
} from "@/components/paper/examples";
import { ProductView, Split } from "@/components/paper/product-view";
import { Shell } from "@/components/paper/shell";
import { Rich } from "@/components/paper/rich";
import { pageMetadata } from "@/lib/seo";

const PAGES = {
  prepare: {
    title: "The right context, *before the first edit.*",
    description:
      "prepare_change returns files, reuse, House Style, notes and a work order. Never file bodies.",
    lede: "When you ask for a change, Prism adds a short list to the request: the files to open, helpers that already exist, the tests, and a work order. Paths and names only.",
    visual: <PrepareExample />,
    caption: (
      <>
        Your words in the chat; the same answer from <code>prism prepare</code>.
      </>
    ),
    points: [
      {
        title: "Files for the task",
        text: "A pack of paths, with why each one was picked. Ambiguous names come back as candidates.",
      },
      {
        title: "Code to reuse",
        text: "Helpers that already exist nearby, so the agent does not write a second copy.",
      },
      {
        title: "House Style",
        text: "Three exemplars of how this repo already writes the same kind of code.",
      },
      {
        title: "Notes",
        text: "Facts saved with the `remember` tool, attached to a symbol or path, come back with the file.",
      },
      {
        title: "A token budget",
        text: "The map-token budget defaults to 4,000 and can sit between 200 and 20,000. It is not a count of source tokens.",
      },
      {
        title: "Nothing is written",
        text: "Prepare returns a report. It does not edit the working tree.",
      },
    ],
  },
  "blast-radius": {
    title: "Find every caller. *See what a change touches.*",
    description:
      "find_references, blast_radius and test_impact, from the chat or the CLI.",
    lede: "Ask where a function is used, or what depends on a file. Prism answers from the index: callers, dependents, tests, and a risk band.",
    visual: <RefsExample />,
    caption: (
      <>
        “Where do we call getUser?” uses <code>find_references</code>. In the
        terminal: <code>prism refs</code>.
      </>
    ),
    points: [
      {
        title: "Every caller",
        text: "`find_references` lists who calls or imports a symbol. The CLI is `prism refs`.",
      },
      {
        title: "What a change touches",
        text: "`blast_radius` lists dependents and tests, with a risk band: low, mid or high.",
      },
      {
        title: "Tests to run",
        text: "`test_impact` lists the test files that reach a change. The CLI is `prism test-impact`.",
      },
    ],
  },
  guardrails: {
    title: "Keeps edits *on safe ground.*",
    description:
      "guard_session ranks the dirty session. rename_impact and safe_delete report edit sites. Prism does not write the change.",
    lede: "Before a rename or a delete, Prism lists every site the change would touch. guard_session ranks the files already dirty in this session so you read the riskiest one first.",
    visual: <GuardExample />,
    caption: (
      <>
        The work order names off-limits paths. You rank the session with{" "}
        <code>guard_session</code>.
      </>
    ),
    points: [
      {
        title: "Off-limits paths",
        text: "`prepare_change` returns generated and vendor paths on the work order. A write veto stays off unless an Accepted ADR arms it.",
      },
      {
        title: "Safe renames",
        text: "`rename_impact` lists every edit site. The CLI is `prism rename`. Nothing is written.",
      },
      {
        title: "Safe deletes",
        text: "`safe_delete` says whether anything still imports a file or symbol. The CLI is `prism safe-delete`.",
      },
      {
        title: "Widely used code",
        text: "`guard_session` ranks dirty files by blast so a widely used file is read first.",
      },
      {
        title: "Risk bands",
        text: "low is Low Impact, mid is Moderate Impact, high is High Impact Potential.",
      },
      {
        title: "Your agent, your edits",
        text: "Prism reports. Your agent makes the edit.",
      },
    ],
  },
  receipts: {
    title: "A local receipt *for every call.*",
    description:
      "The Envelope records tool name, counts, truncation and bytes. It never stores source.",
    lede: "Each successful Intelligence call appends one line under ~/.prism/envelope-ledger.jsonl. The line records the tool, item counts, whether the list was cut, the limit, and the JSON byte size. It does not record prompts, paths, or file bodies.",
    visual: <EnvelopeExample />,
    caption: <>Counts and bytes. Never source.</>,
    points: [
      {
        title: "One line per call",
        text: "The tool name, how many items came back, and whether the list was truncated.",
      },
      {
        title: "Honest lists",
        text: "List tools return `totalCount`. A cut list sets `truncated` so fifty of sixty is not mistaken for all sixty.",
      },
      {
        title: "Stays on the machine",
        text: "The ledger is never uploaded. An empty file means no sessions, not a zero score.",
      },
    ],
  },
  review: {
    title: "Review your changes *before you push.*",
    description:
      "review_changes and prism review rank a diff by risk band. --fail-on exits 1 at or above the band.",
    lede: "Ask your agent to review. review_changes rolls up blast radius, test impact and breaking-change hints, with one risk band for the set.",
    visual: <ReviewExample />,
    caption: (
      <>
        Ask “review my changes”, or run <code>prism review</code>.
      </>
    ),
    points: [
      {
        title: "One call",
        text: "`review_changes` reviews the working tree, or a git base such as `origin/main`.",
      },
      {
        title: "Separate from Guard",
        text: "`guard_session` ranks dirty files. It does not take a review flag. Use `review_changes` for the test-impact view.",
      },
      {
        title: "A gate you can run",
        text: "`prism review --base origin/main --fail-on high` exits 1 when the risk is at or above high.",
      },
    ],
  },
  lenses: {
    title: "One review, *three risk bands.*",
    description:
      "This release reviews through risk bands, not named lenses. prism lens is not a command.",
    lede: "A change is low, mid, or high. Those bands are what prism review and blast_radius return. Named lenses — Architect, QA, Dev, or a lens you add — are not part of this release.",
    visual: <ReviewExample />,
    caption: <>The band is the angle this release can show.</>,
    points: [
      {
        title: "low",
        text: "Low Impact. `--fail-on low` exits 1 for any band at or above low.",
      },
      {
        title: "mid",
        text: "Moderate Impact. The usual gate before a push is `--fail-on high`.",
      },
      {
        title: "high",
        text: "High Impact Potential. Read the file before you merge.",
      },
    ],
  },
  habits: {
    title: "Routines your agent *already has.*",
    description:
      "start_my_day briefs the repo. use_skill loads a skill from ~/.prism/dispatch/skills. There is no prism habit command.",
    lede: "Say “start my day” and the agent calls start_my_day. Say “prism use” and it calls use_skill. Prism stores skills under ~/.prism/dispatch/skills. It does not run a habit file of shell steps.",
    visual: <HabitExample />,
    caption: (
      <>
        <code>start_my_day</code> is the standup. <code>use_skill</code> loads a
        saved skill.
      </>
    ),
    points: [
      {
        title: "Start my day",
        text: "Yesterday in git, open items, leftover jobs, and one suggested focus. Unconnected tools are named.",
      },
      {
        title: "Skills stay in Prism",
        text: "`use_skill` reads `~/.prism/dispatch/skills` or a skill that ships with Prism. It does not write your editor’s skill folder.",
      },
      {
        title: "The agent runs the steps",
        text: "Prism returns the skill text. Your agent follows it with its own tools.",
      },
      {
        title: "No habit command",
        text: "`prism habit add` is not in this CLI. Save a skill, then ask the agent to use it.",
      },
      {
        title: "Any connected agent",
        text: "Claude Code, Cursor, Codex and opencode call the same MCP tools.",
      },
      {
        title: "Secrets stay out",
        text: "Do not put tokens in a skill. Prism holds no third-party credentials.",
      },
    ],
  },
  cli: {
    title: "Every answer, *in your terminal.*",
    description:
      "The prism CLI mirrors the analysis tools: prepare, blast, review, refs, map, doctor.",
    lede: "Everything your agent can ask Prism about the repo, you can ask too. Start with npx -y @repo-prism/cli doctor, then prism prepare, prism blast, prism review or prism refs.",
    visual: <DoctorExample />,
    caption: <>Doctor checks the workspace. It does not install agents.</>,
    points: [
      { title: "Check the setup", text: "`doctor`, `index`, `completions`." },
      {
        title: "Assess a change",
        text: "`prepare`, `blast`, `review`, `safe-delete`, `rename`, `test-impact`.",
      },
      {
        title: "Look around",
        text: "`map`, `explain`, `explore`, `refs`, `symbol`, `deps`, `cycles`, `dna`, `health`.",
      },
    ],
  },
} as const;

type Slug = keyof typeof PAGES;

const EXTRA: Record<Slug, ReactNode> = {
  prepare: (
    <Split
      eyebrow="Notes"
      title="Facts it can hand back"
      text={
        <Rich text="The `remember` tool saves a fact on a symbol or path. The next `prepare_change` can return it with that file. There is no `prism remember` command." />
      }
      visual={<PrepareExample />}
    />
  ),
  "blast-radius": (
    <>
      <Split
        eyebrow="Second example"
        title="What a change touches"
        text="“What depends on totals.ts?” Prism counts dependents and the tests that reach the file."
        visual={<BlastExample />}
      />
      <Split
        eyebrow="Tests"
        title="Run the right tests"
        text={
          <Rich text="`prism test-impact` lists the test files that reach a target." />
        }
        visual={<TestsExample />}
      />
    </>
  ),
  guardrails: (
    <>
      <Split
        eyebrow="Rename"
        title="Rename without missing a spot"
        text={
          <Rich text="`prism rename` lists every edit site. Pass `--symbol` when the target is a name, not a path." />
        }
        visual={<RenameExample />}
      />
      <Split
        eyebrow="Delete"
        title="Delete only what nothing uses"
        text={
          <Rich text="`prism safe-delete` names what still imports the file. Prism does not delete it." />
        }
        visual={<SafeDeleteExample />}
      />
    </>
  ),
  receipts: (
    <section className="sec">
      <div className="wrap">
        <h2 className="d3" style={{ marginBottom: 16 }}>
          What a line holds
        </h2>
        <DataTable
          headers={["Field", "Means"]}
          rows={[
            ["tool", "Which Intelligence tool ran"],
            ["counts", "How many items came back"],
            ["truncated", "Whether the list was cut to a limit"],
            ["bytes", "JSON size of the answer, not the source it read"],
          ]}
        />
      </div>
    </section>
  ),
  review: (
    <Split
      eyebrow="Gate"
      title="Exit 1 on a risky branch"
      text={
        <Rich text="`prism review --base origin/main --fail-on high` exits 1 at or above that band, and 0 otherwise." />
      }
      visual={<ReviewExample />}
    />
  ),
  lenses: (
    <section className="sec">
      <div className="wrap">
        <DataTable
          headers={["Band", "Label", "CLI"]}
          rows={[
            [
              <span className="pill ok" key="l">
                low
              </span>,
              "Low Impact",
              "prism blast <file> --fail-on low",
            ],
            [
              <span className="pill warn" key="m">
                mid
              </span>,
              "Moderate Impact",
              "prism review --fail-on mid",
            ],
            [
              <span className="pill bad" key="h">
                high
              </span>,
              "High Impact Potential",
              "prism review --fail-on high",
            ],
          ]}
        />
      </div>
    </section>
  ),
  habits: (
    <Split
      eyebrow="Skill"
      title="Load a skill by name"
      text={
        <Rich text="Ask “prism use” to list skills, or “prism use” plus a name. The tool is `use_skill`." />
      }
      visual={<HabitExample />}
    />
  ),
  cli: (
    <>
      <Split
        eyebrow="Callers"
        title="Who calls this?"
        text={<Rich text="`prism refs` lists references to a symbol." />}
        visual={<RefsExample />}
      />
      <Split
        eyebrow="Map"
        title="A map of your repo"
        text={
          <Rich text="`prism map` prints clusters, landmarks and layers. There is no `prism graph map` command." />
        }
        visual={<MapExample />}
      />
    </>
  ),
};

export function generateStaticParams() {
  return Object.keys(PAGES).map((slug) => ({ slug }));
}

export async function generateMetadata(props: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await props.params;
  const page = PAGES[slug as Slug];
  if (!page) return {};
  return pageMetadata({
    title: page.title.replace(/\*/g, ""),
    description: page.description,
    path: `/product/${slug}`,
  });
}

export default async function ProductPage(props: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await props.params;
  const page = PAGES[slug as Slug];
  if (!page) notFound();
  return (
    <Shell>
      <ProductView
        slug={slug}
        title={page.title}
        lede={page.lede}
        visual={page.visual}
        caption={page.caption}
        points={[...page.points]}
      >
        {EXTRA[slug as Slug]}
      </ProductView>
    </Shell>
  );
}
