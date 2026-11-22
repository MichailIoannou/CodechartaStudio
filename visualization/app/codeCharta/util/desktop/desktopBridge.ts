import type { CoreEvents, CoreMethods, RendererEvent, RendererMethod } from "../../model/coreApi/coreApi"
import type { ErrorPayload } from "../../model/coreApi/ErrorPayload"
import type { FolderRef } from "../../model/coreApi/FolderRef"
import type { PathsInfo } from "../../model/coreApi/PathsInfo"
import type { PickedFolder } from "../../model/coreApi/PickedFolder"
import type { PickedImportFile } from "../../model/coreApi/PickedImportFile"
import type { ShellPathTarget } from "../../model/coreApi/ShellPathTarget"
import type { SnapshotRef } from "../../model/coreApi/SnapshotRef"
import type { SourceFileParams } from "../../model/coreApi/SourceFileParams"
import type { ToolId } from "../../model/coreApi/ToolId"
import type { ToolsReport } from "../../model/coreApi/ToolsReport"

export type CoreResult<Value> = { ok: true; value: Value } | { ok: false; error: ErrorPayload }

type CoreStateName = "starting" | "ready" | "restarting" | "unavailable" | "stopped"

export interface CoreState {
    state: CoreStateName
    message: string | null
}

export type WindowButton = "minimize" | "maximize" | "close"

export type WindowCommand = "minimize" | "toggleMaximize" | "close"

export interface WindowState {
    platform: string
    /** The title bar the window was opened with; a changed setting applies when the window opens again. */
    usesAppTitleBar: boolean
    savedUseAppTitleBar: boolean
    isMaximized: boolean
    isMaximizable: boolean
    isFullScreen: boolean
    isFocused: boolean
    buttonOrder: WindowButton[]
}

interface TitleBarColors {
    color: string
    symbolColor: string
}

interface DesktopEvents {
    "shell.coreState": CoreState
    "shell.windowState": WindowState
}

export type DesktopEventName = RendererEvent | keyof DesktopEvents

export type DesktopEventPayload<Event extends DesktopEventName> = Event extends RendererEvent
    ? CoreEvents[Event]
    : Event extends keyof DesktopEvents
      ? DesktopEvents[Event]
      : never

interface PickerFilter {
    name: string
    extensions: string[]
}

interface FolderPickerOptions {
    title: string
}

interface FilePickerOptions {
    title: string
    filters?: PickerFilter[]
}

interface SourceFileBytes {
    bytes: Uint8Array
}

interface MapChunk {
    bytes: Uint8Array
    offset: number
    totalBytes: number
}

type MapChunkParams = SnapshotRef & { offset: number; length: number }

type ShellMethods = {
    "projects.pickFolder": { params: FolderPickerOptions; result: PickedFolder | null }
    "projects.readSourceFile": { params: SourceFileParams; result: SourceFileBytes | null }
    "projects.revealFolder": { params: FolderRef; result: null }
    "snapshots.pickImportFile": { params: FilePickerOptions; result: PickedImportFile | null }
    "snapshots.readMapChunk": { params: MapChunkParams; result: MapChunk }
}

type BridgeMethods = Pick<CoreMethods, RendererMethod> & ShellMethods

export type BridgeMethod = keyof BridgeMethods

export type BridgeParams<Method extends BridgeMethod> = BridgeMethods[Method]["params"]

export type BridgeResult<Method extends BridgeMethod> = BridgeMethods[Method]["result"]

export interface DesktopBridge {
    readonly protocolVersion: number
    request<Method extends BridgeMethod>(
        method: Method,
        params: BridgeParams<Method>,
        options?: { operationId: string }
    ): Promise<CoreResult<BridgeResult<Method>>>
    cancel(operationId: string): Promise<void>
    subscribe<Event extends DesktopEventName>(event: Event, handler: (payload: DesktopEventPayload<Event>) => void): () => void
    pickFolder(options: FolderPickerOptions): Promise<string | null>
    pickFile(options: FilePickerOptions): Promise<string | null>
    chooseToolExecutable(tool: ToolId, options: FilePickerOptions): Promise<CoreResult<ToolsReport | null>>
    chooseStoreRoot(options: FolderPickerOptions): Promise<CoreResult<PathsInfo | null>>
    openDroppedFile(file: File): Promise<CoreResult<PickedImportFile | null>>
    reveal(target: ShellPathTarget): Promise<CoreResult<null>>
    setWindowBackground(color: string): Promise<CoreResult<null>>
    setColorScheme(scheme: "light" | "dark" | "system"): Promise<CoreResult<null>>
    restartCore(): Promise<CoreResult<null>>
    windowState(): Promise<CoreResult<WindowState>>
    controlWindow(command: WindowCommand): Promise<CoreResult<null>>
    setUseAppTitleBar(enabled: boolean): Promise<CoreResult<null>>
    reopenWindow(): Promise<CoreResult<null>>
    setTitleBarColors(colors: TitleBarColors): Promise<CoreResult<null>>
}
