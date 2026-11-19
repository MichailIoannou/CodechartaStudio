import { computed, Injectable, inject } from "@angular/core"
import { ProjectsFacade } from "../../projects/facade"
import { ToastService } from "../../shared/facade"
import type { CompareIntent, ComparePrefill, FolderRef } from "../model/compare.model"
import { CompareStore } from "../stores/compare.store"
import { CompareService } from "./compare.service"
import { errorSentence } from "./comparisonText"

const PHASES_SHOWN_IN_THE_DIALOG: ReadonlySet<string> = new Set(["stopped", "needsDecision"])

/** What other features use to start, label and leave a comparison of two commits of a project folder. */
@Injectable({ providedIn: "root" })
export class CompareFacade {
    private readonly service = inject(CompareService)
    private readonly store = inject(CompareStore)
    private readonly projects = inject(ProjectsFacade)
    private readonly toastService = inject(ToastService)

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
    private async startOutsideTheDialog(intent: Extract<CompareIntent, { folder: FolderRef }>): Promise<void> {
        await this.service.start(intent)
        if (this.store.dialogPrefill() !== null) {
            return
        }
        const { phase, error } = this.store.state()
        if (PHASES_SHOWN_IN_THE_DIALOG.has(phase)) {
            this.store.openDialog({ folder: intent.folder })
        } else if (error) {
            this.toastService.show(errorSentence(error), "error")
        }
    }
}
