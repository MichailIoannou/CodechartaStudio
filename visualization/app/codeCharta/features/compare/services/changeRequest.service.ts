import { Injectable, inject } from "@angular/core"
import { DesktopBridgeError } from "../../../util/desktop/desktopResult"
import { type ComparedChangeRequest, type CompareError, type CompareIntent, type FolderRef, IDLE_COMPARISON } from "../model/compare.model"
import { CORE_GATEWAY, HOSTING_GATEWAY } from "../ports/compareGateways"
import { CompareStore } from "../stores/compare.store"
import { changeRequestLabel } from "./changeRequestText"
import { CompareService } from "./compare.service"

const OPERATION_PREFIX = "compare-fetch-head-"

/** Compares a pull or merge request; fetches its head into the private namespace only when the user asks for it. */
@Injectable({ providedIn: "root" })
export class ChangeRequestService {
    private readonly store = inject(CompareStore)
    private readonly compareService = inject(CompareService)
    private readonly hosting = inject(HOSTING_GATEWAY)
    private readonly core = inject(CORE_GATEWAY)
    private operationCount = 0
    private runningOperation: string | null = null

    /** "Open" in the number entry: the click is the request to fetch, so the head is fetched first, then compared. */
    async openByNumber(request: ComparedChangeRequest): Promise<void> {
        this.store.set({ ...IDLE_COMPARISON, phase: "headNotLocal", changeRequest: request })
        await this.fetchHeadAndCompare()
    }

    /** "Fetch from 'origin'". */
    async fetchHeadAndCompare(): Promise<void> {
        const request = this.store.state().changeRequest
        if (!request) {
            return
        }
        const operationId = `${OPERATION_PREFIX}${++this.operationCount}`
        this.runningOperation = operationId
        this.store.update({ phase: "fetchingHead", error: null })
        try {
            const { folder, remote, provider, number } = request
            const head = await this.hosting.fetchHead({ folder, remote, provider, number }, operationId)
            if (this.isRunning(operationId)) {
                await this.compareService.start(changeRequestIntent(request, head.commit), request)
            }
        } catch (error) {
            if (this.isRunning(operationId)) {
                this.store.update({ phase: "failed", error: fetchErrorOf(error, request) })
            }
        }
    }

    /** Stops a running fetch; the dialog offers it again. */
    async cancelFetch(): Promise<void> {
        const operationId = this.runningOperation
        this.runningOperation = null
        if (operationId === null) {
            return
        }
        if (this.store.state().phase === "fetchingHead") {
            this.store.update({ phase: "headNotLocal" })
        }
        await this.hosting.cancel(operationId)
    }

    /** The branches a request opened by number can target; none when git cannot list them. */
    baseBranchesOf(folder: FolderRef): Promise<string[]> {
        return this.core.branchNames(folder).catch(() => [])
    }

    /** True once for the running operation: afterwards it is no longer the one that runs. */
    private isRunning(operationId: string): boolean {
        const isRunning = this.runningOperation === operationId
        if (isRunning) {
            this.runningOperation = null
        }
        return isRunning
    }
}

function changeRequestIntent(request: ComparedChangeRequest, headCommit: string): CompareIntent {
    const { folder, provider, number, remote, baseRefName } = request
    return { kind: "changeRequest", folder, provider, number, remote, baseRefName, baseCommit: null, headCommit, mergeCommit: null }
}

function fetchErrorOf(error: unknown, request: ComparedChangeRequest): CompareError {
    const label = changeRequestLabel(request.provider, request.number)
    if (error instanceof DesktopBridgeError && error.code === "REF_NOT_ON_REMOTE") {
        return { kind: "coreError", message: `'${request.remote}' has no ${requestNoun(request)} ${label}.` }
    }
    if (error instanceof DesktopBridgeError && error.code === "CORE_UNAVAILABLE") {
        return { kind: "coreUnavailable", message: error.message }
    }
    return { kind: "coreError", message: `${label} could not be fetched: ${(error as Error).message}` }
}

function requestNoun({ provider }: ComparedChangeRequest): string {
    return provider === "gitlab" ? "merge request" : "pull request"
}
