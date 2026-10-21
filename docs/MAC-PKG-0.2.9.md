# Work Log 0.2.9 Mac PKG

The Mac builder now outputs both DMG and PKG packages for arm64 and x64. PKG opens Apple's Installer and installs Work Log.app in /Applications. It does not launch the app automatically.

The distribution declares macOS 13.5 as its minimum, specifies the architecture, asks users to close the existing app, and disables bundle relocation. The payload contains only the application; there are no privileged preinstall/postinstall scripts and no personal journal data.

Verification on macOS 15 ARM and Intel runners:

- Build and integrity-check the native application.
- Build the component and product packages with Apple's tools.
- Install the finished PKG using the native installer, then reinstall it.
- Check installed version and application integrity.
- Run the installed application with isolated data; save a record and a task, exercise partial deadlines and appearance, export PDF.
- Compare downloaded packages with their SHA-256 checksums before desktop delivery.

Evidence: https://github.com/Benjamin-can-fly/I-swear-I-did-work/actions/runs/39546999145

The applications have ad-hoc integrity signatures. Neither PKG has a Developer ID Installer signature or notarization. These tests do not claim that Gatekeeper will open a downloaded copy without confirmation, or that every supported macOS version was tested.

The existing DMG files and local rollback entry are preserved.
