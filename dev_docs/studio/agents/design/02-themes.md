# 02 — Themes: interface design

Plan: `02-themes.md` ("UI", "Error states and edge cases", M1, M5). Principles:
`00-design-principles.md`. **Web and desktop**: themes are the one new feature in both builds.

## Elements

| # | Element | Selector | Lives in | Modelled on |
|---|---|---|---|---|
| T1 | Theme picker | `cc-theme-picker` | Global Configuration dialog, first row | `cc-setting-toggle` row |
| T2 | Quick toggle | `cc-theme-quick-toggle` | nav bar, `navbar-end`, before Settings | `cc-settings-button` |
| T3 | Dark chrome audit | checklist | every existing screen | — |

## T1 Theme picker

**Where.** `globalConfigurationDialog.component.html`, first child of the `flex flex-col gap-6` list,
above "Hide Flattened Buildings".

```
Theme   [ CodeCharta Dark            ▾ ]
          Currently: CodeCharta Light          ← only with "Follow system"
```

- Row `label justify-start gap-4` (same as `cc-setting-toggle`), text `label-text` "Theme", control
  `select select-bordered select-sm w-56` (`data-testid="theme-picker"`). The label is a `<label for>`
  so the name is announced.
- Options in this order, from `THEMES` grouped by `colorScheme`:

```
Dark
  CodeCharta Dark        (default)
  Nord
  One Dark
  VS Dark
  Darcula
Light
  CodeCharta Light
  VS Light
  IntelliJ Light
──
  Follow system
```

  `<optgroup label="Dark">`, `<optgroup label="Light">`, then a plain `<option>` "Follow system".
- Hint under the select when the preference is `system`: `text-xs text-base-content/70` "Currently:
  CodeCharta Dark" (label of the resolved theme; updates live when the OS switches).
- The change applies at once (no Apply button), like the toggles beside it.
- "Reset global settings" includes the theme (plan M1 step 10): reset returns to CodeCharta Dark.
  Its tooltip stays "Reset global settings to their defaults".
- **States.** Unknown stored id → shows "CodeCharta Dark" (it is what is applied). Blocked
  `localStorage` → no visible difference (only the next start may flash). No `matchMedia` → "Follow
  system" resolves to CodeCharta Light and the hint says so.
- **Keyboard.** Native select: Tab to it, arrow keys change the theme immediately (each step applies;
  acceptable, the change is instant and reversible).

**Data.** `ThemeReadStore.preference()`, `.themes`, `.activeTheme()`; `ThemeWriteStore.setPreference`.

## T2 Quick toggle

**Where.** `navBar.component.html`, `navbar-end`, before `cc-settings-button`. Present in both builds.

- `btn btn-ghost btn-sm btn-square`; icon `fa-solid fa-moon` while a light theme is active,
  `fa-solid fa-sun` while a dark theme is active.
- `title` / `aria-label` name the destination: "Switch to light theme (CodeCharta Light)" /
  "Switch to dark theme (CodeCharta Dark)".
- Click sets the preference to CodeCharta Light / CodeCharta Dark (plan). From an editor scheme it
  therefore goes to the CodeCharta theme of the other scheme; the Global Configuration dialog brings
  the editor scheme back. It never sets "Follow system".
- No state other than the two icons; it never disappears or disables.

## T3 Dark chrome audit

Dark is the default and is designed first. Plan 02 M1 replaces hard-coded chrome colours; this list
is what the design expects to look right in `cc-dark` and `cc-light` before M1 is released (found in
the templates on 2026-11-18):

| Place | Today | Expected in both themes |
|---|---|---|
| `bootLoadingIndicator`, `loadingFileProgressSpinner` | `bg-white/80` veil | `bg-base-100/80` (boot screen uses the plan's `--cc-boot-*` colours) |
| `globalConfigurationButton` | `group-hover:bg-[#0374c9]` | `group-hover:bg-secondary` |
| `viewCube/zoomSlider` | Tailwind `text-neutral-500`, `bg-neutral-500` | `text-base-content/60`, `bg-base-content/60` |
| explorer and inspector hosts | `shadow-[…rgba(0,0,0,0.15)]` only | shadow kept, plus `border-base-300` edge so the panel edge shows on dark (see Proposed changes) |
| `markFolderRow` swatch check mark | `text-white` on a user colour | unchanged (sits on the user's colour, not on chrome) |
| `.cc-current-underline`, `.cc-syntax`, `.cc-source` | tokens | unchanged |
| toasts, dialogs, dropdowns, popovers | tokens | unchanged; check the ngx-color popover by eye (plan M1 step 11) |

Every new element of areas 01 and 03–06 already uses tokens only (principles §6), so it follows the
theme without per-theme work. Graph lane colours (area 04) and status badges are checked in each of
the eight themes by the plan's smoke test (M5 step 2) plus an eyeball pass of the History view.

---

## Deviations from the plan

1. **Theme label "IntelliJ Light" vs "Rider Light".** The owner decisions in `README.md` name "Rider
   Light"; plan 02 registers `intellij-light` "IntelliJ Light" and says labels name the palette
   descriptively. The design follows the plan's label (the palette is JetBrains' IntelliJ Light, which
   Rider uses) and asks the owner (open question 9).
2. **Toggle titles name the destination theme** ("Switch to light theme (CodeCharta Light)"), so a user
   on Nord is not surprised to land on CodeCharta Light.
3. **Toggle position** as the plan says, before Settings (the analyses indicator that once sat there
   is now part of the workspace status element, area 05 W1).

## Proposed changes to existing UI (not assumed approved)

1. **Panel edges on dark.** Explorer and inspector separate from the map by a black 15 % shadow, which
   disappears on a dark map. Proposed: add `border-r border-base-300` (explorer) / `border-l
   border-base-300` (inspector), visible in every theme. Without it the panels still work but read as
   floating on the map.
2. **Hard-coded colours in T3** are replaced by tokens as plan 02 M1 step 3 already intends; listed so
   the implementer has the full set.
