// SPDX-License-Identifier: GPL-2.0-or-later
import Adw from 'gi://Adw';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class TerminalHerePreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const page = new Adw.PreferencesPage();
        const group = new Adw.PreferencesGroup({
            title: 'Terminal Here',
            // Row titles and descriptions are Pango markup, so literal "<" must be escaped.
            description: GLib.markup_escape_text(
                'Open a new terminal in the focused terminal\'s directory. ' +
                'Shortcut format: <Control><Alt>t', -1),
        });
        page.add(group);

        const shortcut = new Adw.EntryRow({
            title: 'Shortcut',
            text: settings.get_strv('shortcut')[0] ?? '',
            show_apply_button: true,
        });
        shortcut.connect('apply', () => {
            const text = shortcut.get_text().trim();
            const [ok, key] = Gtk.accelerator_parse(text);
            if (ok && key !== 0) {
                settings.set_strv('shortcut', [text]);
                shortcut.remove_css_class('error');
            } else {
                shortcut.add_css_class('error');
            }
        });
        group.add(shortcut);

        const terminal = new Adw.EntryRow({
            title: 'Default terminal command (empty = system default)',
            text: settings.get_string('default-terminal'),
            show_apply_button: true,
        });
        terminal.connect('apply', () => settings.set_string('default-terminal', terminal.get_text().trim()));
        group.add(terminal);

        const fallback = new Adw.EntryRow({
            title: 'Fallback directory (empty = home)',
            text: settings.get_string('fallback-directory'),
            show_apply_button: true,
        });
        fallback.connect('apply', () => settings.set_string('fallback-directory', fallback.get_text().trim()));
        group.add(fallback);

        window.add(page);
        // Don't open with the first entry focused and its text selected.
        GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            window.set_focus(null);
            return GLib.SOURCE_REMOVE;
        });
    }
}
