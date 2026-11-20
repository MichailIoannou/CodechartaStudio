import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from "@angular/core"
import type { FolderRef, HostingProvider, KnownHosting } from "../../model/compare.model"
import { ChangeRequestService } from "../../services/changeRequest.service"
import { changeRequestLabel, changeRequestUrl, providerWordingOf, unknownHostText } from "../../services/changeRequestText"
import { HostingCheckService } from "../../services/hostingCheck.service"
import type { PullRequestPanel } from "../../services/pullRequestPanel"

const SKELETON_ROWS = [1, 2, 3, 4, 5]
const PLACEHOLDER_NUMBER = 123

/** Design C7: the "Pull requests" segment of the compare dialog — its empty states and the number entry. */
@Component({
    selector: "cc-change-request-list",
    templateUrl: "./changeRequestList.component.html",
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChangeRequestListComponent {
    private readonly hostingCheck = inject(HostingCheckService)
    private readonly changeRequests = inject(ChangeRequestService)

    readonly folder = input.required<FolderRef>()
    readonly panel = input.required<PullRequestPanel>()
    readonly defaultBranch = input<string | null>(null)
    readonly openDesktopTools = output<void>()
    /** A comparison starts here, so the dialog may close once it shows. */
    readonly started = output<void>()

    readonly skeletonRows = SKELETON_ROWS
    readonly number = signal("")
    readonly baseBranch = signal("")
    readonly branchNames = signal<string[]>([])
    readonly hosting = computed<KnownHosting | null>(() => {
        const panel = this.panel()
        return "hosting" in panel ? panel.hosting : null
    })
    readonly unknownHost = computed(() => {
        const panel = this.panel()
        return panel.kind === "unknownHost" ? panel.host : null
    })
    readonly problemLine = computed(() => {
        const panel = this.panel()
        return panel.kind === "cliProblem" ? panel.line : null
    })
    readonly wording = computed(() => {
        const hosting = this.hosting()
        return hosting ? providerWordingOf(hosting.provider) : null
    })
    readonly numberEntryLabel = computed(() =>
        this.hosting()?.provider === "gitlab" ? "Open merge request by number" : "Open pull request by number"
    )
    readonly parsedNumber = computed(() => {
        const number = Number(this.number().trim())
        return Number.isInteger(number) && number > 0 ? number : null
    })
    readonly canOpen = computed(() => this.parsedNumber() !== null && this.baseBranch() !== "")
    readonly unknownHostText = unknownHostText

    constructor() {
        effect(() => {
            const folder = this.folder()
            const hasNumberEntry = this.hosting() !== null
            if (hasNumberEntry) {
                untracked(() => void this.loadBranches(folder))
            }
        })
    }

    treatHostAs(host: string, provider: HostingProvider): Promise<void> {
        return this.hostingCheck.treatHostAs(this.folder(), host, provider)
    }

    refresh(): Promise<void> {
        return this.hostingCheck.refresh(this.folder())
    }

    async open(): Promise<void> {
        const hosting = this.hosting()
        const number = this.parsedNumber()
        if (!(hosting && number !== null && this.canOpen())) {
            return
        }
        this.started.emit()
        await this.changeRequests.openByNumber({
            folder: this.folder(),
            provider: hosting.provider,
            number,
            remote: hosting.remote,
            baseRefName: this.baseBranch(),
            url: changeRequestUrl(hosting, number)
        })
    }

    placeholderOf(provider: HostingProvider): string {
        return changeRequestLabel(provider, PLACEHOLDER_NUMBER)
    }

    private async loadBranches(folder: FolderRef): Promise<void> {
        const names = await this.changeRequests.baseBranchesOf(folder)
        const preferred = this.defaultBranch()
        this.branchNames.set(preferred && !names.includes(preferred) ? [preferred, ...names] : names)
        if (!this.baseBranch()) {
            this.baseBranch.set(preferred ?? names[0] ?? "")
        }
    }
}
