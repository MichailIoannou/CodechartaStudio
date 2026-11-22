DESIGN COMPLETE

# Design status

**Handed over 2026-11-18.** The owner reviewed the design ("good enough for a first implementation")
and released it. Owner decisions made during the review change plan scope; read
`owner-decisions.md` (OD1–OD9) with its plan-impact tables before starting a plan's milestone, and
`journeys.md` for how the screens fit together. Visual reference: `mockups/studio-screens.html`.

States: draft · ready · blocked. An area is "ready" when every element has placement, all states,
wording and data needs. Where a design file and its plan disagree about the interface, the design
file wins (see its "Deviations from the plan").

| Area | File | State | Date | Notes |
|---|---|---|---|---|
| journeys | `journeys.md` | ready | 2026-11-18 | main screen today vs Studio, how projects and commits are picked |
| principles | `00-design-principles.md` | ready | 2026-11-22 | nav bar composition, z-layers, icons, wording for all areas; toast `commands` option (copy blocks); toasts start below the History toolbar (O9); window buttons in the nav bar end, panel z-order rule (O10, O11) |
| 01-desktop-tools | `01-desktop-tools.md` | ready | 2026-11-22 | store-folder rows of plan 03 M6 without restart; app-wide core offline state (OD5); O2 wording; D5 deep link kept; D5 focus fallback (O9); D6/D7 own title bar and window controls (O10) |
| 02-themes | `02-themes.md` | ready | 2026-11-21 | picker (no nav-bar toggle, OD10), dark chrome audit, refreshed metrics bar (OD6) centred between the panels (O7), dependency bar (O6), side panels give way when there is no room (question 12, default applied), blended language share bar (OD7); Rider Day tokens and island panel edges checked against the installed Rider 2026.2; panel give-way refinements (O9) |
| 03-projects | `03-projects.md` | ready | 2026-11-21 | revision 3: project menu with working folder (OD1), project overview page (OD4); cancelled import removes the new project (O5); P12 source files of a project map (O9) |
| 04-history | `04-history.md` | ready | 2026-11-22 | revision 4: committer row, identity copy blocks, conflict / too-large wording, light-theme lanes and selection, not-a-repository actions, Changes tab mock-up (O8); mock-up `mockups/studio-screens.html`; sync and toast placement during merges (O9); Pull enabled without behind count (O11) |
| 05-snapshots | `05-snapshots.md` | ready | 2026-11-21 | revision 3: workspace status element W1 with progress fill (OD2); recycle-bin failure toast and working-folder clean-up (O4); batch and clean-up wording, W1 merge state (O9) |
| 06-compare | `06-compare.md` | ready | 2026-11-22 | entry is the existing Compare tab, no new nav-bar button; chip space priority and Pull requests availability (O8); C2 revision 2: compact chip with dropdown (O9), C10, C11; C10/C11 wording, dropdowns above panels (O11) |
