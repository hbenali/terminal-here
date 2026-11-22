// SPDX-License-Identifier: GPL-2.0-or-later
// Finds the shell behind a terminal window by walking /proc, plus the optional hints
// written by shell-integration/terminal-here.bash for terminals that host many ttys.
//
// All file access is asynchronous and cancellable so nothing blocks the shell's main loop.

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

Gio._promisify(Gio.File.prototype, 'load_contents_async', 'load_contents_finish');
Gio._promisify(Gio.File.prototype, 'enumerate_children_async', 'enumerate_children_finish');
Gio._promisify(Gio.File.prototype, 'query_info_async', 'query_info_finish');
Gio._promisify(Gio.FileEnumerator.prototype, 'next_files_async', 'next_files_finish');
Gio._promisify(Gio.FileEnumerator.prototype, 'close_async', 'close_finish');

const decoder = new TextDecoder();
const PRIORITY = GLib.PRIORITY_DEFAULT;

/** True if the error is a cancellation, which callers must not swallow. */
export function isCancelled(e) {
    return e instanceof GLib.Error && e.matches(Gio.io_error_quark(), Gio.IOErrorEnum.CANCELLED);
}

async function readText(path, cancellable) {
    const [bytes] = await Gio.File.new_for_path(path).load_contents_async(cancellable);
    return decoder.decode(bytes);
}

/** Infos of every entry of a directory. */
async function listDir(path, attributes, cancellable) {
    const dir = await Gio.File.new_for_path(path).enumerate_children_async(
        attributes, Gio.FileQueryInfoFlags.NONE, PRIORITY, cancellable);
    const infos = [];
    try {
        for (;;) {
            const batch = await dir.next_files_async(256, PRIORITY, cancellable);
            if (batch.length === 0)
                break;
            infos.push(...batch);
        }
    } finally {
        dir.close_async(PRIORITY, null).catch(() => {});
    }
    return infos;
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
export async function snapshot(cancellable = null) {
    const procs = new Map();
    let infos;
    try {
        infos = await listDir('/proc', 'standard::name', cancellable);
    } catch (e) {
        if (isCancelled(e))
            throw e;
        return procs;
    }
    const names = infos.map(i => i.get_name()).filter(n => /^\d+$/.test(n));
    await Promise.all(names.map(async name => {
        try {
            const st = parseStat(await readText(`/proc/${name}/stat`, cancellable));
            if (st)
                procs.set(st.pid, st);
        } catch (e) {
            if (isCancelled(e))
                throw e;
            // process exited while scanning
        }
    }));
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

/** Working directory of a process (the target of /proc/PID/cwd), or null. */
export async function cwdOf(pid, cancellable = null) {
    try {
        const info = await Gio.File.new_for_path(`/proc/${pid}/cwd`).query_info_async(
            'standard::symlink-target', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, PRIORITY, cancellable);
        return info.get_symlink_target();
    } catch (e) {
        if (isCancelled(e))
            throw e;
        return null;
    }
}

/** True if path exists and is a directory. */
export async function isDirectory(path, cancellable = null) {
    if (!path)
        return false;
    try {
        const info = await Gio.File.new_for_path(path).query_info_async(
            'standard::type', Gio.FileQueryInfoFlags.NONE, PRIORITY, cancellable);
        return info.get_file_type() === Gio.FileType.DIRECTORY;
    } catch (e) {
        if (isCancelled(e))
            throw e;
        return false;
    }
}

/**
 * Hints from the shell hook, in $XDG_RUNTIME_DIR/terminal-here:
 *   focus      pid of the shell whose terminal last reported focus-in
 *   run-PID    exists while that shell runs a command (newest mtime first)
 */
export async function readHints(
    dir = GLib.build_filenamev([GLib.get_user_runtime_dir(), 'terminal-here']), cancellable = null) {
    const hints = {focus: null, running: []};
    try {
        const n = parseInt((await readText(`${dir}/focus`, cancellable)).trim(), 10);
        hints.focus = Number.isNaN(n) ? null : n;
    } catch (e) {
        if (isCancelled(e))
            throw e;
        // no hook installed
    }
    try {
        const infos = await listDir(dir, 'standard::name,time::modified,time::modified-usec', cancellable);
        for (const info of infos) {
            const m = /^run-(\d+)$/.exec(info.get_name());
            if (m) {
                hints.running.push({
                    pid: parseInt(m[1], 10),
                    mtime: info.get_attribute_uint64('time::modified') * 1e6 +
                        info.get_attribute_uint32('time::modified-usec'),
                });
            }
        }
    } catch (e) {
        if (isCancelled(e))
            throw e;
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
