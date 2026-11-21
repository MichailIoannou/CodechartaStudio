import { ChangeDetectionStrategy, Component, computed, ElementRef, effect, inject, signal, untracked, viewChild } from "@angular/core"
import type { PickedImportFile } from "../../../../model/coreApi/PickedImportFile"
import type { ResolvedCommit } from "../../../../model/coreApi/ResolvedCommit"
import type { SnapshotRef } from "../../../../model/coreApi/SnapshotRef"
import { DesktopBridgeError } from "../../../../util/desktop/desktopResult"
import { OpenFileService, OpenFileTarget, PendingFile } from "../../services/openFile.service"
import { ProjectsService } from "../../services/projects.service"
import { byteSize, fileDate, shortSha } from "../../util/folderWording"
import {
    duplicateProjectNameOf,
    folderIdToTarget,
    folderLabelOf,
    initialTargetOf,
    isContainingFolder,
    isGitFolder,
    sentenceOf,
    summaryOf,
    TargetContext
} from "./openFileTarget"

const NEW_PROJECT_VALUE = ""
const FILE_GONE_CODES: ReadonlySet<string> = new Set(["TOKEN_EXPIRED", "NOT_FOUND"])

@Component({
    selector: "cc-open-file-dialog",
    templateUrl: "./openFileDialog.component.html",
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class OpenFileDialogComponent {
    private readonly openFile = inject(OpenFileService)
    private readonly projects = inject(ProjectsService)
    private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>("dialog")
    private readonly primaryButton = viewChild.required<ElementRef<HTMLButtonElement>>("primary")
    private readonly projectSelect = viewChild<ElementRef<HTMLSelectElement>>("projectSelect")
    private projectCreatedBySearch: string | null = null

    readonly newProjectValue = NEW_PROJECT_VALUE
    readonly shownFile = signal<PendingFile | null>(null)
    readonly target = signal<OpenFileTarget>({ kind: "newProject" })
    readonly isChanging = signal(false)
    readonly resolvedCommit = signal<ResolvedCommit | null>(null)
    readonly isBound = signal(true)
    readonly searchFailure = signal<string | null>(null)
    readonly isOpening = signal(false)
    readonly failure = signal<string | null>(null)
    readonly isFileGone = signal(false)

    readonly picked = computed(() => this.shownFile()?.picked ?? null)
    readonly isImport = computed(() => this.shownFile()?.mode === "import")
    readonly title = computed(() => (this.isImport() ? "Import cc.json" : "Open cc.json"))
    readonly sizeText = computed(() => byteSize(this.picked()?.sizeBytes ?? 0))
    readonly fileDateText = computed(() => fileDate(this.picked()?.fileModifiedAt ?? ""))
    readonly projectOptions = computed(() =>
        [...this.projects.projects()].sort((first, second) => first.name.localeCompare(second.name, undefined, { sensitivity: "base" }))
    )
    readonly targetContext = computed<TargetContext>(() => ({ picked: this.picked(), projects: this.projects.projects() }))
    readonly targetProject = computed(() => summaryOf(this.projects.projects(), this.target()))
    readonly folderOptions = computed(() => this.targetProject()?.folders ?? [])
    readonly targetSentence = computed(() => sentenceOf(this.targetContext(), this.target(), this.isImport()))
    readonly bindingCommit = computed(() =>
        isContainingFolder(this.picked(), this.target()) ? (this.picked()?.hintCommit ?? null) : this.resolvedCommit()
    )
    readonly bindingFolderLabel = computed(() => folderLabelOf(this.targetContext(), this.target()))
    readonly unresolvedHash = computed(() => (this.bindingCommit() ? null : (this.picked()?.commitHint?.hash ?? null)))
    readonly duplicateProjectName = computed(() => duplicateProjectNameOf(this.targetContext(), this.target()))
    readonly primaryLabel = computed(() => {
        if (this.duplicateProjectName() !== null) {
            return "Show existing snapshot"
        }
        return this.isImport() ? "Import" : "Open"
    })
    readonly shortSha = shortSha

    constructor() {
        effect(() => {
            const pending = this.openFile.pending()
            untracked(() => pending && this.start(pending))
        })
    }

    cancel() {
        this.dialog().nativeElement.close()
    }

    forgetFile() {
        this.openFile.dismiss()
        void this.discardProjectCreatedBySearch()
    }

    showChoices() {
        this.isChanging.set(true)
        setTimeout(() => this.projectSelect()?.nativeElement.focus())
    }

    chooseProject(projectId: string) {
        if (projectId === NEW_PROJECT_VALUE) {
            this.changeTarget({ kind: "newProject" })
            return
        }
        const folderId = folderIdToTarget(this.targetContext(), projectId)
        if (folderId) {
            this.changeTarget({ kind: "folder", projectId, folderId })
        }
    }

    chooseFolder(folderId: string) {
        const target = this.target()
        if (target.kind === "folder") {
            this.changeTarget({ ...target, folderId })
        }
    }

    async lookInAnotherFolder() {
        const hash = this.unresolvedHash()
        if (!hash) {
            return
        }
        const target = this.target()
        try {
            const search = await this.openFile.lookInAnotherFolder(target, `Look for commit ${hash} in another folder`)
            if (!search) {
                return
            }
            this.projectCreatedBySearch ??= target.kind === "newProject" && search.target.kind === "folder" ? search.target.projectId : null
            this.target.set(search.target)
            this.resolvedCommit.set(search.commit)
            this.isBound.set(true)
            this.searchFailure.set(search.commit ? null : `Commit ${hash} is not in '${search.folderLabel}' either.`)
        } catch (error) {
            this.failure.set((error as Error).message)
        }
    }

    async pickAgain() {
        const picking = this.openFile.pickAgain()
        this.dialog().nativeElement.close()
        await picking
    }

    async confirm() {
        const picked = this.picked()
        if (!picked || this.isOpening()) {
            return
        }
        this.isOpening.set(true)
        this.failure.set(null)
        const target = this.target()
        let ref: SnapshotRef
        try {
            ref = await this.submit(picked)
        } catch (error) {
            this.showFailure(error)
            return
        } finally {
            this.isOpening.set(false)
        }
        this.keepProjectCreatedBySearchWhenTargeted(target)
        this.dialog().nativeElement.close()
        await this.openFile.show(ref)
    }

    private keepProjectCreatedBySearchWhenTargeted(target: OpenFileTarget) {
        if (target.kind === "folder" && target.projectId === this.projectCreatedBySearch) {
            this.projectCreatedBySearch = null
        }
    }

    private async discardProjectCreatedBySearch() {
        const projectId = this.projectCreatedBySearch
        this.projectCreatedBySearch = null
        if (!projectId) {
            return
        }
        await this.projects.deleteProject(projectId).catch(() => undefined)
    }

    private async submit(picked: PickedImportFile): Promise<SnapshotRef> {
        const target = this.target()
        if (this.duplicateProjectName() !== null && picked.duplicateOf) {
            return picked.duplicateOf
        }
        const bindToCommit = this.isBound() ? (this.bindingCommit()?.commit ?? null) : null
        if (this.isImport() && target.kind === "folder") {
            return this.openFile.importSnapshot({ projectId: target.projectId, folderId: target.folderId }, bindToCommit)
        }
        return this.openFile.open(target, bindToCommit)
    }

    private showFailure(error: unknown) {
        const isFileGone = error instanceof DesktopBridgeError && FILE_GONE_CODES.has(error.code)
        this.isFileGone.set(isFileGone)
        this.failure.set(isFileGone ? "The file is no longer available. Pick it again." : (error as Error).message)
    }

    private start(pending: PendingFile) {
        this.shownFile.set(pending)
        const initial = initialTargetOf(pending)
        this.isChanging.set(false)
        this.isOpening.set(false)
        this.failure.set(null)
        this.isFileGone.set(false)
        this.changeTarget(initial)
        if (!this.dialog().nativeElement.open) {
            this.dialog().nativeElement.showModal()
        }
        setTimeout(() => this.primaryButton().nativeElement.focus())
    }

    private changeTarget(target: OpenFileTarget) {
        this.target.set(target)
        this.resolvedCommit.set(null)
        this.isBound.set(true)
        this.searchFailure.set(null)
        if (!isContainingFolder(this.picked(), target) && isGitFolder(this.projects.projects(), target)) {
            void this.openFile
                .resolveHint(target)
                .then(commit => this.target() === target && this.resolvedCommit.set(commit))
                .catch(() => undefined)
        }
    }
}
