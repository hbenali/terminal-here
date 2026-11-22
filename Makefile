UUID = terminal-here@hbenali.github.io
ZIP  = dist/$(UUID).shell-extension.zip
DEST = $(HOME)/.local/share/gnome-shell/extensions/$(UUID)

.PHONY: test pack install uninstall
test:
	gjs -m tests/test.js

# Built with zip: `gnome-extensions pack` crashes on some setups. The store compiles the
# schema itself, so gschemas.compiled is not shipped.
pack:
	mkdir -p dist && rm -f $(ZIP)
	cd $(UUID) && zip -qr ../$(ZIP) . -x 'schemas/gschemas.compiled'
	@unzip -l $(ZIP)

install: pack
	mkdir -p $(DEST) && unzip -qo $(ZIP) -d $(DEST)
	glib-compile-schemas $(DEST)/schemas
	@echo "Log out and back in (Wayland), then: gnome-extensions enable $(UUID)"

uninstall:
	rm -rf $(DEST)
