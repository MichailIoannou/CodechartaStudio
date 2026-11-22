import { ChangeDetectionStrategy, Component, inject } from "@angular/core"
import { CompareFolderChoice } from "../../services/compareFolderChoice"

@Component({
    selector: "cc-compare-folder-row",
    templateUrl: "./compareFolderRow.component.html",
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class CompareFolderRowComponent {
    readonly folders = inject(CompareFolderChoice)
}
