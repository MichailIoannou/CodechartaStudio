import { NgTemplateOutlet } from "@angular/common"
import {
    AfterViewInit,
    ChangeDetectionStrategy,
    Component,
    computed,
    ElementRef,
    effect,
    inject,
    signal,
    untracked,
    viewChild
} from "@angular/core"
import type { AnalysisTarget } from "../../../../model/coreApi/AnalysisTarget"
import type { ProjectFolder } from "../../../../model/coreApi/ProjectFolder"
import type { SnapshotSummary } from "../../../../model/coreApi/SnapshotSummary"
import { GitRepositoryService, isGitStatus } from "../../../gitHistory/facade"
import {
    byteSize,
    fileDate,
    longDate,
    MoveSnapshotDialogComponent,
    ProjectsFacade,
    relativeTime,
    shortDate
} from "../../../projects/facade"
import { BatchAnalysisDialogService } from "../../services/batchAnalysisDialog.service"
import { SnapshotCatalogService } from "../../services/snapshotCatalog.service"
import { SnapshotRetentionService } from "../../services/snapshotRetention.service"
import { SnapshotsDialogService } from "../../services/snapshotsDialog.service"
import { SnapshotViewService } from "../../services/snapshotView.service"
import { isUnboundImport, reanalyseTarget, shortProfile, snapshotCommitLabel } from "../../util/analysisWording"
import { AnalysisLogDialogComponent } from "../analysisLogDialog/analysisLogDialog.component"
import { CleanupDialogComponent } from "../cleanupDialog/cleanupDialog.component"
import { DeleteSnapshotDialogComponent } from "../deleteSnapshotDialog/deleteSnapshotDialog.component"
import { PreflightProblemsComponent } from "../preflightProblems/preflightProblems.component"

const ALL_FOLDERS = "all"
const MS_PER_SECOND = 1000

interface SnapshotRow {
    snapshot: SnapshotSummary
    folder: ProjectFolder
    commitLabel: string
    isShown: boolean
    reanalyse: AnalysisTarget | null
}

interface FolderSection {
    folder: ProjectFolder
    rows: SnapshotRow[]
    failure: string | null
}

