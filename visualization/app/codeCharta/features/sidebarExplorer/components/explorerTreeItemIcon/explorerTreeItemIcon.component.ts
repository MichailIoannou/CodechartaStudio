import { ChangeDetectionStrategy, Component, computed, input } from "@angular/core"

@Component({
    selector: "cc-explorer-tree-item-icon",
    templateUrl: "./explorerTreeItemIcon.component.html",
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ExplorerTreeItemIconComponent {
    private static readonly INACTIVE_ROW_COLOR = "color-mix(in srgb, var(--color-base-content) 35%, transparent)"

    readonly isFolder = input.required<boolean>()
    readonly isOpen = input.required<boolean>()
    readonly isInactive = input<boolean>(false)
    readonly markingColor = input<string | null>(null)

    readonly iconClass = computed(() => {
        if (!this.isFolder()) {
            return "fa fa-file-o"
        }
        return this.isOpen() ? "fa fa-folder-open" : "fa fa-folder"
    })

    readonly iconColor = computed((): string | undefined => {
        if (this.isInactive()) {
            return ExplorerTreeItemIconComponent.INACTIVE_ROW_COLOR
        }
        if (!this.isFolder()) {
            return undefined
        }
        return this.markingColor() ?? undefined
    })
}
