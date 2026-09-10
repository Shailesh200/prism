/** Compose playbook for generating a Prism skill stored globally, not in the repo. */
export const SKILL_PLAYBOOK = "skill";

export function isSkillPlaybook(playbook: string | undefined): boolean {
  return playbook === SKILL_PLAYBOOK;
}
