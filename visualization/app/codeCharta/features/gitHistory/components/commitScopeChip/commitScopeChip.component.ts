import { ChangeDetectionStrategy, Component, computed, inject } from "@angular/core"
import { GitLogService } from "../../services/gitLog.service"
import { refShortName } from "../../util/refNames"

@Component({
    selector: "cc-commit-scope-chip",
    templateUrl: "./commitScopeChip.component.html",
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class CommitScopeChipComponent {
    private readonly log = inject(GitLogService)

    readonly refNames = this.log.scopedRefNames
    readonly label = computed(() => this.refNames().map(refShortName).join(", "))
    readonly title = computed(() => this.refNames().join("\n"))

    showAllBranches() {
        this.log.showAllBranches()
    }
}