@Component({
    selector: "cc-snapshots-dialog",
    templateUrl: "./snapshotsDialog.component.html",
    imports: [
        AnalysisLogDialogComponent,
        CleanupDialogComponent,
        DeleteSnapshotDialogComponent,
        MoveSnapshotDialogComponent,
        PreflightProblemsComponent,
        NgTemplateOutlet
    ],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class SnapshotsDialogComponent implements AfterViewInit {
    private readonly projects = inject(ProjectsFacade)
    private readonly catalog = inject(SnapshotCatalogService)
    private readonly view = inject(SnapshotViewService)
    private readonly dialogService = inject(SnapshotsDialogService)
    private readonly gitRepository = inject(GitRepositoryService)
    private readonly batchDialog = inject(BatchAnalysisDialogService)
    private readonly retention = inject(SnapshotRetentionService)
    private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>("dialog")

    readonly allFolders = ALL_FOLDERS
    readonly folderFilter = signal(this.projects.workingFolder()?.id ?? ALL_FOLDERS)
    readonly isRefreshing = signal(true)
    readonly nowMs = signal(Date.now())
    readonly usageBytes = signal<number | null>(null)
    readonly byteSize = byteSize
    readonly shortProfile = shortProfile

    readonly project = this.projects.activeProject
    readonly folders = computed(() => this.project()?.folders ?? [])
    readonly title = computed(() => `Snapshots — ${this.project()?.name ?? ""}`)
    readonly actionFolder = computed(() => this.folderById(this.folderFilter()) ?? this.projects.workingFolder())
    readonly headCommit = computed(() => {
        const folder = this.actionFolder()
        const status = folder ? this.gitRepository.statusOf(this.refOf(folder)) : undefined
        return isGitStatus(status) ? status.head.commit : null
    })
    readonly problems = computed(() => {
        const rejected = this.view.rejectedRun()
        return rejected?.surface === "dialog" ? rejected.problems : null
    })
    readonly sections = computed<FolderSection[]>(() =>
        this.visibleFolders().map(folder => ({
            folder,
            rows: this.rowsOf(folder).filter(row => !isUnboundImport(row.snapshot)),
            failure: this.catalog.failureOf(folder.id)
        }))
    )
    readonly workingFolderLabel = computed(() => this.projects.workingFolder()?.label ?? null)
    readonly unboundImports = computed(() =>
        this.visibleFolders().flatMap(folder => this.rowsOf(folder).filter(row => isUnboundImport(row.snapshot)))
    )

    constructor() {
        effect(() => {
            const projectId = this.project()?.id
            this.projects.snapshotsByFolder()
            untracked(() => void this.readUsage(projectId))
        })
    }

    async ngAfterViewInit() {
        const dialog = this.dialog().nativeElement
        dialog.addEventListener("close", () => this.dialogService.hide())
        dialog.showModal()
        await this.refresh()
    }

    close() {
        this.dialog().nativeElement.close()
    }

    chooseFolder(folderId: string) {
        this.folderFilter.set(folderId)
    }

    isWorkingFolder(folder: ProjectFolder): boolean {
        return folder.id === this.projects.workingFolder()?.id
    }

    analyseCurrentCheckout(folder = this.actionFolder()) {
        if (folder) {
            void this.view.analyse({ folder: this.refOf(folder), target: { kind: "workingTree" }, surface: "dialog" })
        }
    }

    analyseHeadCommit() {
        const folder = this.actionFolder()
        const sha = this.headCommit()
        if (folder && sha) {
            void this.view.analyse({ folder: this.refOf(folder), target: { kind: "commit", sha }, surface: "dialog" })
        }
    }

    analyseSeveral() {
        const folder = this.actionFolder()
        if (folder) {
            this.batchDialog.show({ folder: this.refOf(folder), folderLabel: folder.label, tipSha: null })
        }
    }

    reanalyse(row: SnapshotRow) {
        if (row.reanalyse) {
            void this.view.analyse({ folder: this.refOf(row.folder), target: row.reanalyse, surface: "dialog", force: true })
        }
    }

    openSnapshot(row: SnapshotRow) {
        this.close()
        void this.view.open(row.snapshot.ref)
    }

    retry(folder: ProjectFolder) {
        void this.catalog.refresh(this.refOf(folder))
    }

    relative(timestamp: string): string {
        return relativeTime(Date.parse(timestamp) / MS_PER_SECOND, this.nowMs())
    }

    absolute(timestamp: string): string {
        return fileDate(timestamp)
    }

    importedOn(snapshot: SnapshotSummary): string {
        return longDate(snapshot.createdAt)
    }

    importedShort(snapshot: SnapshotSummary): string {
        return shortDate(snapshot.createdAt)
    }

    notInMapTitle(snapshot: SnapshotSummary): string {
        return `Not in the map: ${snapshot.notInMap.join(", ")}`
    }

    private async readUsage(projectId: string | undefined) {
        try {
            this.usageBytes.set(projectId ? (await this.retention.usage(projectId)).totalBytes : null)
        } catch {
            this.usageBytes.set(null)
        }
    }

    private async refresh() {
        this.isRefreshing.set(true)
        const gitFolders = this.folders().filter(folder => folder.kind === "git" && folder.status === "ok")
        await Promise.all([
            this.catalog.refreshActiveProject(),
            this.gitRepository.refreshFolders(gitFolders.map(folder => this.refOf(folder)))
        ])
        this.nowMs.set(Date.now())
        this.isRefreshing.set(false)
    }

    private visibleFolders(): ProjectFolder[] {
        const filter = this.folderFilter()
        return filter === ALL_FOLDERS ? this.folders() : this.folders().filter(folder => folder.id === filter)
    }

    private rowsOf(folder: ProjectFolder): SnapshotRow[] {
        const shownId = this.projects.shownSnapshot()?.ref.snapshotId
        return this.catalog.snapshots(folder.id).map(snapshot => ({
            snapshot,
            folder,
            commitLabel: snapshotCommitLabel(snapshot),
            isShown: snapshot.ref.snapshotId === shownId,
            reanalyse: reanalyseTarget(snapshot)
        }))
    }

    private folderById(folderId: string): ProjectFolder | null {
        return this.folders().find(folder => folder.id === folderId) ?? null
    }

    private refOf(folder: ProjectFolder) {
        return { projectId: this.project()?.id ?? "", folderId: folder.id }
    }
}
