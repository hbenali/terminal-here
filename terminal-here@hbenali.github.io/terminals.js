// SPDX-License-Identifier: GPL-2.0-or-later
// Known terminals: how to recognise their windows and how to start one in a directory.
// `ids` are matched (case-insensitively) against the window's app id and WM class.
// A terminal that is not listed here is still started in the right directory by
// setting the launcher's own working directory, which most terminals inherit.

export const TERMINALS = [
    {ids: ['com.gexperts.Tilix', 'tilix'], cmd: 'tilix', args: d => ['-w', d]},
    {ids: ['kitty'], cmd: 'kitty', args: d => ['--directory', d]},
    {ids: ['Alacritty'], cmd: 'alacritty', args: d => ['--working-directory', d]},
    {ids: ['org.wezfurlong.wezterm'], cmd: 'wezterm', args: d => ['start', '--cwd', d]},
    {ids: ['foot'], cmd: 'foot', args: d => ['--working-directory', d]},
    {ids: ['com.mitchellh.ghostty'], cmd: 'ghostty', args: d => [`--working-directory=${d}`]},
    {ids: ['org.gnome.Terminal', 'gnome-terminal-server'], cmd: 'gnome-terminal',
        args: d => [`--working-directory=${d}`]},
    {ids: ['org.gnome.Ptyxis'], cmd: 'ptyxis', args: d => ['--new-window', '--working-directory', d]},
    {ids: ['org.gnome.Console'], cmd: 'kgx', args: d => ['--working-directory', d]},
    {ids: ['org.kde.konsole'], cmd: 'konsole', args: d => ['--workdir', d]},
    {ids: ['xterm', 'XTerm', 'UXTerm'], cmd: 'xterm', args: () => []},
    {ids: ['terminator', 'Terminator'], cmd: 'terminator', args: d => [`--working-directory=${d}`]},
];

const norm = s => (s ?? '').replace(/\.desktop$/, '').toLowerCase();

/** Terminal entry for a window, or null if the window is not a known terminal. */
export function findTerminal(appId, wmClass) {
    const wanted = [norm(appId), norm(wmClass)].filter(Boolean);
    return TERMINALS.find(t => t.ids.some(id => wanted.includes(norm(id)))) ?? null;
}

/** Terminal entry for a command name such as "tilix" or "/usr/bin/kitty". */
export function findByCommand(command) {
    const base = (command ?? '').split('/').pop();
    return TERMINALS.find(t => t.cmd === base) ?? null;
}
