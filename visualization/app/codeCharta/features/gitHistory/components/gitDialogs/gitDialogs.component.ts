import { ChangeDetectionStrategy, Component } from "@angular/core"
import { BranchDialogComponent } from "../branchDialog/branchDialog.component"
import { GitConfirmDialogComponent } from "../gitConfirmDialog/gitConfirmDialog.component"

/** Hosted once by the app, so the sync button and every other git action can ask from any view (design H5). */
@Component({
    selector: "cc-git-dialogs",
    template: "<cc-branch-dialog /><cc-git-confirm-dialog />",
    imports: [BranchDialogComponent, GitConfirmDialogComponent],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class GitDialogsComponent {}
