import { ChangeDetectionStrategy, Component, computed, effect, HostListener, inject, signal, untracked } from "@angular/core"
import type { GitCommitSummary } from "../../../../model/coreApi/GitCommitSummary"
import type { Project } from "../../../../model/coreApi/Project"
import type { ProjectFolder } from "../../../../model/coreApi/ProjectFolder"
import type { ProjectSummary } from "../../../../model/coreApi/ProjectSummary"
import type { SnapshotSummary } from "../../../../model/coreApi/SnapshotSummary"
import type { StoreProblemCode } from "../../../../model/coreApi/StoreProblemCode"
import { FolderGitService, isGitStatus } from "../../services/folderGit.service"
import { ProjectsService } from "../../services/projects.service"
import { branchLabel, counted, relativeTime, shortSha } from "../../util/folderWording"
import { AnalysesCardComponent } from "../analysesCard/analysesCard.component"
import { CreateProjectDialogComponent } from "../createProjectDialog/createProjectDialog.component"
import { WorkingFolderCardComponent } from "../workingFolderCard/workingFolderCard.component"

const FOCUS_REFRESH_THROTTLE_MS = 10_000

const STORE_PROBLEM_SENTENCES: Record<StoreProblemCode, string> = {
    STORE_LOCKED: "Another CodeCharta window is using the store. Close it and try again.",
    STORE_NEWER_SCHEMA: "The store was written by a newer version of CodeCharta. Update the app, or choose another location.",
    IO: "The store folder could not be read or written."
}

interface CommitRow {
    sha: string
    subject: string
    author: string
    when: string
    isHead: boolean
    badge: "in map" | "analysed" | null
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
    imports: [WorkingFolderCardComponent, AnalysesCardComponent, CreateProjectDialogComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: "block min-h-[calc(100vh-var(--cc-bars-height))] overflow-y-auto bg-base-200" }
})
export class ProjectOverviewComponent {
    private readonly projects = inject(ProjectsService)
    private readonly folderGit = inject(FolderGitService)
    private lastRefreshAt = 0

    readonly now = signal(Date.now())
    readonly commits = signal<GitCommitSummary[] | null>(null)
    readonly storeBytes = signal<number | null>(null)

    readonly project = this.projects.activeProject
    readonly isBusy = this.projects.isBusy
    readonly workingFolder = this.projects.workingFolder
    readonly storeProblem = computed(() => {
        const problem = this.projects.storeProblem()
        return problem ? { code: problem, sentence: STORE_PROBLEM_SENTENCES[problem] } : null
    })
    readonly workingSnapshots = computed(() => this.snapshotsOf(this.workingFolder()))
    readonly recentCommits = computed(() => this.commitRows(this.commits() ?? []))
    readonly folderRows = computed(() => this.folderRowsOf(this.project()))
    readonly projectRows = computed(() => projectRowsOf(this.projects.projects()))

    constructor() {
        effect(() => {
            const folder = this.workingFolder()
            untracked(() => void this.refresh(folder))
        })
    }

    @HostListener("window:focus")
    refreshAfterFocus() {
        if (Date.now() - this.lastRefreshAt >= FOCUS_REFRESH_THROTTLE_MS) {
            void this.refresh(this.workingFolder())
        }
    }

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

    showSampleFiles() {
        this.projects.showSampleFiles()
    }

    revealStoreFolder() {
        void this.projects.revealStoreFolder()
    }

    tryStoreAgain() {
        void this.projects.initialise().then(() => this.projects.showWorkingFolder())
    }

    private async refresh(folder: ProjectFolder | null) {
        this.lastRefreshAt = Date.now()
        this.now.set(this.lastRefreshAt)
        const project = this.project()
        if (!project) {
            return
        }
        const gitFolders = project.folders.filter(candidate => candidate.kind === "git" && candidate.status === "ok")
        const workingRef = folder?.kind === "git" && folder.status === "ok" ? { projectId: project.id, folderId: folder.id } : null
        const [commits, usage] = await Promise.all([
            workingRef ? this.folderGit.recentCommits(workingRef) : Promise.resolve(null),
            this.projects.readStoreUsage().catch(() => null),
            this.folderGit.refresh(gitFolders.map(candidate => ({ projectId: project.id, folderId: candidate.id })))
        ])
        this.commits.set(commits)
        this.storeBytes.set(usage?.folders.find(entry => entry.folderId === folder?.id)?.bytes ?? null)
    }

    private snapshotsOf(folder: ProjectFolder | null): SnapshotSummary[] {
        return folder ? (this.projects.snapshotsByFolder()[folder.id] ?? []) : []
    }

    private commitRows(commits: GitCommitSummary[]): CommitRow[] {
        const shownCommit = this.projects.shownSnapshot()?.commit
        const analysed = new Set(this.workingSnapshots().map(snapshot => snapshot.commit))
        return commits.map((commit, index) => ({
            sha: shortSha(commit.sha),
            subject: commit.subject,
            author: commit.authorName,
            when: relativeTime(commit.committedAt, this.now()),
            isHead: index === 0,
            badge: commit.sha === shownCommit ? "in map" : analysed.has(commit.sha) ? "analysed" : null
        }))
    }

    private folderRowsOf(project: Project | null): FolderRow[] {
        const workingId = this.workingFolder()?.id
        return (project?.folders ?? []).map(folder => {
            const snapshots = this.projects.snapshotsByFolder()[folder.id] ?? []
            const allImported = snapshots.length > 0 && snapshots.every(snapshot => snapshot.source === "imported")
            return {
                folder,
                isWorking: folder.id === workingId,
                kindText: this.kindText(project?.id ?? "", folder),
                analysesText: allImported ? `${snapshots.length} imported` : counted(snapshots.length, "analysis", "analyses"),
                showsPlainHint: folder.kind === "plain" && allImported
            }
        })
    }

    private kindText(projectId: string, folder: ProjectFolder): string {
        if (folder.status === "missing") {
            return "missing"
        }
        if (folder.kind === "plain") {
            return "plain folder"
        }
        const status = this.folderGit.statusOf({ projectId, folderId: folder.id })
        return isGitStatus(status) ? branchLabel(status) : "…"
    }
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
