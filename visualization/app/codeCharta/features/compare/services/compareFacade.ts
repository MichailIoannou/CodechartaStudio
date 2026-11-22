import { computed, Injectable, inject } from "@angular/core"
import { ProjectsFacade } from "../../projects/facade"
import { ToastService } from "../../shared/facade"
import type { BaseMode, CompareIntent, ComparePrefill, FolderRef } from "../model/compare.model"
import { BaseModeRepo } from "../repos/baseMode.repo"
import { CompareStore } from "../stores/compare.store"
import { CompareService } from "./compare.service"
import { errorSentence } from "./comparisonText"
import type { SnapshotSideInput } from "./snapshotSides"

const PHASES_SHOWN_IN_THE_DIALOG: ReadonlySet<string> = new Set(["stopped", "needsDecision"])

/** What other features use to start, label and leave a comparison of two commits of a project folder. */
@Injectable({ providedIn: "root" })
export class CompareFacade {
    private readonly service = inject(CompareService)
    private readonly store = inject(CompareStore)
    private readonly projects = inject(ProjectsFacade)
    private readonly toastService = inject(ToastService)
    private readonly baseModes = inject(BaseModeRepo)

    readonly state = this.store.state
    readonly isActive = this.store.isActive
    readonly isComparing = computed(() => this.store.isActive() || this.store.isShowingNoDifferences())
    readonly isAvailable = computed(
        () => this.projects.isDesktop() && (this.projects.activeProject()?.folders.some(folder => folder.kind === "git") ?? false)
    )

    compareCommits(folder: FolderRef, commitA: string, commitB: string): Promise<void> {
        return this.startOutsideTheDialog({ kind: "commits", folder, a: commitA, b: commitB })
    }

    compareWithParent(folder: FolderRef, commit: string): Promise<void> {
        return this.startOutsideTheDialog({ kind: "withParent", folder, commit })
    }

    compareWithCurrent(folder: FolderRef, commit: string): Promise<void> {
        return this.startOutsideTheDialog({ kind: "withCurrent", folder, commit })
    }

    /** `branch` and `target` are full ref names; without a base mode, the one last chosen for the project. */
    compareBranch(folder: FolderRef, branch: string, options: { target?: string; baseMode?: BaseMode } = {}): Promise<void> {
        const baseMode = options.baseMode ?? this.baseModes.read(folder.projectId)
        return this.startOutsideTheDialog({ kind: "branch", folder, branch, target: options.target ?? null, baseMode })
    }

    /** `base` is a commit or `HEAD` of the folder, compared tip vs tip with a working-tree or imported snapshot of it. */
    compareWithSnapshot(folder: FolderRef, base: string, snapshot: SnapshotSideInput): Promise<void> {
        const intent: CompareIntent = {
            kind: "explicit",
            base: { folder, rev: { kind: "rev", name: base } },
            head: { folder, rev: snapshot },
            baseMode: "tip"
        }
        return this.startOutsideTheDialog(intent, folder)
    }

    openDialog(prefill: ComparePrefill = {}): void {
        this.store.openDialog(prefill)
    }

    swap(): void {
        this.service.swap()
    }

    exit(): void {
        this.service.exit()
    }

    /** A comparison started from a menu shows a decision or a stop in the dialog and an error as a toast. */
    private async startOutsideTheDialog(intent: CompareIntent, folder = intentFolderOf(intent)): Promise<void> {
        await this.service.start(intent)
        if (this.store.dialogPrefill() !== null) {
            return
        }
        const { phase, error } = this.store.state()
        if (PHASES_SHOWN_IN_THE_DIALOG.has(phase)) {
            this.store.openDialog({ folder })
        } else if (error) {
            this.toastService.show(errorSentence(error), "error")
        }
    }
}

function intentFolderOf(intent: CompareIntent): FolderRef {
    return intent.kind === "explicit" ? intent.base.folder : intent.folder
}
