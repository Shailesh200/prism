import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import {
  ChatIcon,
  CheckCircleIcon,
  LayersIcon,
  ListIcon,
  ShieldIcon,
  TerminalIcon,
} from "@/components/ui/icons";
import {
  ExampleRow,
  ProductHero,
  ProductPage,
} from "@/components/site/product-page";
import { HabitPair, type Habit } from "@/components/site/demos";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Habits",
  description:
    "A habit is a routine you write once in plain steps. Say its name and your agent runs the steps with its own tools. Prism stores them and hands them over.",
  path: "/product/habits",
});

const DEPLOY: Habit = {
  name: "deploy",
  description: "Build, lint, then ship to staging",
  steps: [
    "shell: npm run build",
    "shell: npm run lint",
    "shell: npm run deploy:staging",
  ],
  output: "checklist",
  agent: "Claude Code",
  reply: "✓ build  ✓ lint  ✓ deploy:staging. Staging is updated.",
};

const EXAMPLES: Array<{ title: string; lede: string; habit: Habit }> = [
  {
    title: "Start your day",
    lede: "Your open PRs and issues, as a standup.",
    habit: {
      name: "start my day",
      steps: [
        "github: list my open PRs and review requests",
        "linear: my in-progress issues",
      ],
      output: "standup",
      agent: "Cursor",
      reply: "Standup: 3 open PRs, 1 review request, 2 issues in progress.",
    },
  },
  {
    title: "Write release notes",
    lede: "Merged PRs since the last tag, grouped into a summary.",
    habit: {
      name: "release notes",
      steps: [
        "github: list PRs merged since the last tag",
        "github: group them by label",
      ],
      output: "summary",
      agent: "Codex",
      reply:
        "Since the last tag: 6 PRs merged. 3 features, 2 fixes, 1 docs change.",
    },
  },
  {
    title: "Sort new issues",
    lede: "New issues and unlabelled bugs in one table.",
    habit: {
      name: "triage inbox",
      steps: [
        "linear: new issues assigned to me",
        "github: open bug reports with no label",
      ],
      output: "table",
      agent: "opencode",
      reply:
        "4 new issues, 2 unlabelled bug reports. Table below, oldest first.",
    },
  },
  {
    title: "Check before you push",
    lede: "Typecheck, tests and a risk check with prism review, as a checklist.",
    habit: {
      name: "pre-push",
      description: "Checks before I push",
      steps: [
        "shell: npm run typecheck",
        "shell: npm test",
        "shell: prism review --base origin/main --fail-on high",
      ],
      output: "checklist",
      agent: "Claude Code",
      reply: "✓ typecheck  ✓ tests  ✓ review: risk below high. Ready to push.",
    },
  },
];

const SKILL_NOTE = (
  <Callout tone="info" title="A habit is a skill">
    <code>prism habit</code> saves each habit as a <code>SKILL.md</code> in{" "}
    <code>~/.prism/skills</code>. Prism doesn’t change your agent’s own skills
    in <code>.claude/skills</code> or <code>.cursor/skills</code>.{" "}
    <code>prism doctor skills</code> warns when a skill names a Prism tool that
    isn’t turned on.
  </Callout>
);

export default function HabitsPage() {
  return (
    <ProductPage slug="habits">
      <ProductHero
        title={
          <>
            Your own routines, <em>for any agent.</em>
          </>
        }
        lede="A habit is a routine you write once in plain steps, like “deploy” or “start my day”. Say its name and your agent runs the steps with its own tools. Prism stores them and hands them over."
        caption={
          <>
            “deploy”: build and lint, then your own deploy script. Save it with{" "}
            <code>prism habit add</code>.
          </>
        }
        pair={<HabitPair habit={DEPLOY} />}
      />

      <section className="sec">
        <Container>
          <div className="grid3 gap-y-6">
            <Card level={2} icon={<ListIcon />} title="Steps in plain words">
              Each step is “source: action”, like{" "}
              <code>shell: npm run build</code> or{" "}
              <code>github: list my open PRs</code>.
            </Card>
            <Card
              level={2}
              icon={<TerminalIcon />}
              title="Your agent runs them"
            >
              With its own tools: your shell, GitHub, Linear and more. If one is
              not connected, it says so and moves on.
            </Card>
            <Card level={2} icon={<CheckCircleIcon />} title="Output your way">
              A standup, summary, checklist, table or free text.
            </Card>
            <Card level={2} icon={<ShieldIcon />} title="Stays local">
              Each habit is a skill file in <code>~/.prism/skills</code>. Prism
              refuses steps that look like secrets.
            </Card>
            <Card level={2} icon={<ChatIcon />} title="Any agent">
              Claude Code, Cursor, Codex and opencode get the same habit through
              Prism’s <code>habits</code> tool.
            </Card>
            <Card level={2} icon={<LayersIcon />} title="Prism runs nothing">
              It stores the steps and hands them to your agent. The commands are
              your own.
            </Card>
          </div>
        </Container>
      </section>

      {EXAMPLES.map((ex, i) => (
        <ExampleRow
          key={ex.habit.name}
          eyebrow="Habit"
          title={ex.title}
          lede={
            <>
              Say “run my {ex.habit.name} habit”. {ex.lede}
            </>
          }
          note={i === EXAMPLES.length - 1 ? SKILL_NOTE : undefined}
        >
          <HabitPair habit={ex.habit} />
        </ExampleRow>
      ))}
    </ProductPage>
  );
}
