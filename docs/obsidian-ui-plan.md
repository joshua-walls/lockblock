# Obsidian UI ideas

Track small Obsidian API affordances that fit Lockblock without turning it into a dashboard-heavy plugin.

## Planned

- [x] Status bar item: show Lockblock setup/locked/unlocked state, with click action.
- [x] Context menu actions for selected `lockblock` fences: reveal, copy, encrypt, decrypt to raw.
- [ ] Optional ribbon action for lock/unlock/setup. Current read: probably skip because status bar already covers it and users can hide ribbon.
- [ ] Consider custom side view only if Lockblock needs a real audit/dashboard surface.

## Notes

- Icon pass applied to status bar, editor context menu items, and reading-view card actions.
- Status bar custom items are desktop-only in Obsidian, so commands/settings remain the mobile path.
- Declarative settings require Obsidian 1.13.0+, while Lockblock currently targets 1.11.4. Keep imperative settings unless min app version changes or dual support is added.
