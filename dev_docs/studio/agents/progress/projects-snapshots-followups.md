---
name: Projects and snapshots follow-ups (O9.3, O9.4)
state: complete
version: 1
---

## Goal

Build the designer's answers O9.3 (`design/05-snapshots.md` S4/S7/S8, W1 ACTIVITY) and O9.4
(`design/03-projects.md` P12). Branch `feature/studio-projects-followups` from `feature/studio-next`.

Scope change from the orchestrator: the gate refactors (part 1) were dropped and reverted; the PR-CI
session owns `projects.service.ts`, `openFileDialog.component.ts`, `snapshotView.service.ts` and
`loadFiles.useCase.spec.ts`. None of them is changed here.

## Steps

- [x] 1. `feat(visualization): use the approved snapshot wording and keep a batch's running job visible`
- [x] 2. `feat(visualization): offer to re-link a missing folder and say when a source file is newer`

## As built

- **O9.3** (checked against S4/S7/S8): S7 count text, "N tagged commits: …", the left-out line and the
  S8 keep-count text and disabled primary already matched. Changed:
  - S4 working-tree delete question: "Move the analysis of the working tree on a1b2c3d (4 Nov 09:12) to
    the recycle bin?" (`createdAt`, new `shortDateTime` in `projects/util/folderWording.ts`).
  - S8 partial clean-up: toast (warning) "Moved X of Y analyses to the recycle bin; the rest were kept."
    with Details; nothing moved stays the error toast "… Nothing was deleted."
  - W1 ACTIVITY: the batch line was already collapsed by default; while collapsed, the batch's running
    job row now stays visible above the batch line (design: "the running job's own row stays visible").
- **O9.4 / P12**:
  - Port `LinkedSourceFolder`: `unavailable` carries `relink: (() => void) | null`, `available` carries
    `stateNote: string | null`; `LocalSourceService` passes both on (`FolderUnavailable.relink`,
    `found.stateNote`).
  - Missing folder: instead of the toast, `cc-local-source-actions` opens a small modal with
    `alert alert-warning text-sm` "The folder '<label>' is not available, so its files cannot be opened."
    and `btn btn-sm` "Re-link folder…" (for Show Source and Open in VS Code). The button closes the modal
    and starts P5's re-link flow through `FolderRelinkRequests` (projects, root) and
    `cc-folder-relink-host` (hosts `cc-relink-folder`, one line in `views/codeCharta.component.html`).
    A folder that is not in the active project gets no button.
  - Source view header: `text-xs text-warning` line under the header (`data-testid
    source-viewer-state-note`) — "This is the file as it is in the folder now, not at <short sha>." when
    the shown snapshot's commit differs from the folder's HEAD, "…not as it was analysed." for an
    imported snapshot; nothing when it follows HEAD (commit or working tree) or HEAD is unknown.
    Computed in `LinkedProjectFolders` from the snapshot summary and `GitRepositoryService.statusOf`.
- Tests: Jest for every change; web e2e `projects.e2e.ts` "should offer to re-link a missing project
  folder when its source is asked for". No fake-bridge change.

## Deviations

- P12 says "the source view shows" the alert; with a missing folder there is no file to show, so the
  alert sits in a small modal of its own (like the existing "file not shown" modal) rather than in the
  full-screen source view.
- The state line is a row directly under the source view header, not inside the one-line `h-12` header.

## Open questions for the designer

- Working-tree analysis made on an older HEAD: the line says "not at <its sha>". OK?
- Should the source view of a missing folder rather open the full-screen view with only the alert?
