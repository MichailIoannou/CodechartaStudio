import { ChangeDetectionStrategy, Component, computed, effect, inject, OnInit, output, signal, untracked } from "@angular/core"
import { relativeTime } from "../../../../util/wording"
import { ProjectsFacade } from "../../../projects/facade"
import { RecentComparison, RecentComparisonsRepo } from "../../repos/recentComparisons.repo"
import { segmentLabelOf } from "../../services/changeRequestText"
import { CompareFolderChoice } from "../../services/compareFolderChoice"
import { rangeOf } from "../../services/comparisonText"
import { HostingCheckService } from "../../services/hostingCheck.service"
import { ChangeRequestListComponent } from "../changeRequestList/changeRequestList.component"

const MILLISECONDS_PER_SECOND = 1000

type ListSegment = "changeRequests" | "recent"

interface RecentRow {
    recent: RecentComparison
    range: string
    folderLabel: string | null
    age: string
    comparedAtTitle: string
}

/** The compare dialog's lists: the folder's pull or merge requests and the recent comparisons of the project. */
@Component({
    selector: "cc-compare-lists",
    templateUrl: "./compareLists.component.html",
    imports: [ChangeRequestListComponent],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class CompareListsComponent implements OnInit {
    private readonly projects = inject(ProjectsFacade)
    private readonly recentComparisonsRepo = inject(RecentComparisonsRepo)
    private readonly hostingCheck = inject(HostingCheckService)
    readonly folders = inject(CompareFolderChoice)

    readonly recentPicked = output<RecentComparison>()
    readonly openDesktopTools = output<void>()
    readonly started = output<void>()
    readonly chosenList = signal<ListSegment>("changeRequests")
    readonly recentComparisons = signal<RecentRow[]>([])

    readonly pullRequestPanel = computed(() => {
        const repo = this.folders.repo()
        return repo ? this.hostingCheck.panelOf(repo) : ({ kind: "absent" } as const)
    })
    readonly hasChangeRequestSegment = computed(() => this.pullRequestPanel().kind !== "absent")
    readonly changeRequestSegmentLabel = computed(() => {
        const panel = this.pullRequestPanel()
        return segmentLabelOf("hosting" in panel ? panel.hosting.provider : null)
    })
    readonly shownList = computed<ListSegment>(() => (this.hasChangeRequestSegment() ? this.chosenList() : "recent"))

    constructor() {
        effect(() => {
            const repo = this.folders.repo()
            if (repo) {
                untracked(() => void this.hostingCheck.check(repo))
            }
        })
    }

    ngOnInit(): void {
        const projectId = this.projects.activeProject()?.id ?? ""
        this.recentComparisons.set(this.recentRowsOf(this.recentComparisonsRepo.read(projectId)))
    }

    chooseList(list: ListSegment): void {
        this.chosenList.set(list)
    }

    private recentRowsOf(recents: RecentComparison[]): RecentRow[] {
        const folders = this.folders.gitFolders()
        const isLabelled = folders.length > 1
        const labelOf = (folderId: string) => folders.find(folder => folder.id === folderId)?.label ?? null
        const foldersOf = (recent: RecentComparison) =>
            recent.headFolderId ? `${labelOf(recent.folderId)} → ${labelOf(recent.headFolderId)}` : labelOf(recent.folderId)
        return recents
            .filter(recent =>
                [recent.folderId, recent.headFolderId ?? recent.folderId].every(id => folders.some(folder => folder.id === id))
            )
            .map(recent => ({
                recent,
                range: rangeOf(recent.base, recent.head, recent.baseMode),
                folderLabel: isLabelled ? foldersOf(recent) : null,
                age: relativeTime(recent.comparedAt / MILLISECONDS_PER_SECOND, Date.now()),
                comparedAtTitle: new Date(recent.comparedAt).toLocaleString()
            }))
    }
}
