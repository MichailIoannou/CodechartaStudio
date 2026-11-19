import { NgTemplateOutlet } from "@angular/common"
import { ChangeDetectionStrategy, Component, computed, ElementRef, HostListener, inject, signal, viewChild } from "@angular/core"
import type { FolderRef } from "../../../../model/coreApi/FolderRef"
import type { ProjectSummary } from "../../../../model/coreApi/ProjectSummary"
import type { ProjectSummaryFolder } from "../../../../model/coreApi/ProjectSummaryFolder"
import { FolderGitService, isGitStatus } from "../../services/folderGit.service"
import { OpenFileService } from "../../services/openFile.service"
import { ProjectsService } from "../../services/projects.service"
import { branchLabel, counted } from "../../util/folderWording"
import { CreateProjectDialogComponent } from "../createProjectDialog/createProjectDialog.component"
import { ManageProjectDialogComponent } from "../manageProjectDialog/manageProjectDialog.component"
import { OpenFileDialogComponent } from "../openFileDialog/openFileDialog.component"

const MENU_ITEM_SELECTOR = "[data-menu-item]:not([disabled])"
const UNKNOWN_BRANCH = "…"
const TEXT_INPUT_TAGS: ReadonlySet<string> = new Set(["INPUT", "TEXTAREA"])

interface MenuFolder {
    folder: ProjectSummaryFolder
    projectId: string
    path: string | null
    isWorking: boolean
    branch: string | null
}

interface MenuProject {
    project: ProjectSummary
    isExpanded: boolean
    folders: MenuFolder[]
}

@Component({
    selector: "cc-project-switcher",
    templateUrl: "./projectSwitcher.component.html",
    imports: [CreateProjectDialogComponent, ManageProjectDialogComponent, OpenFileDialogComponent, NgTemplateOutlet],
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: "min-w-0" }
})
export class ProjectSwitcherComponent {
    private readonly projects = inject(ProjectsService)
    private readonly folderGit = inject(FolderGitService)
    private readonly openFileService = inject(OpenFileService)
    private readonly hostElement = inject<ElementRef<HTMLElement>>(ElementRef)
    private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>("trigger")
    private readonly menu = viewChild<ElementRef<HTMLElement>>("menu")

    readonly isOpen = signal(false)
    readonly expandedProjectIds = signal<ReadonlySet<string>>(new Set())
    readonly activeProject = this.projects.activeProject
    readonly workingFolder = this.projects.workingFolder
    readonly busyFolderId = this.projects.busyFolderId
    readonly isBusy = this.projects.isBusy
    readonly counted = counted

    readonly triggerTitle = computed(() => {
        const project = this.activeProject()
        const folder = this.workingFolder()
        if (!project) {
            return "No project"
        }
        const working = folder ? `, working folder '${folder.label}' (${folder.path})` : ""
        return `Project '${project.name}'${working} — switch folder or project`
    })
    readonly currentFolders = computed(() => {
        const project = this.activeProject()
        return (project?.folders ?? []).map(folder => this.menuFolder(project?.id ?? "", folder, folder.path))
    })
    readonly otherProjects = computed(() =>
        this.projects
            .projects()
            .filter(project => project.id !== this.activeProject()?.id)
            .sort((first, second) => first.name.localeCompare(second.name, undefined, { sensitivity: "base" }))
            .map(project => this.menuProject(project))
    )
    readonly hasNoProjects = computed(() => this.projects.projects().length === 0 && !this.activeProject())

    toggle() {
        if (this.isOpen()) {
            this.close()
        } else {
            this.open()
        }
    }

    openWithKeyboard(event: Event) {
        event.preventDefault()
        if (!this.isOpen()) {
            this.open()
        }
        setTimeout(() => this.focusWorkingFolderOrFirstItem())
    }

    async chooseFolder(entry: MenuFolder) {
        await this.projects.chooseFolder({ projectId: entry.projectId, folderId: entry.folder.id })
        this.close()
    }

    toggleProject(projectId: string) {
        const isExpanded = this.expandedProjectIds().has(projectId)
        this.setExpanded(projectId, !isExpanded)
    }

    showOverview() {
        this.close()
        this.projects.showOverview()
    }

    newProject(dialog: CreateProjectDialogComponent) {
        this.close()
        dialog.open()
    }

    manageProject(dialog: ManageProjectDialogComponent) {
        this.close()
        dialog.open()
    }

    openFile() {
        this.close()
        void this.openFileService.pickToOpen().catch(error => this.projects.toastUnlessSilent(error, (error as Error).message))
    }

