# Terminal Here

A GNOME Shell extension that gives GNOME the KDE behaviour of **opening a new terminal in the
directory of the terminal you are in**.

Press <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>T</kbd> (configurable):

- a terminal is focused: a new terminal of the same kind opens in that terminal's working directory;
- anything else is focused: your default terminal opens in your home directory.

## How it works

The extension owns the shortcut, so it knows which window has focus. For a terminal window it
finds the shells below the window's process in `/proc` and reads the shell's working directory
(`/proc/PID/cwd`). No shell setup is needed when the window holds a single terminal, which is always
the case for terminals that run one process per window (kitty, Alacritty, WezTerm, foot, xterm...).

Terminals that host many tabs and windows in one process (**Tilix**, GNOME Terminal) share one process
id, so with several terminals open the extension cannot tell which shell is the focused one. For those,
source the optional hook from `~/.bashrc`:

```sh
. /path/to/shell-integration/terminal-here.bash
```

The hook uses VTE's focus reporting to tell the extension which shell has focus, and a marker file for
terminals running a full-screen program (`claude`, `vim`...) that capture focus events themselves.
Without the hook the extension falls back to the home directory when it cannot tell which terminal you
are in.

Recognised terminals: Tilix, kitty, Alacritty, WezTerm, foot, Ghostty, GNOME Terminal, Ptyxis,
Console, Konsole, xterm, Terminator (`terminals.js`).

## Install

```sh
make install          # builds dist/*.zip and installs it for the current user
```

Log out and back in once (Wayland only discovers new extensions at login), then
`gnome-extensions enable terminal-here@hbenali.github.io`.

If you already bound <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>T</kbd> as a custom shortcut in Settings,
remove it, or change this extension's shortcut in its preferences.

## Settings

`gnome-extensions prefs terminal-here@hbenali.github.io`: shortcut, default terminal command (empty
means the system default), fallback directory (empty means home).

## Limitations

- Terminals running in a container or Flatpak, and Ptyxis (its shells are children of a host agent, not
  of the window) cannot be inspected: they open in the fallback directory.
- With several Tilix/GNOME Terminal terminals open and no shell hook, the directory is ambiguous and the
  fallback is used. Only bash is covered by the hook.
- With several terminals each running a full-screen program, the one that started its command most
  recently is chosen.
- Tested in a running GNOME Shell on version 50 only (Fedora 44). Versions 45 to 49 are declared
  because the extension API is the same since GNOME 45; the unit tests pass on their GJS runtimes
  (1.78 to 1.86), but the extension has not been run inside those shells. Reports welcome.
- GNOME 44 and older use the legacy extension API and are not supported.

## Development

```sh
make test     # gjs -m tests/test.js, needs python3
make pack
```

GPL-2.0-or-later.
