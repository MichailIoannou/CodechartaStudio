import {
    ChangeDetectionStrategy,
    Component,
    computed,
    DestroyRef,
    ElementRef,
    effect,
    inject,
    signal,
    untracked,
    viewChild
} from "@angular/core"
import type { FolderRef } from "../../../../model/coreApi/FolderRef"
import type { PrunePlan } from "../../../../model/coreApi/PrunePlan"
import type { PrunePolicy } from "../../../../model/coreApi/PrunePolicy"
import { byteSize, counted, ProjectsFacade, shortDate } from "../../../projects/facade"
import { SnapshotRetentionService } from "../../services/snapshotRetention.service"
import { snapshotCommitLabel } from "../../util/analysisWording"
import { analysesWithSize } from "../../util/retentionWording"

type PlanState = { kind: "idle" } | { kind: "loading" } | { kind: "ready"; plan: PrunePlan } | { kind: "failed"; message: string }

interface PlannedRow {
    snapshotId: string
    label: string
    subject: string | null
    date: string
    size: string
}

/** Owner decision 4: the clean-up proposes keeping 50 commit and 3 working-tree analyses per folder, plus branch tips and tags. */
const KEEP_NEWEST_COMMIT_ANALYSES = 50
const KEEP_NEWEST_WORKING_TREE_ANALYSES = 3
const PLAN_DELAY_MS = 300

/** Design S8: cleans up the analyses of the working folder (owner answer O4.3); the list it shows is the confirmation. */
@Component({
    selector: "cc-cleanup-dialog",
    templateUrl: "./cleanupDialog.component.html",
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class CleanupDialogComponent {
    private readonly projects = inject(ProjectsFacade)
    private readonly retention = inject(SnapshotRetentionService)
    private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>("dialog")
    private planTimer: ReturnType<typeof setTimeout> | undefined
    private latestTicket = 0

    readonly isOpen = signal(false)
    readonly keepCommits = signal(KEEP_NEWEST_COMMIT_ANALYSES)
    readonly keepWorkingTrees = signal(KEEP_NEWEST_WORKING_TREE_ANALYSES)
    readonly keepTipsAndTags = signal(true)
    readonly planState = signal<PlanState>({ kind: "idle" })
    readonly isPruning = signal(false)
    readonly pruneFailure = signal<string | null>(null)

    readonly folder = this.projects.workingFolder
    readonly title = computed(() => `Clean Up Analyses — ${this.folder()?.label ?? ""}`)
    readonly policy = computed(() => this.policyOfInputs())
    readonly plan = computed(() => {
        const state = this.planState()
        return state.kind === "ready" ? state.plan : null
    })
    readonly planFailure = computed(() => {
        const state = this.planState()
        return state.kind === "failed" ? state.message : null
    })
    readonly count = computed(() => this.plan()?.delete.length ?? 0)
    readonly summary = computed(() => {
        const plan = this.plan()
        return plan ? `Moves ${analysesWithSize(this.count(), plan.freedBytes)} of ${this.folder()?.label ?? ""} to the recycle bin:` : ""
    })
    readonly listLabel = computed(() => `${counted(this.count(), "analysis", "analyses")}, ${byteSize(this.plan()?.freedBytes ?? 0)}`)
    readonly rows = computed<PlannedRow[]>(() =>
        (this.plan()?.delete ?? []).map(snapshot => ({
            snapshotId: snapshot.ref.snapshotId,
            label: snapshotCommitLabel(snapshot),
            subject: snapshot.subject,
            date: shortDate(snapshot.finishedAt ?? snapshot.createdAt),
            size: byteSize(snapshot.mapBytes)
        }))
    )
    readonly canPrune = computed(() => this.count() > 0 && !this.isPruning())

    constructor() {
        effect(() => {
            const policy = this.isOpen() ? this.policy() : null
            untracked(() => this.schedulePlan(policy))
        })
        inject(DestroyRef).onDestroy(() => clearTimeout(this.planTimer))
    }

    open() {
        this.pruneFailure.set(null)
        const dialog = this.dialog().nativeElement
        dialog.addEventListener("close", () => this.isOpen.set(false), { once: true })
        dialog.showModal()
        this.isOpen.set(true)
    }

    close() {
        this.dialog().nativeElement.close()
    }

    setCount(target: "commits" | "workingTrees", event: Event) {
        const value = (event.target as HTMLInputElement).valueAsNumber
        const count = target === "commits" ? this.keepCommits : this.keepWorkingTrees
        count.set(value)
    }

    async prune() {
        const plan = this.plan()
        const folder = this.folderRef()
        if (!(plan && folder)) {
            return
        }
        this.isPruning.set(true)
        this.pruneFailure.set(null)
        try {
            await this.retention.prune(folder, plan)
            this.close()
        } catch (error) {
            this.pruneFailure.set((error as Error).message)
        } finally {
            this.isPruning.set(false)
        }
    }

    private schedulePlan(policy: PrunePolicy | null) {
        clearTimeout(this.planTimer)
        const ticket = ++this.latestTicket
        const folder = this.folderRef()
        if (!(policy && folder)) {
            this.planState.set({ kind: "idle" })
            return
        }
        this.planState.set({ kind: "loading" })
        this.planTimer = setTimeout(() => void this.loadPlan(folder, policy, ticket), PLAN_DELAY_MS)
    }

    private async loadPlan(folder: FolderRef, policy: PrunePolicy, ticket: number) {
        let state: PlanState
        try {
            state = { kind: "ready", plan: await this.retention.planPrune(folder, policy) }
        } catch (error) {
            state = { kind: "failed", message: (error as Error).message }
        }
        if (ticket === this.latestTicket) {
            this.planState.set(state)
        }
    }

    private policyOfInputs(): PrunePolicy | null {
        const keepNewestCommitSnapshots = this.keepCommits()
        const keepNewestWorkingTreeSnapshots = this.keepWorkingTrees()
        if (!(isCount(keepNewestCommitSnapshots) && isCount(keepNewestWorkingTreeSnapshots))) {
            return null
        }
        return { keepNewestCommitSnapshots, keepNewestWorkingTreeSnapshots, keepBranchTipsAndTags: this.keepTipsAndTags() }
    }

    private folderRef(): FolderRef | null {
        const project = this.projects.activeProject()
        const folder = this.folder()
        return project && folder ? { projectId: project.id, folderId: folder.id } : null
    }
}

function isCount(value: number): boolean {
    return Number.isInteger(value) && value >= 0
}
