// SPDX-License-Identifier: GPL-2.0-or-later
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {findTerminal, findByCommand} from './terminals.js';
import {snapshot, shellsUnder, cwdOf, readHints, chooseShell} from './procinfo.js';

export default class TerminalHere extends Extension {
    enable() {
        this._settings = this.getSettings();
        Main.wm.addKeybinding('shortcut', this._settings, Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
            Shell.ActionMode.NORMAL, () => this._open());
    }

    disable() {
        Main.wm.removeKeybinding('shortcut');
        this._settings = null;
    }

    _open() {
        const win = global.display.focus_window;
        const terminal = win ? this._terminalOf(win) : null;

        if (terminal) {
            const dir = this._directoryOf(win) ?? this._fallbackDirectory();
            this._launch([terminal.cmd, ...terminal.args(dir)], dir);
        } else {
            this._openDefault();
        }
    }

    _terminalOf(win) {
        const app = Shell.WindowTracker.get_default().get_window_app(win);
        return findTerminal(app?.get_id(), win.get_wm_class());
    }

    /** Working directory of the shell behind the window, or null if it can't be told. */
    _directoryOf(win) {
        const pid = win.get_pid();
        if (!pid || pid <= 0)
            return null;
        const shells = shellsUnder(snapshot(), pid);
        const shell = chooseShell(shells, readHints());
        const dir = shell === null ? null : cwdOf(shell);
        return dir && GLib.file_test(dir, GLib.FileTest.IS_DIR) ? dir : null;
    }

    _fallbackDirectory() {
        const dir = this._settings.get_string('fallback-directory');
        return dir && GLib.file_test(dir, GLib.FileTest.IS_DIR) ? dir : GLib.get_home_dir();
    }

    _openDefault() {
        let command = this._settings.get_string('default-terminal').trim();
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
        const dir = this._fallbackDirectory();
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
