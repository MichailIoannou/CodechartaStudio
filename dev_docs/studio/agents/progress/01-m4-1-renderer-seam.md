---
name: 01-M4.1 renderer seam - desktop bridge port and test fake
state: complete
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

- [x] 4.1 Renderer seam and fake

## Notes

### 4.1
- Verified: the bridge keys and result shapes against `preload.js` and `shellActions.js`; the contract
  (`coreApi.ts`: `CORE_PROTOCOL_VERSION`, `RendererMethod`, `RendererEvent`, `CoreMethods`) is the typing source.
- Files in `util/desktop/`: `desktopBridge.ts` (`DesktopBridge`, `CoreResult`, `CoreState`, `DesktopEventName`,
  `DesktopEventPayload`, picker option types), `desktopBridge.token.ts` (`DESKTOP_BRIDGE`, `readDesktopBridge`),
  `desktopEnvironment.service.ts` (`DesktopEnvironment`), `desktopResult.ts` (`DesktopBridgeError`, `valueOrThrow`),
  `desktopEvents.ts` (`observeDesktopEvent`), `desktopBridge.mocks.ts` (`createFakeDesktopBridge`), plus specs.
- Deviations: picker calls take the options 01-M3 settled on (`chooseToolExecutable(tool, options)`,
  `chooseStoreRoot(options)`); plan text corrected. `CoreState` is `{ state, message }` as the shell sends it;
  on the web `coreState()` is `stopped`, on desktop it starts as `starting` and is replaced by the replayed state.
  `shell.coreState` is not in the generated contract, so `DesktopEvents` types it here.
- Fake: answers are keyed by `FakeAnswerKey` (`RendererMethod` | picker/shell call name). Unseeded requests and
  `readSnapshotMap` fail `NOT_FOUND`; pickers answer `null`, other shell calls `{ ok: true, value: null }`.
  `/* istanbul ignore next */` on the factory keeps Istanbul counters out of `toString()` (the coverage run
  would otherwise break "should work when rebuilt from its own source text"). Its default `protocolVersion` is a
  literal 1 (the body cannot import the constant); a spec compares it with `CORE_PROTOCOL_VERSION`.
- Extending the fake (03, 04): add keys to `FakeAnswerKey` / seed fields inside the factory body only (no imports,
  no outer helpers, no `async`/`await` or anything TypeScript would downlevel into helper calls); drive new events
  with `emit`, tests may call `respondWith` / `failWith` afterwards.
- Gates: see the commit; `npm test` baseline red tests (urlExtractor, Node 26) are excluded by the jest config.
