import type { CoreEvents, CoreMethods, RendererEvent, RendererMethod } from "../../model/coreApi/coreApi"
import type { ErrorPayload } from "../../model/coreApi/ErrorPayload"
import type { PathsInfo } from "../../model/coreApi/PathsInfo"
import type { ShellPathTarget } from "../../model/coreApi/ShellPathTarget"
import type { ToolId } from "../../model/coreApi/ToolId"
import type { ToolsReport } from "../../model/coreApi/ToolsReport"

export type CoreResult<Value> = { ok: true; value: Value } | { ok: false; error: ErrorPayload }

type CoreStateName = "starting" | "ready" | "restarting" | "unavailable" | "stopped"

export interface CoreState {
    state: CoreStateName
    message: string | null
}

interface DesktopEvents {
    "shell.coreState": CoreState
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

interface SnapshotMapTarget {
    projectId: string
    folderId: string
    snapshotId: string
}

export interface DesktopBridge {
    readonly protocolVersion: number
    request<Method extends RendererMethod>(
        method: Method,
        params: CoreMethods[Method]["params"],
        options?: { operationId: string }
    ): Promise<CoreResult<CoreMethods[Method]["result"]>>
    cancel(operationId: string): Promise<void>
    subscribe<Event extends DesktopEventName>(event: Event, handler: (payload: DesktopEventPayload<Event>) => void): () => void
    pickFolder(options: FolderPickerOptions): Promise<string | null>
    pickFile(options: FilePickerOptions): Promise<string | null>
    chooseToolExecutable(tool: ToolId, options: FilePickerOptions): Promise<CoreResult<ToolsReport | null>>
    chooseStoreRoot(options: FolderPickerOptions): Promise<CoreResult<PathsInfo | null>>
    reveal(target: ShellPathTarget): Promise<CoreResult<null>>
    readSnapshotMap(target: SnapshotMapTarget): Promise<CoreResult<Uint8Array>>
    setWindowBackground(color: string): Promise<CoreResult<null>>
    restartCore(): Promise<CoreResult<null>>
}
