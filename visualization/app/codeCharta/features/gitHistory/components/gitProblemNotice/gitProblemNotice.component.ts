import { ChangeDetectionStrategy, Component, input, output } from "@angular/core"
import { CopyCommandComponent } from "../../../shared/facade"
import type { GitFolderChoice, GitProblemNotice } from "../../util/gitErrorText"

@Component({
    selector: "cc-git-problem-notice",
    templateUrl: "./gitProblemNotice.component.html",
    imports: [CopyCommandComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: "flex min-h-0 flex-1 items-center justify-center p-4" }
})
export class GitProblemNoticeComponent {
    readonly notice = input.required<GitProblemNotice>()
    readonly relinkFolder = output<void>()
    readonly openDesktopTools = output<void>()
    readonly workInFolder = output<GitFolderChoice>()
    readonly chooseWorkingFolder = output<void>()
}
