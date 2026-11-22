import { ChangeDetectionStrategy, Component, inject, input } from "@angular/core"
import { CopyToClipboardService } from "../../../../util/copyToClipboard.service"

const COPIED_FEEDBACK_MS = 2000

@Component({
    selector: "cc-copy-command",
    templateUrl: "./copyCommand.component.html",
    providers: [CopyToClipboardService],
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: "flex min-w-0 max-w-full" }
})
export class CopyCommandComponent {
    readonly command = input.required<string>()

    readonly clipboard = inject(CopyToClipboardService)

    copy() {
        void this.clipboard.copy(this.command(), COPIED_FEEDBACK_MS)
    }
}
