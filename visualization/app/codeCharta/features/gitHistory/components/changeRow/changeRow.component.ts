import { ChangeDetectionStrategy, Component, computed, input, output } from "@angular/core"
import { ChangeRow, isDiscardable, isStageable } from "../../model/changeRows"
import { WAITING_FOR_OPERATION } from "../../util/branchMenu"
import { displayNameOf, entryBadgeOf, fileNameOf, folderOf } from "../../util/changedFileText"
import { SELECTED_ROW_CLASS } from "../../util/rowSelection"

const ROW_CLASS =
    "group/row flex h-7 cursor-pointer select-none items-center gap-1.5 whitespace-nowrap rounded-md px-1 text-sm hover:bg-base-200"
const ACTIVE_ROW_CLASS = "group-focus-visible:outline"
const CONFLICT_DISCARD_TITLE = "Use Abort to undo a merge"

/** The element id `aria-activedescendant` names for a row. */
export function changeRowIdOf(key: string): string {
    return `change-option-${key}`
}

@Component({
    selector: "cc-change-row",
    templateUrl: "./changeRow.component.html",
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: {
        role: "option",
        "data-testid": "change-row",
        "[class]": "rowClass()",
        "[attr.aria-selected]": "isSelected()",
        "[attr.data-row-key]": "row().key",
        "[id]": "rowId()"
    }
})
export class ChangeRowComponent {
    readonly row = input.required<ChangeRow>()
    readonly isSelected = input(false)
    readonly isActive = input(false)
    readonly isBusy = input(false)
    readonly stage = output<void>()
    readonly unstage = output<void>()
    readonly discard = output<void>()

    readonly rowId = computed(() => changeRowIdOf(this.row().key))
    readonly rowClass = computed(() => {
        const selected = this.isSelected() ? SELECTED_ROW_CLASS : ""
        const active = this.isActive() ? ACTIVE_ROW_CLASS : ""
        return `${ROW_CLASS} ${selected} ${active}`.trim()
    })
    readonly badge = computed(() => entryBadgeOf(this.row().entry))
    readonly name = computed(() => displayNameOf(this.row().entry.path, this.row().entry.previousPath))
    readonly folder = computed(() => folderOf(this.row().entry.path))
    readonly fileName = computed(() => fileNameOf(this.row().entry.path))
    readonly isStaged = computed(() => this.row().entry.kind === "staged")
    readonly isStageable = computed(() => isStageable(this.row()))
    readonly isConflicted = computed(() => this.row().entry.kind === "conflicted")
    readonly isDiscardable = computed(() => isDiscardable(this.row()))
    readonly conflictDiscardTitle = CONFLICT_DISCARD_TITLE

    titleOf(action: string): string {
        return this.isBusy() ? WAITING_FOR_OPERATION : `${action} ${this.fileName()}`
    }

    run(event: Event, action: "stage" | "unstage" | "discard") {
        event.stopPropagation()
        this[action].emit()
    }
}
