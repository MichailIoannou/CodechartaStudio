---
name: 03-M0 spikes for projects and the managed store
state: progress
version: 1
---

## Goal

Answer the unknowns plan 03 rests on before the store core is written, and reconcile the plan's
"Required from plan 01" list against plan 01 as implemented (overview section 10). No production code.

## Tasks

Copied from `03-projects-and-managed-store.md`, Milestones, M0, plus the section 10 reconciliation.

### 0. Reconcile "Required from plan 01" with plan 01 as implemented (M1, M2; M3 once merged)
### 1. 64 MiB `Uint8Array` from `ipcMain.handle` (needs the 01-M3 shell)
### 2. `setFiles({ value: [] })` with the router outlet swapped, then load again (renderer)
### 3. Scratch Rust test: `trash` crate on a directory in the data folder; `rename` over an open file;
the exclusive-lock crate across two processes; the seven git commands of section 2 against a normal
clone, a shallow clone, a subfolder and a non-repo; `ts-rs` for `#[ts(type = "Uint8Array")]` and
validated newtypes. Plan says Windows; Linux results first, Windows open for the owner.
### 4. `webUtils.getPathForFile(file)` in the sandboxed preload on drag and drop (needs the 01-M3 shell)

## Steps

- [ ] 0. Reconciliation written
- [ ] 1. IPC 64 MiB transfer
- [ ] 2. Unload all files and load again
- [ ] 3. Scratch Rust items (Linux)
- [ ] 3. Scratch Rust items (Windows) — needs owner hardware
- [ ] 4. Drag and drop path

## Notes

