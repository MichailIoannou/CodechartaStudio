import { effect, Injectable, inject, untracked } from "@angular/core"
import type { ChangedFilesFilter } from "../../../model/codeCharta.model"
import type { ChangedFilesResult, ResolvedComparison } from "../model/compare.model"
import { CORE_GATEWAY } from "../ports/compareGateways"
import { ChangesReadStore } from "../stores/changes.read.store"
import { CompareStore } from "../stores/compare.store"
import { CompareWriteStore } from "../stores/compare.write.store"

const UNAVAILABLE: ChangedFilesResult = { source: "unavailable", files: [] }
const FALLBACK_ROOT_PATH = "/root"

/** The files git changed between the two compared commits, and the map filter that greys out every other file. */
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
                untracked(() => this.clearFilter())
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
        if (this.changesReadStore.changedFilesFilter() !== null) {
            this.setOnlyChangedFiles(true)
        }
    }

    setOnlyChangedFiles(isOn: boolean): void {
        this.writeStore.setChangedFilesFilter(isOn ? this.filterOfTheList() : null)
    }

    clearFilter(): void {
        if (this.changesReadStore.changedFilesFilter() !== null) {
            this.writeStore.setChangedFilesFilter(null)
        }
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
        const rootPath = this.changesReadStore.accumulatedData().unifiedMapNode?.path ?? FALLBACK_ROOT_PATH
        return { source: "git", paths: changedFiles.files.map(file => `${rootPath}/${file.path}`) }
    }
}
