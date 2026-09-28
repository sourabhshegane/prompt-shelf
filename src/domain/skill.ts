/** A skill an agent can use, as listed on the Skills tab. Each adapter finds its agent's skills. */
export interface Skill {
  name: string;
  description: string;
  /** Where it came from, shown next to it in the list. */
  source: 'project' | 'personal' | 'plugin' | 'built-in';
}
