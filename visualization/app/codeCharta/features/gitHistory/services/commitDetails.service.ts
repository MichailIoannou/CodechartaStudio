import { computed, effect, Injectable, inject, signal, untracked } from "@angular/core"
import type { FolderRef } from "../../../model/coreApi/FolderRef"
import type { GitCommitDetails } from "../../../model/coreApi/GitCommitDetails"
import type { GitCommitDistance } from "../../../model/coreApi/GitCommitDistance"
import { IDLE, LOADING, LoadState, loadStateOf } from "../model/loadState"
import { CommitSelectionService } from "./commitSelection.service"
import { GitApiService } from "./gitApi.service"
import { GitLogService } from "./gitLog.service"

interface DetailsRequest {
    repo: FolderRef
    sha: string
}

interface DistanceRequest {
    repo: FolderRef
    newerSha: string
    olderSha: string
}

/**
 * The details of the one selected commit, or how far two selected commits are apart; a later selection overtakes an
 * answer still on its way.
 */
@Injectable({ providedIn: "root" })
export class CommitDetailsService {
    private readonly api = inject(GitApiService)
    private readonly log = inject(GitLogService)
    private readonly selection = inject(CommitSelectionService)
    private readonly detailsState = signal<LoadState<GitCommitDetails>>(IDLE)
    private readonly distanceState = signal<LoadState<GitCommitDistance>>(IDLE)
    private latestTicket = 0
    private latestDistanceTicket = 0

    readonly details = this.detailsState.asReadonly()
    /** For two selected commits: `onlyInTarget` counts the commits only the newer one has. */
    readonly distance = this.distanceState.asReadonly()
    private readonly request = computed<DetailsRequest | null>(
        () => {
            const selection = this.selection.selection()
            const sha = this.selection.selectedSha()
            return selection && sha ? { repo: selection.repo, sha } : null
        },
        { equal: (first, second) => first?.sha === second?.sha && first?.repo.folderId === second?.repo.folderId }
    )

    private readonly distanceRequest = computed<DistanceRequest | null>(
        () => {
            const selection = this.selection.selection()
            const [newer, older] = selection?.items ?? []
            return selection && newer?.kind === "commit" && older?.kind === "commit"
                ? { repo: selection.repo, newerSha: newer.commit.sha, olderSha: older.commit.sha }
                : null
        },
        { equal: (first, second) => JSON.stringify(first) === JSON.stringify(second) }
    )

    constructor() {
        effect(() => {
            const request = this.request()
            untracked(() => void this.load(request))
        })
        effect(() => {
            const request = this.distanceRequest()
            untracked(() => void this.measure(request))
        })
    }

    retry(): void {
        void this.load(this.request())
    }

    /** Selects a parent shown as a link: from the loaded list, else as the core resolves it. */
    async selectCommit(sha: string): Promise<void> {
        const listed = this.log.commits().find(commit => commit.sha === sha)
        const repo = this.selection.selection()?.repo
        if (listed) {
            this.selection.select({ kind: "commit", commit: listed })
            return
        }
        const resolved = repo ? await this.api.resolveCommit(repo, sha) : null
        if (resolved && "value" in resolved) {
            this.selection.select({ kind: "commit", commit: resolved.value })
        }
    }

    private async load(request: DetailsRequest | null): Promise<void> {
        const ticket = ++this.latestTicket
        this.detailsState.set(request ? LOADING : IDLE)
        if (!request) {
            return
        }
        const answer = await this.api.commitDetails(request.repo, request.sha)
        if (ticket === this.latestTicket) {
            this.detailsState.set(loadStateOf(answer))
        }
    }

    private async measure(request: DistanceRequest | null): Promise<void> {
        const ticket = ++this.latestDistanceTicket
        this.distanceState.set(request ? LOADING : IDLE)
        if (!request) {
            return
        }
        const answer = await this.api.measureDistances(request.repo, request.newerSha, [request.olderSha])
        if (ticket !== this.latestDistanceTicket) {
            return
        }
        const state = loadStateOf(answer)
        this.distanceState.set(state.kind === "ready" ? distanceOf(state.value.distances) : state)
    }
}

function distanceOf(distances: readonly GitCommitDistance[]): LoadState<GitCommitDistance> {
    const [distance] = distances
    return distance ? { kind: "ready", value: distance } : IDLE
}
