import { computed, effect, Injectable, inject, signal, untracked } from "@angular/core"
import type { GitCommitSummary } from "../../../model/coreApi/GitCommitSummary"
import type { GitStatus } from "../../../model/coreApi/GitStatus"
import { CommitSelection, SelectionItem, selectionKeyOf } from "../model/commitSelection"
import { readyValueOf } from "../model/loadState"
import { GitLogService } from "./gitLog.service"
import { GitRepositoryService } from "./gitRepository.service"

const BEFORE_EVERY_COMMIT = -1

/**
 * What the commit list has selected: one item, or two to compare. The first item is the one picked first; the second
 * is the one Ctrl+click or Shift+arrow added, and the next such pick replaces it.
 */
@Injectable({ providedIn: "root" })
export class CommitSelectionService {
    private readonly repository = inject(GitRepositoryService)
    private readonly log = inject(GitLogService)
    private readonly first = signal<SelectionItem | null>(null)
    private readonly second = signal<SelectionItem | null>(null)
    private readonly focused = signal<string | null>(null)

    readonly focusedKey = this.focused.asReadonly()
    readonly secondKey = computed(() => {
        const second = this.second()
        return second ? selectionKeyOf(second) : null
    })
    readonly selectedKeys = computed<ReadonlySet<string>>(() => new Set(this.orderedItems().map(selectionKeyOf)))
    readonly selection = computed<CommitSelection | null>(() => {
        const repo = this.repository.activeRepository()
        const items = this.orderedItems()
        return repo && items.length > 0 ? { repo, items } : null
    })
    /** The SHA while exactly one commit is selected. */
    readonly selectedSha = computed(() => {
        const items = this.orderedItems()
        return items.length === 1 && items[0].kind === "commit" ? items[0].commit.sha : null
    })

    private readonly orderedItems = computed<readonly SelectionItem[]>(() => {
        const items = [this.first(), this.second()].filter(item => item !== null)
        return items.length === 2 ? [...items].sort((one, other) => this.listIndexOf(one) - this.listIndexOf(other)) : items
    })

    constructor() {
        effect(() => {
            this.repository.activeRepository()
            untracked(() => this.clear())
        })
        effect(() => {
            this.log.firstPageLoads()
            untracked(() => this.keepListedCommits())
        })
        effect(() => {
            const count = this.log.uncommittedChangeCount()
            const status = readyValueOf(this.repository.status())
            untracked(() => this.followWorkingTree(count === null ? null : status))
        })
    }

    select(item: SelectionItem): void {
        this.first.set(item)
        this.second.set(null)
        this.focused.set(selectionKeyOf(item))
    }

    /** Ctrl+click: adds a second item, replaces the second, or drops an item already selected while two are. */
    extend(item: SelectionItem): void {
        const key = selectionKeyOf(item)
        const first = this.first()
        if (!first) {
            this.select(item)
            return
        }
        if (this.second() && this.selectedKeys().has(key)) {
            this.dropItem(key)
            return
        }
        if (selectionKeyOf(first) !== key) {
            this.second.set(item)
        }
        this.focused.set(key)
    }

    /** Shift+arrow: the second item follows the focus; back on the first item, only the first stays. */
    setSecond(item: SelectionItem): void {
        const first = this.first()
        if (!first) {
            this.select(item)
            return
        }
        const key = selectionKeyOf(item)
        this.second.set(selectionKeyOf(first) === key ? null : item)
        this.focused.set(key)
    }

    dropSecond(): void {
        this.second.set(null)
        const first = this.first()
        this.focused.set(first ? selectionKeyOf(first) : null)
    }

    clear(): void {
        this.first.set(null)
        this.second.set(null)
        this.focused.set(null)
    }

    private dropItem(key: string): void {
        const remaining = [this.first(), this.second()].find(item => item !== null && selectionKeyOf(item) !== key) ?? null
        this.first.set(remaining)
        this.second.set(null)
        this.focused.set(remaining ? selectionKeyOf(remaining) : null)
    }

    /** After a reload of page one: listed commits take their fresh summary; a commit no page can list any more goes. */
    private keepListedCommits(): void {
        const listed = new Map(this.log.commits().map(commit => [commit.sha, commit]))
        const isComplete = !this.log.hasMore()
        this.replaceItems(item => {
            if (item.kind !== "commit") {
                return item
            }
            const fresh = listed.get(item.commit.sha)
            return fresh ? { kind: "commit", commit: fresh } : isComplete ? null : item
        })
    }

    private followWorkingTree(status: GitStatus | null): void {
        this.replaceItems(item => (item.kind === "workingTree" ? (status ? { kind: "workingTree", status } : null) : item))
    }

    private replaceItems(replace: (item: SelectionItem) => SelectionItem | null): void {
        const first = this.first()
        const second = this.second()
        const replacedFirst = first && replace(first)
        const replacedSecond = second && replace(second)
        if (replacedFirst === first && replacedSecond === second) {
            return
        }
        const kept = [replacedFirst, replacedSecond].filter(item => item !== null)
        this.first.set(kept[0] ?? null)
        this.second.set(kept[1] ?? null)
        const focusedKey = this.focused()
        if (!kept.some(item => selectionKeyOf(item) === focusedKey)) {
            this.focused.set(kept[0] ? selectionKeyOf(kept[0]) : null)
        }
    }

    private listIndexOf(item: SelectionItem): number {
        if (item.kind === "workingTree") {
            return BEFORE_EVERY_COMMIT
        }
        const index = this.log.commits().findIndex((commit: GitCommitSummary) => commit.sha === item.commit.sha)
        return index === BEFORE_EVERY_COMMIT ? Number.MAX_SAFE_INTEGER : index
    }
}
