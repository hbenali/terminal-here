// SPDX-License-Identifier: GPL-2.0-or-later
// Finds the shell behind a terminal window by walking /proc, plus the optional hints
// written by shell-integration/terminal-here.bash for terminals that host many ttys.

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

const decoder = new TextDecoder();

function readText(path) {
    const [ok, bytes] = GLib.file_get_contents(path);
    return ok ? decoder.decode(bytes) : null;
}

/** Parse /proc/PID/stat. The command name is parenthesised and may contain spaces. */
export function parseStat(text) {
    const end = text.lastIndexOf(')');
    if (end < 0)
        return null;
    const f = text.slice(end + 2).split(' ');   // f[0]=state f[1]=ppid f[3]=session f[4]=tty_nr
    const pid = parseInt(text.slice(0, text.indexOf(' ')), 10);
    const ppid = parseInt(f[1], 10), sid = parseInt(f[3], 10), tty = parseInt(f[4], 10);
    if ([pid, ppid, sid, tty].some(Number.isNaN))
        return null;
    return {pid, ppid, sid, tty};
}

/** Map pid -> {pid, ppid, sid, tty} for every process we can read. */
export function snapshot() {
    const procs = new Map();
    let dir;
    try {
        dir = Gio.File.new_for_path('/proc').enumerate_children(
            'standard::name', Gio.FileQueryInfoFlags.NONE, null);
    } catch (e) {
        return procs;
    }
    let info;
    while ((info = dir.next_file(null)) !== null) {
        const name = info.get_name();
        if (!/^\d+$/.test(name))
            continue;
        try {
            const st = parseStat(readText(`/proc/${name}/stat`) ?? '');
            if (st)
                procs.set(st.pid, st);
        } catch (e) {
            // process exited while scanning
        }
    }
    dir.close(null);
    return procs;
}

/** The root pid and everything below it. */
export function descendants(procs, root) {
    const kids = new Map();
    for (const p of procs.values()) {
        if (!kids.has(p.ppid))
            kids.set(p.ppid, []);
        kids.get(p.ppid).push(p.pid);
    }
    const out = [];
    const stack = [root];
    while (stack.length) {
        const pid = stack.pop();
        if (out.includes(pid))
            continue;
        out.push(pid);
        stack.push(...(kids.get(pid) ?? []));
    }
    return out;
}

/** Shells below a window process: session leaders that own a tty (one per terminal tab). */
export function shellsUnder(procs, root) {
    return descendants(procs, root).filter(pid => {
        const p = procs.get(pid);
        return p && p.pid === p.sid && p.tty !== 0;
    });
}

/** Working directory of a process, or null. */
export function cwdOf(pid) {
    try {
        return GLib.file_read_link(`/proc/${pid}/cwd`);
    } catch (e) {
        return null;
    }
}

/**
 * Hints from the shell hook, in $XDG_RUNTIME_DIR/terminal-here:
 *   focus      pid of the shell whose terminal last reported focus-in
 *   run-PID    exists while that shell runs a command (newest mtime first)
 */
export function readHints(dir = GLib.build_filenamev([GLib.get_user_runtime_dir(), 'terminal-here'])) {
    const hints = {focus: null, running: []};
    try {
        const n = parseInt((readText(`${dir}/focus`) ?? '').trim(), 10);
        hints.focus = Number.isNaN(n) ? null : n;
    } catch (e) {
        // no hook installed
    }
    try {
        const en = Gio.File.new_for_path(dir).enumerate_children(
            'standard::name,time::modified,time::modified-usec', Gio.FileQueryInfoFlags.NONE, null);
        let info;
        while ((info = en.next_file(null)) !== null) {
            const m = /^run-(\d+)$/.exec(info.get_name());
            if (m) {
                hints.running.push({
                    pid: parseInt(m[1], 10),
                    mtime: info.get_attribute_uint64('time::modified') * 1e6 +
                        info.get_attribute_uint32('time::modified-usec'),
                });
            }
        }
        en.close(null);
    } catch (e) {
        // no hook installed
    }
    hints.running.sort((a, b) => b.mtime - a.mtime);
    return hints;
}

/**
 * Pick the shell of the focused terminal among the shells under its window.
 * One shell: that one. Several: the one that reported focus, else the one that most
 * recently started a command (a terminal running claude/vim never reports focus).
 */
export function chooseShell(shells, hints) {
    if (shells.length === 1)
        return shells[0];
    if (shells.length === 0)
        return null;
    if (hints.focus !== null && shells.includes(hints.focus))
        return hints.focus;
    const running = hints.running.find(r => shells.includes(r.pid));
    return running ? running.pid : null;
}
