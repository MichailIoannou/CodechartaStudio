import {
    ChangeDetectionStrategy,
    Component,
    computed,
    DestroyRef,
    ElementRef,
    effect,
    inject,
    input,
    output,
    signal,
    untracked
} from "@angular/core"
import type { FolderRef } from "../../../../model/coreApi/FolderRef"
import type { GitCommitSummary } from "../../../../model/coreApi/GitCommitSummary"
import type { GitRefs } from "../../../../model/coreApi/GitRefs"
import { shortSha } from "../../../../util/wording"
import { ANALYSED_COMMITS } from "../../ports/analysedCommits.port"
import { GitApiService } from "../../services/gitApi.service"
import {
    commitMatches,
    isSnapshotOption,
    RefOption,
    RefPickerSnapshot,
    RefResolution,
    refOptionGroups,
    resolveRefText
} from "../../util/refOptions"
import { parseRefRange, RefRange } from "../../util/refRange"

export const COMMIT_SEARCH_DELAY_MS = 250

const OPTION_ICONS: Readonly<Record<RefOption["kind"], string>> = {
    branch: "fa-solid fa-code-branch",
    remoteBranch: "fa-solid fa-cloud",
    tag: "fa-solid fa-tag",
    commit: "fa-solid fa-circle-dot",
    workingTree: "fa-solid fa-pen",
    imported: "fa-solid fa-file-import"
}
const ROW_CLASS = "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-base-200"
const ACTIVE_ROW_CLASS = "bg-primary/20"

let nextPickerId = 0

/** A combobox of a folder's branches, tags and commits; typing filters, a pasted `a..b` fills both sides. */
@Component({
    selector: "cc-ref-picker",
    templateUrl: "./refPicker.component.html",
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: "relative block min-w-0" }
})
export class RefPickerComponent {
    private readonly api = inject(GitApiService)
    private readonly markers = inject(ANALYSED_COMMITS, { optional: true })
    private readonly hostElement = inject<ElementRef<HTMLElement>>(ElementRef)
    private readonly refs = signal<GitRefs | null>(null)
    private readonly foundCommits = signal<readonly GitCommitSummary[]>([])
    private readonly knownCommits = signal<ReadonlyMap<string, GitCommitSummary>>(new Map())
    private readonly recentCommits = new Map<string, Promise<readonly GitCommitSummary[]>>()
    private searchTimer: ReturnType<typeof setTimeout> | undefined
    private searchTicket = 0

    readonly repo = input.required<FolderRef>()
    readonly text = input.required<string>()
    readonly label = input.required<string>()
    readonly defaultBranch = input<string | null>(null)
    readonly testId = input("ref-picker")
    /** Working-tree and imported snapshots to offer in a "Snapshots" group after the refs. */
    readonly snapshots = input<readonly RefPickerSnapshot[]>([])
    readonly textChange = output<string>()
    readonly rangePasted = output<RefRange>()
    readonly resolvedChange = output<RefResolution | null>()

    readonly listId = `cc-ref-picker-${nextPickerId++}`
    readonly isOpen = signal(false)
    readonly isSearching = signal(false)
    readonly activeIndex = signal(-1)
    readonly groups = computed(() => {
        const refs = this.refs()
        return refs ? refOptionGroups(refs, this.text(), this.foundCommits(), this.defaultBranch(), this.snapshots()) : []
    })
    readonly options = computed(() => this.groups().flatMap(group => group.options))
    readonly activeOption = computed(() => this.options()[this.activeIndex()] ?? null)
    readonly activeDescendant = computed(() => {
        const active = this.activeOption()
        return active ? this.optionId(active) : null
    })
    readonly noMatchText = computed(() => {
        const query = this.text().trim()
        return query && !this.isSearching() && this.options().length === 0 ? `No branch, tag or commit matches '${query}'.` : null
    })
    readonly resolution = computed(() => {
        const refs = this.refs()
        return refs ? resolveRefText(refs, this.text(), [...this.knownCommits().values()], this.snapshots()) : null
    })
    private readonly analysedShas = computed(() => {
        const markers = this.markers?.markersFor(this.repo())() ?? new Map()
        return new Set([...markers].filter(([, marker]) => marker.state === "analysed").map(([sha]) => sha))
    })

    constructor() {
        effect(() => {
            const repo = this.repo()
            untracked(() => void this.loadRefs(repo))
        })
        effect(() => {
            const resolution = this.resolution()
            untracked(() => this.resolvedChange.emit(resolution))
        })
        inject(DestroyRef).onDestroy(() => clearTimeout(this.searchTimer))
    }

    /** A snapshot is an analysis itself. */
    isAnalysed(option: Pick<RefOption, "kind" | "sha">): boolean {
        return isSnapshotOption(option) || this.analysedShas().has(option.sha)
    }

