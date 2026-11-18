---
name: 01-M4.1 renderer seam - desktop bridge port and test fake
state: progress
version: 1
---

## Goal

Give the Angular app a typed `DesktopBridge` port (present only in Electron), a desktop environment
service that follows the core state, result and event helpers, and an in-memory fake for Jest and the web
e2e suite (plan 01 section 3.12, section 4 task 4.1). No visible interface.

## Tasks

Copied from `01-core-and-desktop-shell.md`, section 4, M4 task 4.1 (tests to write first are listed there).
The bridge as built by 01-M3 (`01-m3-electron-shell.md`) is the ground truth: keys `protocolVersion`,
`request`, `cancel`, `subscribe`, `pickFolder`, `pickFile`, `chooseToolExecutable`, `chooseStoreRoot`,
`reveal`, `readSnapshotMap`, `setWindowBackground`, `restartCore`; `request` resolves `{ ok, value | error }`;
`subscribe("shell.coreState", …)` delivers the current state first.

### 4.1 `util/desktop/*`: token, environment service, result, events, fake

## Steps

- [ ] 4.1 Renderer seam and fake

## Notes

