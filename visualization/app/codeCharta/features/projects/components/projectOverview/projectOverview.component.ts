import { ChangeDetectionStrategy, Component, computed, inject } from "@angular/core"
import type { Project } from "../../../../model/coreApi/Project"
import type { ProjectFolder } from "../../../../model/coreApi/ProjectFolder"
import type { ProjectSummary } from "../../../../model/coreApi/ProjectSummary"
import type { SnapshotSummary } from "../../../../model/coreApi/SnapshotSummary"
import type { StoreProblemCode } from "../../../../model/coreApi/StoreProblemCode"
import { StoreFolderService } from "../../../desktopTools/facade"
import { OpenFileService } from "../../services/openFile.service"
import { ProjectsService } from "../../services/projects.service"
import { counted } from "../../util/folderWording"
import { AnalysesCardComponent } from "../analysesCard/analysesCard.component"
import { CreateProjectDialogComponent } from "../createProjectDialog/createProjectDialog.component"
import { ManageProjectDialogComponent } from "../manageProjectDialog/manageProjectDialog.component"
import { RelinkFolderComponent } from "../relinkFolder/relinkFolder.component"
import { WorkingFolderCardComponent } from "../workingFolderCard/workingFolderCard.component"

const STORE_PROBLEM_SENTENCES: Record<StoreProblemCode, string> = {
    STORE_LOCKED: "Another CodeCharta window is using the store. Close it and try again.",
    STORE_NEWER_SCHEMA: "The store was written by a newer version of CodeCharta. Update the app, or choose another location.",
    IO: "The store folder could not be read or written."
}

interface FolderRow {
    folder: ProjectFolder
    isWorking: boolean
    kindText: string
    analysesText: string
    showsPlainHint: boolean
}

@Component({
    selector: "cc-project-overview",
    templateUrl: "./projectOverview.component.html",
    imports: [
        WorkingFolderCardComponent,
        AnalysesCardComponent,
        CreateProjectDialogComponent,
        ManageProjectDialogComponent,
        RelinkFolderComponent
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: "block min-h-[calc(100vh-var(--cc-bars-height))] overflow-y-auto bg-base-200" }
})
export class ProjectOverviewComponent {
    private readonly projects = inject(ProjectsService)
    private readonly openFileService = inject(OpenFileService)
    private readonly storeFolder = inject(StoreFolderService)

    readonly project = this.projects.activeProject
    readonly isBusy = this.projects.isBusy
    readonly isChangingStore = this.storeFolder.isChanging
    readonly workingFolder = this.projects.workingFolder
    readonly storeProblem = computed(() => {
        const problem = this.projects.storeProblem()
        return problem ? { code: problem, sentence: STORE_PROBLEM_SENTENCES[problem] } : null
    })
    readonly workingSnapshots = computed(() => this.snapshotsOf(this.workingFolder()))
    readonly folderRows = computed(() => this.folderRowsOf(this.project()))
    readonly projectRows = computed(() => projectRowsOf(this.projects.projects()))

    chooseFolder(folder: ProjectFolder) {
        const project = this.project()
        if (project) {
            void this.projects.chooseFolder({ projectId: project.id, folderId: folder.id })
        }
    }

    openProject(projectId: string) {
        void this.projects.openProject(projectId).catch(error => this.projects.toastUnlessSilent(error, (error as Error).message))
    }

    addFolder() {
        void this.projects.addPickedFolder("Add folder")
    }

    openFile() {
        void this.openFileService.pickToOpen().catch(error => this.projects.toastUnlessSilent(error, (error as Error).message))
    }

    importFile(folder: ProjectFolder) {
        const project = this.project()
        if (project) {
            ;(document.activeElement as HTMLElement | null)?.blur()
            const target = { projectId: project.id, folderId: folder.id }
            void this.openFileService.pickToImport(target).catch(error => this.projects.toastUnlessSilent(error, (error as Error).message))
        }
    }

    showSampleFiles() {
        this.projects.showSampleFiles()
    }

    revealStoreFolder() {
        void this.projects.revealStoreFolder()
    }

    chooseStoreFolder() {
        void this.storeFolder.chooseFolder()
    }

    tryStoreAgain() {
        void this.projects.initialise().then(() => this.projects.showWorkingFolder())
    }

    private snapshotsOf(folder: ProjectFolder | null): SnapshotSummary[] {
        return folder ? (this.projects.snapshotsByFolder()[folder.id] ?? []) : []
    }

    private folderRowsOf(project: Project | null): FolderRow[] {
        const workingId = this.workingFolder()?.id
        return (project?.folders ?? []).map(folder => {
            const snapshots = this.projects.snapshotsByFolder()[folder.id] ?? []
            const allImported = snapshots.length > 0 && snapshots.every(snapshot => snapshot.source === "imported")
            return {
                folder,
                isWorking: folder.id === workingId,
                kindText: kindText(folder),
                analysesText: allImported ? `${snapshots.length} imported` : counted(snapshots.length, "analysis", "analyses"),
                showsPlainHint: folder.kind === "plain" && allImported
            }
        })
    }
}

function kindText(folder: ProjectFolder): string {
    if (folder.status === "missing") {
        return "missing"
    }
    return folder.kind === "plain" ? "plain folder" : "git folder"
}

function projectRowsOf(projects: ProjectSummary[]) {
    return [...projects]
        .sort((first, second) => (second.updatedAt ?? "").localeCompare(first.updatedAt ?? ""))
        .map(project => ({
            project,
            facts: `${counted(project.folderCount, "folder")} · ${counted(project.snapshotCount, "analysis", "analyses")}`,
            missing: project.missingFolderCount > 0 ? `${counted(project.missingFolderCount, "folder")} missing` : null
        }))
}