    hasShortSha(option: Pick<RefOption, "kind">): boolean {
        return option.kind !== "commit" && !isSnapshotOption(option)
    }

    optionId(option: RefOption): string {
        return `${this.listId}-${option.id}`
    }

    rowClass(option: RefOption): string {
        return option.id === this.activeOption()?.id ? `${ROW_CLASS} ${ACTIVE_ROW_CLASS}` : ROW_CLASS
    }

    iconOf(option: RefOption): string {
        return OPTION_ICONS[option.kind]
    }

    displayName(option: RefOption): string {
        return option.kind === "commit" ? shortSha(option.sha) : option.name
    }

    shortShaOf(sha: string): string {
        return shortSha(sha)
    }

    open(): void {
        this.isOpen.set(true)
    }

    focus(): void {
        this.hostElement.nativeElement.querySelector("input")?.focus()
    }

    onInput(text: string): void {
        const range = parseRefRange(text)
        if (range) {
            this.rangePasted.emit(range)
            return
        }
        this.textChange.emit(text)
        this.isOpen.set(true)
        this.activeIndex.set(-1)
        this.scheduleSearch(text)
    }

    pick(option: RefOption): void {
        this.textChange.emit(option.name)
        this.isOpen.set(false)
        this.activeIndex.set(-1)
    }

    onKeydown(event: KeyboardEvent): void {
        if (event.key === "Tab") {
            this.isOpen.set(false)
            return
        }
        if (this.handleListKey(event.key)) {
            event.preventDefault()
            event.stopPropagation()
        }
    }

    onFocusOut(event: FocusEvent): void {
        const next = event.relatedTarget
        if (!(next instanceof Node && this.hostElement.nativeElement.contains(next))) {
            this.isOpen.set(false)
        }
    }

    private handleListKey(key: string): boolean {
        switch (key) {
            case "ArrowDown":
                this.isOpen.set(true)
                return this.moveActive(1)
            case "ArrowUp":
                return this.isOpen() && this.moveActive(-1)
            case "Enter":
                return this.pickActive()
            case "Escape":
                return this.closeList()
            default:
                return false
        }
    }

    /** False when the list was closed already, so a second Escape reaches the dialog. */
    private closeList(): boolean {
        const wasOpen = this.isOpen()
        this.isOpen.set(false)
        return wasOpen
    }

    private moveActive(step: number): boolean {
        const last = this.options().length - 1
        this.activeIndex.update(index => Math.min(Math.max(index + step, 0), last))
        return true
    }

    private pickActive(): boolean {
        const active = this.isOpen() ? this.activeOption() : null
        if (active) {
            this.pick(active)
        }
        return active !== null
    }

    private async loadRefs(repo: FolderRef): Promise<void> {
        this.refs.set(null)
        const answer = await this.api.branches(repo)
        if (answer.ok && this.repo() === repo) {
            this.refs.set(answer.value)
        }
    }

    private scheduleSearch(text: string): void {
        clearTimeout(this.searchTimer)
        const query = text.trim()
        const ticket = ++this.searchTicket
        this.isSearching.set(query !== "")
        this.foundCommits.set([])
        if (query) {
            this.searchTimer = setTimeout(() => void this.searchCommits(query, ticket), COMMIT_SEARCH_DELAY_MS)
        }
    }

    private async searchCommits(query: string, ticket: number): Promise<void> {
        const repo = this.repo()
        const [recent, bySubject] = await Promise.all([this.recentCommitsOf(repo), this.commitsWithSubject(repo, query)])
        if (ticket !== this.searchTicket) {
            return
        }
        const found = commitMatches(query, recent, bySubject)
        this.foundCommits.set(found)
        this.knownCommits.update(known => new Map([...known, ...found.map(commit => [commit.sha, commit] as const)]))
        this.isSearching.set(false)
    }

    /** The newest page of the whole history, asked once per folder; hash prefixes are matched in it. */
    private recentCommitsOf(repo: FolderRef): Promise<readonly GitCommitSummary[]> {
        const key = `${repo.projectId}/${repo.folderId}`
        const cached = this.recentCommits.get(key) ?? this.logCommits(repo, null)
        this.recentCommits.set(key, cached)
        return cached
    }

    private commitsWithSubject(repo: FolderRef, text: string): Promise<readonly GitCommitSummary[]> {
        return this.logCommits(repo, { text, author: null, path: null })
    }

    private async logCommits(repo: FolderRef, filter: { text: string; author: null; path: null } | null) {
        const answer = await this.api.log({ repo, scope: { kind: "all" }, filter, cursor: null })
        return answer.ok ? answer.value.commits : []
    }
}
