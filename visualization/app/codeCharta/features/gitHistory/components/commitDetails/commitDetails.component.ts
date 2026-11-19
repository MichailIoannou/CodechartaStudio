import { ChangeDetectionStrategy, Component, computed, inject } from "@angular/core"
import { Router } from "@angular/router"
import type { GitChangedFile } from "../../../../model/coreApi/GitChangedFile"
import type { GitCommitDetails } from "../../../../model/coreApi/GitCommitDetails"
import { routeLinks } from "../../../../routing/routePaths"
import { ViewHandoffStore } from "../../../../routing/viewHandoff.store"
import { CopyToClipboardService } from "../../../../util/copyToClipboard.service"
import { counted, shortSha } from "../../../../util/wording"
import { SelectionItem, WORKING_TREE_KEY } from "../../model/commitSelection"
import { failureOf, readyValueOf } from "../../model/loadState"
import type { CommitAction } from "../../ports/commitActions.port"
import { LOADED_MAP_LOCATOR } from "../../ports/loadedMapLocator.port"
import { CommitActionsService } from "../../services/commitActions.service"
import { CommitDetailsService } from "../../services/commitDetails.service"
import { CommitSelectionService } from "../../services/commitSelection.service"
import { changeBadgeOf, distanceSentence, fileNameOf, folderOf, workingTreeSummary } from "../../util/changedFileText"
import { commitDateTime } from "../../util/commitDate"
import { gitErrorSentence } from "../../util/gitErrorText"

const DETAILS_SHA_LENGTH = 10
const SKELETON_LINE_COUNT = 5

interface SelectedItemLine {
    key: string
    shortSha: string | null
    text: string
}

interface ChangedFileRow {
    file: GitChangedFile
    badge: ReturnType<typeof changeBadgeOf>
    name: string
    folder: string
    nodePath: string | null
}

@Component({
    selector: "cc-commit-details",
    templateUrl: "./commitDetails.component.html",
    providers: [CopyToClipboardService],
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: "flex min-h-0 flex-1 flex-col overflow-auto", "data-testid": "commit-details" }
})
export class CommitDetailsComponent {
    private readonly detailsService = inject(CommitDetailsService)
    private readonly selection = inject(CommitSelectionService)
    private readonly actionsService = inject(CommitActionsService)
    private readonly locator = inject(LOADED_MAP_LOCATOR, { optional: true })
    private readonly router = inject(Router)
    private readonly viewHandoff = inject(ViewHandoffStore)
    readonly clipboard = inject(CopyToClipboardService)

    readonly skeletonLines = Array.from({ length: SKELETON_LINE_COUNT }, (_, index) => index)
    readonly isLocatorProvided = this.locator !== null
    readonly workingTreeText = computed(() => {
        const items = this.selection.selection()?.items ?? []
        return items.length === 1 && items[0].kind === "workingTree" ? workingTreeSummary(items[0].status.counts) : null
    })
    readonly detailsActions = computed(() => {
        const selection = this.selection.selection()
        return selection ? this.actionsService.detailsActionsFor(selection) : []
    })
    readonly twoItemLines = computed<SelectedItemLine[] | null>(() => {
        const items = this.selection.selection()?.items ?? []
        return items.length === 2 ? items.map(lineOf) : null
    })
    readonly distanceText = computed(() => {
        const items = this.selection.selection()?.items ?? []
        const distance = this.detailsService.distance()
        const [newer, older] = items
        if (newer?.kind !== "commit" || older?.kind !== "commit") {
            return null
        }
        if (distance.kind === "failed") {
            return gitErrorSentence(distance.error)
        }
        return distance.kind === "ready" ? distanceSentence(newer.commit.sha, older.commit.sha, distance.value) : null
    })
    readonly isDistanceFailed = computed(() => this.detailsService.distance().kind === "failed")
    readonly isLoading = computed(() => this.detailsService.details().kind === "loading")
    readonly failure = computed(() => {
        const failure = failureOf(this.detailsService.details())
        return failure ? gitErrorSentence(failure) : null
    })
    readonly details = computed(() => readyValueOf(this.detailsService.details()))
    readonly body = computed(() => bodyOf(this.details()))
    readonly displayedSha = computed(() => this.details()?.sha.slice(0, DETAILS_SHA_LENGTH) ?? "")
    readonly authorLine = computed(() => {
        const details = this.details()
        return details ? personLine(details.authorName, details.authorEmail, details.authoredAt) : ""
    })
    readonly committerLine = computed(() => {
        const details = this.details()
        if (!details || (details.committerName === details.authorName && details.committerEmail === details.authorEmail)) {
            return null
        }
        return personLine(details.committerName, details.committerEmail, details.committedAt)
    })
    readonly isMerge = computed(() => (this.details()?.parents.length ?? 0) > 1)
    readonly fileCountText = computed(() => counted(this.details()?.totals.filesChanged ?? 0, "file"))
    readonly files = computed(() => this.details()?.files.map(file => this.rowOf(file)) ?? [])
    readonly omittedFileCount = computed(() => {
        const details = this.details()
        return details?.areFilesTruncated ? details.totals.filesChanged - details.files.length : 0
    })
    readonly omittedFilesText = computed(() => counted(this.omittedFileCount(), "more file"))

    shortShaOf(sha: string): string {
        return shortSha(sha)
    }

    copySha(details: GitCommitDetails) {
        void this.clipboard.copy(details.sha)
    }

    selectParent(sha: string) {
        void this.detailsService.selectCommit(sha)
    }

    retry() {
        this.detailsService.retry()
    }

    runAction(action: CommitAction) {
        const selection = this.selection.selection()
        if (selection) {
            action.run(selection)
        }
    }

    showInMap(nodePath: string) {
        this.viewHandoff.handOverNode("metrics", nodePath)
        void this.router.navigateByUrl(routeLinks.metrics)
    }

    private rowOf(file: GitChangedFile): ChangedFileRow {
        const repo = this.selection.selection()?.repo
        const nodePath = this.locator && repo ? this.locator.nodePathOf(repo, file.path) : null
        const name = file.previousPath ? `${fileNameOf(file.previousPath)} → ${fileNameOf(file.path)}` : fileNameOf(file.path)
        return { file, badge: changeBadgeOf(file.change), name, folder: folderOf(file.path), nodePath }
    }
}

function lineOf(item: SelectionItem): SelectedItemLine {
    if (item.kind === "workingTree") {
        const { staged, unstaged, untracked, conflicted } = item.status.counts
        return { key: WORKING_TREE_KEY, shortSha: null, text: `Uncommitted changes (${staged + unstaged + untracked + conflicted})` }
    }
    return { key: item.commit.sha, shortSha: shortSha(item.commit.sha), text: item.commit.subject }
}

function bodyOf(details: GitCommitDetails | null): string {
    if (!details) {
        return ""
    }
    const [, ...rest] = details.message.split("\n")
    return rest.join("\n").replace(/^\n+/, "")
}

function personLine(name: string, email: string, epochSeconds: number): string {
    return `${name} <${email}> · ${commitDateTime(epochSeconds)}`
}
