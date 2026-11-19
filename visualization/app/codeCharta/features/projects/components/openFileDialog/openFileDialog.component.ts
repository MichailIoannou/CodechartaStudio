import { ChangeDetectionStrategy, Component, computed, ElementRef, effect, inject, signal, untracked, viewChild } from "@angular/core"
import type { PickedImportFile } from "../../../../model/coreApi/PickedImportFile"
import type { ProjectSummary } from "../../../../model/coreApi/ProjectSummary"
import type { ResolvedCommit } from "../../../../model/coreApi/ResolvedCommit"
import type { SnapshotRef } from "../../../../model/coreApi/SnapshotRef"
import { DesktopBridgeError } from "../../../../util/desktop/desktopResult"
import { OpenFileService, OpenFileTarget, PendingFile } from "../../services/openFile.service"
import { ProjectsService } from "../../services/projects.service"
import { byteSize, fileDate, shortSha } from "../../util/folderWording"

const NEW_PROJECT_VALUE = ""
const FILE_GONE_CODES: ReadonlySet<string> = new Set(["TOKEN_EXPIRED", "NOT_FOUND"])

interface TargetSentence {
    kind: "newProject" | "existing" | "import"
    project: string
    folder: string
    path: string
}

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
    readonly targetProject = computed(() => this.summaryOf(this.target()))
    readonly folderOptions = computed(() => this.targetProject()?.folders ?? [])
    readonly targetSentence = computed(() => this.sentenceOf(this.target()))
    readonly bindingCommit = computed(() =>
        this.isContainingFolder(this.target()) ? (this.picked()?.hintCommit ?? null) : this.resolvedCommit()
    )
    readonly bindingFolderLabel = computed(() => this.folderLabelOf(this.target()))
    readonly unresolvedHash = computed(() => (this.bindingCommit() ? null : (this.picked()?.commitHint?.hash ?? null)))
    readonly duplicateProjectName = computed(() => this.duplicateProjectNameOf(this.picked(), this.target()))
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
        const project = this.projects.projects().find(candidate => candidate.id === projectId)
        const existing = this.picked()?.existingTarget
        const folderId =
            existing?.projectId === projectId
                ? existing.folderId
                : (project?.folders.find(folder => folder.role === "primary") ?? project?.folders[0])?.id
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
        const existing = pending.picked.existingTarget
        const initial: OpenFileTarget = pending.importTarget
            ? { kind: "folder", ...pending.importTarget }
            : existing
              ? { kind: "folder", projectId: existing.projectId, folderId: existing.folderId }
              : { kind: "newProject" }
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
        if (!this.isContainingFolder(target) && target.kind === "folder" && this.isGitFolder(target)) {
            void this.openFile
                .resolveHint(target)
                .then(commit => this.target() === target && this.resolvedCommit.set(commit))
                .catch(() => undefined)
        }
    }

    private isContainingFolder(target: OpenFileTarget): boolean {
        const existing = this.picked()?.existingTarget
        if (target.kind === "newProject") {
            return true
        }
        return existing?.projectId === target.projectId && existing.folderId === target.folderId
    }

    private isGitFolder(target: OpenFileTarget): boolean {
        const folder = this.summaryOf(target)?.folders.find(candidate => target.kind === "folder" && candidate.id === target.folderId)
        return folder?.kind === "git" && folder.status === "ok"
    }

    private summaryOf(target: OpenFileTarget): ProjectSummary | null {
        return target.kind === "folder" ? (this.projects.projects().find(project => project.id === target.projectId) ?? null) : null
    }

    private folderLabelOf(target: OpenFileTarget): string {
        if (target.kind === "newProject") {
            return this.picked()?.containingFolder.suggestedName ?? ""
        }
        return this.summaryOf(target)?.folders.find(folder => folder.id === target.folderId)?.label ?? ""
    }

    private sentenceOf(target: OpenFileTarget): TargetSentence {
        const picked = this.picked()
        if (target.kind === "newProject") {
            const containing = picked?.containingFolder
            return { kind: "newProject", project: containing?.suggestedName ?? "", folder: "", path: containing?.path ?? "" }
        }
        const project = this.summaryOf(target)?.name ?? picked?.existingTarget?.projectName ?? ""
        return { kind: this.isImport() ? "import" : "existing", project, folder: this.folderLabelOf(target), path: "" }
    }

    private duplicateProjectNameOf(picked: PickedImportFile | null, target: OpenFileTarget): string | null {
        const duplicate = picked?.duplicateOf
        if (!duplicate || target.kind !== "folder" || target.projectId !== duplicate.projectId) {
            return null
        }
        const summary = this.projects.projects().find(project => project.id === duplicate.projectId)
        return summary?.name ?? picked.existingTarget?.projectName ?? ""
    }
}
