import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, signal, viewChild } from "@angular/core"
import type { ResolvedCommit } from "../../../../model/coreApi/ResolvedCommit"
import type { SnapshotSummary } from "../../../../model/coreApi/SnapshotSummary"
import { ProjectsService } from "../../services/projects.service"
import { longDate, shortDate } from "../../util/folderWording"

const COMMIT_HASH = /^[0-9a-f]{7,40}$/
const HINT_SEPARATOR = "."

export type MoveSnapshotMode = "move" | "bind"

type CommitCheck = { kind: "unchecked" } | { kind: "checking" } | { kind: "found"; commit: ResolvedCommit } | { kind: "notFound" }

@Component({
    selector: "cc-move-snapshot-dialog",
    templateUrl: "./moveSnapshotDialog.component.html",
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class MoveSnapshotDialogComponent {
    private readonly projects = inject(ProjectsService)
    private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>("dialog")

    readonly snapshot = signal<SnapshotSummary | null>(null)
    readonly mode = signal<MoveSnapshotMode>("move")
    readonly folderId = signal("")
    readonly hash = signal("")
    readonly check = signal<CommitCheck>({ kind: "unchecked" })
    readonly isMoving = signal(false)
    readonly failure = signal<string | null>(null)

    readonly folders = computed(() => this.projects.activeProject()?.folders ?? [])
    readonly title = computed(() => (this.mode() === "move" ? "Move Snapshot" : "Bind to Commit"))
    readonly primaryLabel = computed(() => (this.mode() === "move" ? "Move" : "Bind"))
    readonly folderLabel = computed(() => this.folders().find(folder => folder.id === this.folderId())?.label ?? "")
    readonly fileLine = computed(() => {
        const snapshot = this.snapshot()
        return snapshot ? `${snapshot.originalFileName ?? snapshot.ref.snapshotId} · imported ${longDate(snapshot.createdAt)}` : ""
    })
    readonly trimmedHash = computed(() => this.hash().trim().toLowerCase())
    readonly canCheck = computed(() => COMMIT_HASH.test(this.trimmedHash()) && this.check().kind !== "checking")
    readonly canMove = computed(() => !this.isMoving() && (this.trimmedHash() === "" || this.check().kind === "found"))
    readonly commitLine = computed(() => {
        const check = this.check()
        if (check.kind !== "found") {
            return null
        }
        const { subject, authorName, authorDate } = check.commit
        return `${subject} (${authorName}, ${shortDate(authorDate)})`
    })

    open(snapshot: SnapshotSummary, mode: MoveSnapshotMode) {
        this.snapshot.set(snapshot)
        this.mode.set(mode)
        this.folderId.set(snapshot.ref.folderId)
        this.hash.set(snapshot.shortCommit ?? hintOf(snapshot.originalFileName))
        this.check.set({ kind: "unchecked" })
        this.isMoving.set(false)
        this.failure.set(null)
        this.dialog().nativeElement.showModal()
    }

    close() {
        this.dialog().nativeElement.close()
    }

    chooseFolder(folderId: string) {
        this.folderId.set(folderId)
        this.check.set({ kind: "unchecked" })
    }

    typeHash(hash: string) {
        this.hash.set(hash)
        this.check.set({ kind: "unchecked" })
    }

    async checkCommit() {
        const project = this.projects.activeProject()
        if (!project || !this.canCheck()) {
            return
        }
        this.check.set({ kind: "checking" })
        try {
            const { commit } = await this.projects.resolveCommit({ projectId: project.id, folderId: this.folderId() }, this.trimmedHash())
            this.check.set(commit ? { kind: "found", commit } : { kind: "notFound" })
        } catch (error) {
            this.check.set({ kind: "unchecked" })
            this.failure.set((error as Error).message)
        }
    }

    async move() {
        const snapshot = this.snapshot()
        if (!snapshot || !this.canMove()) {
            return
        }
        const check = this.check()
        this.isMoving.set(true)
        this.failure.set(null)
        try {
            const bindToCommit = check.kind === "found" ? check.commit.commit : null
            await this.projects.moveSnapshot(snapshot.ref, { toFolderId: this.folderId(), bindToCommit })
            this.close()
        } catch (error) {
            this.failure.set((error as Error).message)
        } finally {
            this.isMoving.set(false)
        }
    }
}

function hintOf(fileName: string | null): string {
    const prefix = fileName?.split(HINT_SEPARATOR)[0] ?? ""
    return COMMIT_HASH.test(prefix) ? prefix : ""
}
