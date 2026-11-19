import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, signal, untracked } from "@angular/core"
import { SettingsPopoverShellComponent } from "../../../shared/facade"
import { CommitFilter, GitLogService, NO_FILTER } from "../../services/gitLog.service"

export const FILTER_DEBOUNCE_MS = 300

type FilterField = keyof CommitFilter

@Component({
    selector: "cc-commit-filters",
    templateUrl: "./commitFilters.component.html",
    imports: [SettingsPopoverShellComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: "@container flex flex-col gap-1" }
})
export class CommitFiltersComponent {
    private readonly log = inject(GitLogService)
    private pendingFilter?: ReturnType<typeof setTimeout>

    readonly draft = signal<CommitFilter>(this.log.filter())
    readonly isAnySet = computed(() => Object.values(this.draft()).some(value => value.trim() !== ""))
    readonly hiddenFilterCount = computed(() => [this.draft().author, this.draft().path].filter(value => value.trim() !== "").length)
    readonly isFiltered = this.log.isFiltered

    constructor() {
        effect(() => {
            const applied = this.log.filter()
            untracked(() => this.draft.set(applied))
        })
        inject(DestroyRef).onDestroy(() => clearTimeout(this.pendingFilter))
    }

    update(field: FilterField, event: Event) {
        const value = (event.target as HTMLInputElement).value
        this.draft.update(filter => ({ ...filter, [field]: value }))
        clearTimeout(this.pendingFilter)
        this.pendingFilter = setTimeout(() => this.log.setFilter(this.draft()), FILTER_DEBOUNCE_MS)
    }

    clear() {
        clearTimeout(this.pendingFilter)
        this.draft.set(NO_FILTER)
        this.log.clearFilter()
    }
}
