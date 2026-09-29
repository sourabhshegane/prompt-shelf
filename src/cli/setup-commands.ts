import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { allAdapters, reservedBy } from '../adapters/index.js';
import { debugLogFile } from '../debug.js';
import { t } from '../i18n/index.js';
import { UserError } from '../errors.js';
import { loadConfig, saveConfig } from '../storage/config.js';
import { configFile, stashDir } from '../storage/paths.js';
import { findRealBinary, shimDir, shimDirOnPath } from '../system/binaries.js';
import { pathHint } from '../system/shims.js';
import { parseHotkey } from '../terminal/keys.js';

// `stash hotkey` and `stash doctor`.

/** Shows the hotkeys, or sets one (`list`: the list hotkey) after checking it can be used. */
export async function runHotkeyCommand(spec: string | undefined, filePath = configFile, list = false): Promise<string> {
  const config = await loadConfig(filePath);
  if (spec === undefined) {
    return list
      ? t('cli.setup.listHotkeyMsg', { hotkey: config.listHotkey })
      : t('cli.setup.bothHotkeysMsg', { hotkey: config.hotkey, listHotkey: config.listHotkey });
  }
  const { label } = parseHotkey(spec);
  const owners = reservedBy(label);
  if (owners.length) throw new UserError(t('cli.setup.hotkeyReservedError', { label, owners: owners.join(', ') }));
  const other = list ? config.hotkey : config.listHotkey;
  const which = list ? 'stash' : 'list';
  if (label === other) throw new UserError(t('cli.setup.hotkeyConflictError', { label, which }));
  await saveConfig(list ? { listHotkey: label } : { hotkey: label }, filePath);
  const whichLabel = list ? t('cli.setup.hotkeySetList') : t('cli.setup.hotkeySetStash');
  return t('cli.setup.hotkeySetMsg', { which: whichLabel, label });
}

/** What's installed where, for bug reports and for fixing a setup. */
export function doctorLines(version: string): string[] {
  const onPath = shimDirOnPath();
  const debugLog = debugLogFile();
  const lines = [
    t('cli.setup.doctorVersion', { version, nodeVersion: process.version, platform: process.platform }),
    t('cli.setup.doctorData', { dir: stashDir }),
    debugLog ? t('cli.setup.doctorDebugOn', { file: debugLog }) : t('cli.setup.doctorDebugOff'),
    t('cli.setup.doctorShimDir', { dir: shimDir }),
    onPath ? t('cli.setup.doctorOnPath_yes') : t('cli.setup.doctorOnPath_no'),
  ];
  for (const { command } of allAdapters()) {
    const shimmed = existsSync(join(shimDir, command)) || existsSync(join(shimDir, `${command}.cmd`));
    const status = shimmed ? t('cli.setup.doctorShimInstalled') : t('cli.setup.doctorShimMissing');
    const binary = findRealBinary(command) ?? t('cli.setup.doctorBinaryNotFound');
    lines.push(t('cli.setup.doctorShimStatus', { command, status, binary }));
  }
  if (!onPath) lines.push(t('cli.setup.doctorPathFix', { hint: pathHint() }));
  return lines;
}