    @HostListener("document:keydown", ["$event"])
    openFileWithShortcut(event: KeyboardEvent) {
        const isShortcut = (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "o"
        if (!isShortcut || isTypingInto(event.target) || document.querySelector("dialog[open]")) {
            return
        }
        event.preventDefault()
        this.openFile()
    }

    closeProject() {
        this.close()
        void this.projects.openProject(null).catch(error => this.projects.toastUnlessSilent(error, (error as Error).message))
    }

    handleMenuKey(event: KeyboardEvent) {
        const handled = this.moveFocus(event.key) || this.expandOrCollapse(event.key)
        if (event.key === "Escape") {
            this.close()
            this.trigger().nativeElement.focus()
        }
        if (handled || event.key === "Escape") {
            event.preventDefault()
            event.stopPropagation()
        }
    }

    @HostListener("document:click", ["$event"])
    closeWhenClickedOutside(event: MouseEvent) {
        if (this.isOpen() && !this.hostElement.nativeElement.contains(event.target as Node)) {
            this.close()
        }
    }

    private open() {
        this.expandedProjectIds.set(new Set())
        this.isOpen.set(true)
        void this.projects.refreshProjects().catch(() => undefined)
        const project = this.activeProject()
        if (project) {
            void this.refreshBranches(project.id, project.folders)
        }
    }

    private close() {
        this.isOpen.set(false)
    }

    private setExpanded(projectId: string, isExpanded: boolean) {
        const expanded = new Set(this.expandedProjectIds())
        if (isExpanded) {
            expanded.add(projectId)
            const project = this.projects.projects().find(candidate => candidate.id === projectId)
            void this.refreshBranches(projectId, project?.folders ?? [])
        } else {
            expanded.delete(projectId)
        }
        this.expandedProjectIds.set(expanded)
    }

    private refreshBranches(projectId: string, folders: ProjectSummaryFolder[]) {
        const refs: FolderRef[] = folders
            .filter(folder => folder.kind === "git" && folder.status === "ok")
            .map(folder => ({ projectId, folderId: folder.id }))
        return this.folderGit.refresh(refs)
    }

    private menuProject(project: ProjectSummary): MenuProject {
        const isExpanded = this.expandedProjectIds().has(project.id)
        return {
            project,
            isExpanded,
            folders: isExpanded ? project.folders.map(folder => this.menuFolder(project.id, folder, null)) : []
        }
    }

    private menuFolder(projectId: string, folder: ProjectSummaryFolder, path: string | null): MenuFolder {
        const isWorking = projectId === this.activeProject()?.id && folder.id === this.workingFolder()?.id
        return { folder, projectId, path, isWorking, branch: this.branchOf(projectId, folder) }
    }

    private branchOf(projectId: string, folder: ProjectSummaryFolder): string | null {
        if (folder.kind !== "git" || folder.status !== "ok") {
            return null
        }
        const status = this.folderGit.statusOf({ projectId, folderId: folder.id })
        if (status === undefined) {
            return UNKNOWN_BRANCH
        }
        return isGitStatus(status) ? branchLabel(status) : null
    }

    private menuItems(): HTMLElement[] {
        return Array.from(this.menu()?.nativeElement.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR) ?? [])
    }

    private focusWorkingFolderOrFirstItem() {
        const working = this.menu()?.nativeElement.querySelector<HTMLElement>("[aria-checked='true']")
        ;(working ?? this.menuItems()[0])?.focus()
    }

    private moveFocus(key: string): boolean {
        const step = { ArrowDown: 1, ArrowUp: -1 }[key]
        if (step === undefined) {
            return false
        }
        const items = this.menuItems()
        const index = items.indexOf(document.activeElement as HTMLElement)
        items[(index + step + items.length) % items.length]?.focus()
        return true
    }

    private expandOrCollapse(key: string): boolean {
        const focused = document.activeElement as HTMLElement | null
        const { projectRow, parentProject } = focused?.dataset ?? {}
        if (projectRow && (key === "ArrowRight" || key === "ArrowLeft")) {
            this.setExpanded(projectRow, key === "ArrowRight")
            return true
        }
        if (parentProject && key === "ArrowLeft") {
            this.focusProjectRow(parentProject)
            return true
        }
        return false
    }

    private focusProjectRow(projectId: string) {
        this.menu()?.nativeElement.querySelector<HTMLElement>(`[data-project-row="${projectId}"]`)?.focus()
    }
}

function isTypingInto(target: EventTarget | null): boolean {
    return target instanceof HTMLElement && TEXT_INPUT_TAGS.has(target.tagName)
}
