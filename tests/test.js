// SPDX-License-Identifier: GPL-2.0-or-later
// Run: gjs -m tests/test.js   (needs python3, used to create a pty)
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import {parseStat, snapshot, descendants, shellsUnder, cwdOf, readHints, chooseShell}
    from '../terminal-here@hbenali.github.io/procinfo.js';
import {findTerminal, findByCommand} from '../terminal-here@hbenali.github.io/terminals.js';

let failed = 0;
function eq(name, got, want) {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    print(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
    if (!ok) failed++;
}

// --- parseStat: command names with spaces and parentheses
eq('parseStat plain', parseStat('42 (bash) S 41 42 42 34816 42 4194304 1 0'), {pid: 42, ppid: 41, sid: 42, tty: 34816});
eq('parseStat odd comm', parseStat('7 (a) b (c) S 6 7 7 0 -1 0'), {pid: 7, ppid: 6, sid: 7, tty: 0});
eq('parseStat garbage', parseStat('nonsense'), null);

// --- terminals
eq('Tilix by app id', findTerminal('com.gexperts.Tilix.desktop', 'x')?.cmd, 'tilix');
eq('kitty by wm class', findTerminal(null, 'kitty')?.cmd, 'kitty');
eq('Alacritty case-insensitive', findTerminal('alacritty', null)?.cmd, 'alacritty');
eq('unknown app', findTerminal('org.mozilla.firefox', 'firefox'), null);
eq('by command path', findByCommand('/usr/bin/tilix')?.cmd, 'tilix');
eq('tilix args', findTerminal('com.gexperts.Tilix').args('/tmp'), ['-w', '/tmp']);

// --- chooseShell
const hints = (focus, running = []) => ({focus, running: running.map((pid, i) => ({pid, mtime: 100 - i}))});
eq('one shell wins', chooseShell([5], hints(null)), 5);
eq('no shell', chooseShell([], hints(5)), null);
eq('focus hint', chooseShell([5, 6], hints(6, [5])), 6);
eq('focus hint from other terminal ignored', chooseShell([5, 6], hints(9, [5])), 5);
eq('newest running command', chooseShell([5, 6, 7], hints(null, [9, 7, 5])), 7);
eq('ambiguous -> null', chooseShell([5, 6], hints(null)), null);

// --- descendants on a synthetic table
const t = new Map([[1, {pid: 1, ppid: 0}], [2, {pid: 2, ppid: 1}], [3, {pid: 3, ppid: 2}], [4, {pid: 4, ppid: 1}]]);
eq('descendants', descendants(t, 2).sort(), [2, 3]);

// --- real process tree under a pty: python (the "window") -> child that is session leader on a tty
const dir = GLib.dir_make_tmp('terminal-here-test-XXXXXX');
const sub = GLib.build_filenamev([dir, 'a b']);   // space on purpose
GLib.mkdir_with_parents(sub, 0o755);
const proc = Gio.Subprocess.new(
    ['python3', '-I', '-c',
     'import os,pty,sys\npid,fd=pty.fork()\nif pid==0:\n os.chdir(sys.argv[1]); os.execvp("sleep",["sleep","30"])\nos.waitpid(pid,0)', sub],
    Gio.SubprocessFlags.STDOUT_SILENCE | Gio.SubprocessFlags.STDERR_SILENCE);
const root = parseInt(proc.get_identifier(), 10);
GLib.usleep(700000);
const snap = snapshot();
const shells = shellsUnder(snap, root);
eq('found exactly one shell under the window process', shells.length, 1);
eq('shell cwd follows cd (path with space)', cwdOf(shells[0]), sub);
eq('window process itself is not a shell', shells.includes(root), false);
proc.force_exit();

// --- hints from a directory
const hd = GLib.build_filenamev([dir, 'hints']);
GLib.mkdir_with_parents(hd, 0o755);
GLib.file_set_contents(`${hd}/focus`, '1234\n');
GLib.file_set_contents(`${hd}/run-10`, '');
GLib.usleep(20000);
GLib.file_set_contents(`${hd}/run-11`, '');
const h = readHints(hd);
eq('focus hint read', h.focus, 1234);
eq('running hints newest first', h.running.map(r => r.pid), [11, 10]);
eq('missing hint dir', readHints(`${dir}/nope`), {focus: null, running: []});

GLib.spawn_command_line_sync(`rm -rf "${dir}"`);
print(failed ? `\n${failed} FAILED` : '\nall passed');
imports.system.exit(failed ? 1 : 0);
