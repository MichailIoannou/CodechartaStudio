import { effect, Injectable, inject, untracked } from "@angular/core"
import type { ChangedFilesFilter } from "../../../model/codeCharta.model"
import type { FileRename } from "../../../model/files/files"
import type { ChangedFilesResult, ResolvedComparison } from "../model/compare.model"
import { CORE_GATEWAY } from "../ports/compareGateways"
import { ChangesReadStore } from "../stores/changes.read.store"
import { CompareStore } from "../stores/compare.store"
import { CompareWriteStore } from "../stores/compare.write.store"

const UNAVAILABLE: ChangedFilesResult = { source: "unavailable", files: [] }
const FALLBACK_ROOT_PATH = "/root"

/** The files git changed between the two compared commits, the map filter that greys out every other file, and the renames the delta matches up. */
@Injectable({ providedIn: "root" })
export class ChangedFilesService {
    private readonly store = inject(CompareStore)
    private readonly changesReadStore = inject(ChangesReadStore)
    private readonly writeStore = inject(CompareWriteStore)
    private readonly core = inject(CORE_GATEWAY)

    constructor() {
        effect(() => {
            const isShowingAComparison = this.store.isActive() || this.store.isShowingNoDifferences()
            if (!isShowingAComparison) {
                untracked(() => this.clear())
            }
        })
    }

    /** Asks the core once the comparison shows; `isCurrent` turns false when another comparison started meanwhile. */
    async load(resolved: ResolvedComparison, isCurrent: () => boolean): Promise<void> {
        this.store.update({ changedFiles: "loading" })
        const result = await this.changedFilesOf(resolved)
        if (!isCurrent()) {
            return
        }
        this.store.update({ changedFiles: result })
        this.setRenames(this.renamesOf(result))
        if (this.changesReadStore.changedFilesFilter() !== null) {
            this.setOnlyChangedFiles(true)
        }
    }

    setOnlyChangedFiles(isOn: boolean): void {
        this.writeStore.setChangedFilesFilter(isOn ? this.filterOfTheList() : null)
    }

    /** Drops what the comparison put on the map. */
    clear(): void {
        if (this.changesReadStore.changedFilesFilter() !== null) {
            this.writeStore.setChangedFilesFilter(null)
        }
        this.setRenames([])
    }

    /** A working-tree or imported side has no commit git could compare: its changes come from the metrics. */
    private changedFilesOf({ base, head }: ResolvedComparison): Promise<ChangedFilesResult> {
        if (base.requested.commit === null || head.requested.commit === null) {
            return Promise.resolve(UNAVAILABLE)
        }
        return this.core
            .changedFiles({
                baseFolder: base.requested.folder,
                headFolder: head.requested.folder,
                base: base.requested.commit,
                head: head.requested.commit
            })
            .catch(() => UNAVAILABLE)
    }

    private filterOfTheList(): ChangedFilesFilter {
        const changedFiles = this.store.state().changedFiles
        if (changedFiles === null || changedFiles === "loading" || changedFiles.source !== "git") {
            return { source: "metrics" }
        }
        const rootPath = this.rootPath()
        return { source: "git", paths: changedFiles.files.map(file => `${rootPath}/${file.path}`) }
    }

    /** An empty list is kept as it is: a new one would rebuild the delta for nothing. */
    private setRenames(renames: FileRename[]): void {
        if (renames.length > 0 || this.changesReadStore.fileRenames().length > 0) {
            this.writeStore.setRenames(renames)
        }
    }

    private renamesOf(result: ChangedFilesResult): FileRename[] {
        const renamedFiles = result.files.filter(file => file.change === "renamed" && file.previousPath !== null)
        if (renamedFiles.length === 0) {
            return []
        }
        const rootPath = this.rootPath()
        return renamedFiles.map(file => ({ from: `${rootPath}/${file.previousPath}`, to: `${rootPath}/${file.path}` }))
    }

    private rootPath(): string {
        return this.changesReadStore.accumulatedData().unifiedMapNode?.path ?? FALLBACK_ROOT_PATH
    }
}
