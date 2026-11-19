import { computed, effect, Injectable, inject, signal } from "@angular/core"
import type { GitLogScope } from "../../../model/coreApi/GitLogScope"
import { GitRepositoryService } from "./gitRepository.service"

const ALL_BRANCHES: GitLogScope = { kind: "all" }

/** What the commit list is limited to. The commit pages themselves arrive with the commit list. */
@Injectable({ providedIn: "root" })
export class GitLogService {
    private readonly scopeState = signal<GitLogScope>(ALL_BRANCHES)

    readonly scope = this.scopeState.asReadonly()
    readonly scopedRefNames = computed<readonly string[]>(() => {
        const scope = this.scopeState()
        return scope.kind === "refs" ? scope.refNames : []
    })

    constructor() {
        const repository = inject(GitRepositoryService)
        effect(() => {
            repository.activeRepository()
            this.scopeState.set(ALL_BRANCHES)
        })
    }

    showAllBranches(): void {
        this.scopeState.set(ALL_BRANCHES)
    }

    /** Adding keeps the refs already scoped; a ref added twice leaves the scope again. */
    scopeTo(refName: string, { isAdded = false } = {}): void {
        const current = isAdded ? this.scopedRefNames() : []
        const refNames = current.includes(refName) ? current.filter(name => name !== refName) : [...current, refName]
        this.scopeState.set(refNames.length > 0 ? { kind: "refs", refNames } : ALL_BRANCHES)
    }
}
