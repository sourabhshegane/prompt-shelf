import { describe, it, expect, beforeEach } from 'vitest';
import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { claudeSkills, codexSkills, parseSkillFile, type SkillRoots } from '../../src/core/skills.js';
import { claudeAdapter } from '../../src/adapters/claude.js';
import { codexAdapter } from '../../src/adapters/codex.js';

let home: string;
let repo: string;
let roots: SkillRoots;

async function skill(dir: string, folder: string, body: string) {
  await mkdir(join(dir, folder), { recursive: true });
  await writeFile(join(dir, folder, 'SKILL.md'), body);
}

beforeEach(async () => {
  const root = await mkdtemp(join(tmpdir(), 'skills-'));
  home = join(root, 'home');
  repo = join(root, 'repo');
  await mkdir(join(repo, '.git'), { recursive: true });
  await mkdir(join(repo, 'src'), { recursive: true });
  roots = { home, codexHome: join(home, '.codex'), systemCodexSkills: join(root, 'etc-codex-skills') };
});

describe('parseSkillFile', () => {
  it('reads plain, quoted and block values', () => {
    expect(parseSkillFile('---\nname: pdf\ndescription: "Read PDFs"\n---\n')).toEqual({ name: 'pdf', description: 'Read PDFs' });
    expect(parseSkillFile('---\nname: x\ndescription: |\n  line one\n  line two\nuser-invocable: false\n---')).toEqual({
      name: 'x',
      description: 'line one line two',
      'user-invocable': 'false',
    });
    expect(parseSkillFile('---\nname: y\ndescription: a plain value\n  wrapped onto a second line\n---')).toEqual({
      name: 'y',
      description: 'a plain value wrapped onto a second line',
    });
    expect(parseSkillFile('# No front matter')).toEqual({});
  });
});

describe('findSkills', () => {
  it('finds Claude Code project skills up to the repo root, personal, synced and enabled plugin skills', async () => {
    await skill(join(repo, '.claude', 'skills'), 'deploy', '---\nname: deploy\ndescription: Deploy it\n---');
    await skill(join(home, '.claude', 'skills'), 'humanizer', '---\ndescription: Humanize text\n---');
    await skill(join(home, '.claude', 'skills', 'synced', 'bucket'), 'pdf', '# PDF tools\n');
    await writeFile(join(home, '.claude', 'skills', 'synced', '.bucket-file'), '');
    const plugin = join(home, 'plugins', 'lint');
    await skill(join(plugin, 'skills'), 'check', '---\nname: check\ndescription: Lint\n---');
    await skill(join(home, 'plugins', 'off', 'skills'), 'hidden', '---\nname: hidden\n---');
    await writeFile(
      join(home, '.claude', 'settings.json'),
      JSON.stringify({ enabledPlugins: { 'lint@market': true, 'off@market': false }, skillOverrides: { 'lint:muted': 'off' } }),
    );
    await skill(join(plugin, 'skills'), 'muted', '---\nname: muted\n---');
    await mkdir(join(home, '.claude', 'plugins'), { recursive: true });
    await writeFile(
      join(home, '.claude', 'plugins', 'installed_plugins.json'),
      JSON.stringify({ plugins: { 'lint@market': [{ installPath: plugin }], 'off@market': [{ installPath: join(home, 'plugins', 'off') }] } }),
    );
    const found = claudeSkills(join(repo, 'src'), roots);
    expect(found.map((s) => [s.name, s.source, s.description])).toEqual([
      ['deploy', 'project', 'Deploy it'],
      ['humanizer', 'personal', 'Humanize text'],
      ['pdf', 'personal', 'PDF tools'],
      ['lint:check', 'plugin', 'Lint'],
    ]);
  });

  it('leaves out skills the user cannot invoke or switched off', async () => {
    await skill(join(home, '.claude', 'skills'), 'model-only', '---\nname: model-only\nuser-invocable: false\n---');
    await skill(join(home, '.claude', 'skills'), 'noisy', '---\nname: noisy\n---');
    await skill(join(home, '.claude', 'skills'), 'kept', '---\nname: kept\n---');
    await writeFile(join(home, '.claude', 'settings.json'), JSON.stringify({ skillOverrides: { noisy: 'off' } }));
    expect(claudeSkills(repo, roots).map((s) => s.name)).toEqual(['kept']);
  });

  it('finds skills in symlinked folders, a common way to share them', async () => {
    await skill(join(home, 'shared'), 'breadth', '---\nname: breadth\n---');
    await mkdir(join(home, '.claude', 'skills'), { recursive: true });
    await symlink(join(home, 'shared', 'breadth'), join(home, '.claude', 'skills', 'breadth'));
    expect(claudeSkills(repo, roots).map((s) => s.name)).toEqual(['breadth']);
  });

  it('finds Codex skills in .agents/skills, ~/.agents/skills, the Codex home, machine-wide and built-ins', async () => {
    await skill(join(repo, '.agents', 'skills'), 'repo-skill', '---\nname: repo-skill\n---');
    await skill(join(home, '.agents', 'skills'), 'mine', '---\nname: mine\n---');
    await skill(join(home, '.codex', 'skills'), 'older', '---\nname: older\n---');
    await skill(roots.systemCodexSkills, 'company', '---\nname: company\n---');
    await skill(join(home, '.codex', 'skills', '.system'), 'imagegen', '---\nname: imagegen\n---');
    expect(codexSkills(join(repo, 'src'), roots).map((s) => [s.name, s.source])).toEqual([
      ['repo-skill', 'project'],
      ['mine', 'personal'],
      ['older', 'personal'],
      ['company', 'personal'],
      ['imagegen', 'built-in'],
    ]);
  });

  it('returns nothing when no skill folders exist', () => {
    expect(claudeSkills(repo, roots)).toEqual([]);
    expect(codexSkills(repo, roots)).toEqual([]);
  });
});

describe('skill prompts', () => {
  it('uses each agent’s own way to invoke a skill', () => {
    expect(claudeAdapter.skillPrompt('pdf', false)).toBe('/pdf ');
    expect(claudeAdapter.skillPrompt('pdf', true)).toBe('use the /pdf skill ');
    expect(codexAdapter.skillPrompt('pdf', true)).toBe('$pdf ');
  });
});
