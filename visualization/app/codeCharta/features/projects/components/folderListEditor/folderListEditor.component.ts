import { ChangeDetectionStrategy, Component, computed, input, linkedSignal, output } from "@angular/core"
import type { FolderRole } from "../../../../model/coreApi/FolderRole"
import { FOLDER_ROLES, FolderListRow, labelProblem } from "../../util/folderListRows"

const LABEL_MAX_LENGTH = 60

export interface FolderLabelChange {
    key: string
    label: string
}

export interface FolderRoleChange {
    key: string
    role: FolderRole
}

@Component({
    selector: "cc-folder-list-editor",
    templateUrl: "./folderListEditor.component.html",
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class FolderListEditorComponent {
    readonly rows = input.required<FolderListRow[]>()
    readonly managesSavedFolders = input(false)

    readonly labelChange = output<FolderLabelChange>()
    readonly roleChange = output<FolderRoleChange>()
    readonly remove = output<FolderListRow>()
    readonly relink = output<FolderListRow>()
    readonly refresh = output<FolderListRow>()

    readonly roles = FOLDER_ROLES
    readonly labelMaxLength = LABEL_MAX_LENGTH
    readonly editedLabels = linkedSignal<FolderListRow[], Record<string, string>>({
        source: this.rows,
        computation: rows => Object.fromEntries(rows.map(row => [row.key, row.label]))
    })
    readonly problems = computed(() => {
        const labels = this.editedLabels()
        const problemOf = (row: FolderListRow) => {
            const otherLabels = this.rows()
                .filter(other => other.key !== row.key)
                .map(other => labels[other.key] ?? other.label)
            return labels[row.key] === row.label ? null : labelProblem(labels[row.key] ?? "", otherLabels)
        }
        return Object.fromEntries(this.rows().map(row => [row.key, problemOf(row)]))
    })
    readonly hasProblems = computed(() => Object.values(this.problems()).some(problem => problem !== null))

    editLabel(row: FolderListRow, label: string) {
        this.editedLabels.update(labels => ({ ...labels, [row.key]: label }))
    }

    commitLabel(row: FolderListRow) {
        const label = this.editedLabels()[row.key]?.trim() ?? ""
        if (label === row.label || this.problems()[row.key] !== null) {
            return
        }
        if (label === "") {
            this.editLabel(row, row.label)
            return
        }
        this.labelChange.emit({ key: row.key, label })
    }

    changeRole(row: FolderListRow, role: string) {
        this.roleChange.emit({ key: row.key, role: role as FolderRole })
    }
}
