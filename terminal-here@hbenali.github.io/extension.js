// SPDX-License-Identifier: GPL-2.0-or-later
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {findTerminal, findByCommand} from './terminals.js';
import {snapshot, shellsUnder, cwdOf, isDirectory, readHints, chooseShell, isCancelled}
    from './procinfo.js';

export default class TerminalHere extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._cancellable = new Gio.Cancellable();
        this._busy = false;
        Main.wm.addKeybinding('shortcut', this._settings, Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
            Shell.ActionMode.NORMAL, () => this._open());
    }

    disable() {
        Main.wm.removeKeybinding('shortcut');
        this._cancellable?.cancel();
        this._cancellable = null;
        this._settings = null;
    }

    _open() {
        if (this._busy)
            return;
        this._busy = true;
        this._openAsync()
            .catch(e => {
                if (!isCancelled(e))
                    console.error(`terminal-here: ${e.message}\n${e.stack}`);
            })
            .finally(() => {
                this._busy = false;
            });
    }

    async _openAsync() {
        const cancellable = this._cancellable;
        // Everything that depends on the focus or on settings is read before the first await.
        const win = global.display.focus_window;
        const terminal = win ? this._terminalOf(win) : null;
        const pid = win ? win.get_pid() : 0;
        const fallback = this._settings.get_string('fallback-directory');
        const defaultTerminal = this._settings.get_string('default-terminal').trim();

        if (terminal) {
            const dir = (pid > 0 ? await this._directoryOf(pid, cancellable) : null) ??
                await this._fallbackDirectory(fallback, cancellable);
            if (cancellable.is_cancelled())
                return;
            this._launch([terminal.cmd, ...terminal.args(dir)], dir);
        } else {
            const dir = await this._fallbackDirectory(fallback, cancellable);
            if (cancellable.is_cancelled())
                return;
            this._openDefault(defaultTerminal, dir);
        }
    }

    _terminalOf(win) {
        const app = Shell.WindowTracker.get_default().get_window_app(win);
        return findTerminal(app?.get_id(), win.get_wm_class());
    }

    /** Working directory of the shell behind the window, or null if it can't be told. */
    async _directoryOf(pid, cancellable) {
        const shells = shellsUnder(await snapshot(cancellable), pid);
        const shell = chooseShell(shells, await readHints(undefined, cancellable));
        const dir = shell === null ? null : await cwdOf(shell, cancellable);
        return await isDirectory(dir, cancellable) ? dir : null;
    }

    async _fallbackDirectory(configured, cancellable) {
        return await isDirectory(configured, cancellable) ? configured : GLib.get_home_dir();
    }

    _openDefault(configured, dir) {
        let command = configured;
        if (!command) {
            const sys = new Gio.Settings({schema_id: 'org.gnome.desktop.default-applications.terminal'});
            command = sys.get_string('exec').trim();
        }
        if (!command)
            command = 'xdg-terminal-exec';

        let argv;
        try {
            [, argv] = GLib.shell_parse_argv(command);
        } catch (e) {
            console.error(`terminal-here: cannot parse terminal command "${command}": ${e.message}`);
            return;
        }
        const known = findByCommand(argv[0]);
        if (known && argv.length === 1)
            argv = [argv[0], ...known.args(dir)];
        this._launch(argv, dir);
    }

    _launch(argv, cwd) {
        try {
            const launcher = new Gio.SubprocessLauncher({
                flags: Gio.SubprocessFlags.STDOUT_SILENCE | Gio.SubprocessFlags.STDERR_SILENCE,
            });
            launcher.set_cwd(cwd);
            launcher.spawnv(argv);
        } catch (e) {
            Main.notifyError('Terminal Here', `Could not start ${argv[0]}: ${e.message}`);
        }
    }
}
