import { ChangeDetectionStrategy, Component, inject, input, output } from "@angular/core"
import { CopyToClipboardService } from "../../../../util/copyToClipboard.service"
import type { GitProblemNotice } from "../../util/gitErrorText"

@Component({
    selector: "cc-git-problem-notice",
    templateUrl: "./gitProblemNotice.component.html",
    providers: [CopyToClipboardService],
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: "flex min-h-0 flex-1 items-center justify-center p-4" }
})
export class GitProblemNoticeComponent {
    readonly notice = input.required<GitProblemNotice>()
    readonly relinkFolder = output<void>()
    readonly openDesktopTools = output<void>()

    readonly clipboard = inject(CopyToClipboardService)

    copyCommand(command: string) {
        void this.clipboard.copy(command)
    }
}
