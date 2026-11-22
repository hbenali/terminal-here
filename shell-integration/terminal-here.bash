# SPDX-License-Identifier: GPL-2.0-or-later
# Optional bash hook for the "Terminal Here" GNOME extension.
#
# Only needed for terminals that host several shells in ONE process (Tilix, GNOME
# Terminal...) when more than one is open: it tells the extension which shell has focus.
# Source it from ~/.bashrc:   . /path/to/terminal-here.bash
#
# VTE reports focus in/out (ESC[I / ESC[O) only while we ask for it, and we ask only at the
# prompt so that programs never see those characters. A terminal running claude, vim, ...
# therefore cannot report focus; it is tracked through a run-PID marker instead.

if [ -n "$VTE_VERSION" ] && [ -n "$PS1" ]; then
    __th_dir="${XDG_RUNTIME_DIR:-/tmp}/terminal-here"
    mkdir -p "$__th_dir"
    __th_focus_in()  { printf '%s\n' "$$" > "$__th_dir/focus"; }
    __th_focus_out() { [ "$(head -n1 "$__th_dir/focus" 2>/dev/null)" = "$$" ] && rm -f "$__th_dir/focus"; }
    __th_run()       { : > "$__th_dir/run-$$"; }          # runs in a subshell, $$ is the shell's pid
    __th_prompt() {
        rm -f "$__th_dir/run-$$"
        local o; o=$(head -n1 "$__th_dir/focus" 2>/dev/null)
        # claim focus if nobody (alive) has it: a terminal that just got its first prompt
        if [ -z "$o" ] || [ "$o" = "$$" ] || ! kill -0 "$o" 2>/dev/null; then __th_focus_in; fi
        printf '\e[?1004h'    # focus reporting on at the prompt only
    }
    bind -x '"\e[I": __th_focus_in'
    bind -x '"\e[O": __th_focus_out'
    PS0='\e[?1004l$(__th_run)'"$PS0"
    PROMPT_COMMAND="__th_prompt${PROMPT_COMMAND:+;$PROMPT_COMMAND}"
    trap '__th_focus_out; rm -f "$__th_dir/run-$$"' EXIT
fi
