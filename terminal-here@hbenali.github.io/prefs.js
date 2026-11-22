// SPDX-License-Identifier: GPL-2.0-or-later
import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class TerminalHerePreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const page = new Adw.PreferencesPage();
        const group = new Adw.PreferencesGroup({
            title: 'Terminal Here',
            description: 'Open a new terminal in the focused terminal\'s directory.',
        });
        page.add(group);

        const shortcut = new Adw.EntryRow({
            title: 'Shortcut (e.g. <Control><Alt>t)',
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
    }
}
