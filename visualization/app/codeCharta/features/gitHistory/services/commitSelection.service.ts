import { computed, effect, Injectable, inject, signal } from "@angular/core"
import type { CommitSelection, SelectionItem } from "../model/commitSelection"
import { GitRepositoryService } from "./gitRepository.service"

/** What the commit list has selected; the details pane shows it. One item for now — the second selection comes with 04-M5. */
@Injectable({ providedIn: "root" })
export class CommitSelectionService {
    private readonly repository = inject(GitRepositoryService)
    private readonly items = signal<readonly SelectionItem[]>([])

    readonly selection = computed<CommitSelection | null>(() => {
        const repo = this.repository.activeRepository()
        const items = this.items()
        return repo && items.length > 0 ? { repo, items } : null
    })
    readonly selectedSha = computed(() => {
        const first = this.items()[0]
        return first?.kind === "commit" ? first.commit.sha : null
    })
    readonly isWorkingTreeSelected = computed(() => this.items()[0]?.kind === "workingTree")

    constructor() {
        effect(() => {
            this.repository.activeRepository()
            this.items.set([])
        })
    }

    select(item: SelectionItem): void {
        this.items.set([item])
    }

    clear(): void {
        this.items.set([])
    }
}
