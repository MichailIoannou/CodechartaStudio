import { ChangeDetectionStrategy, Component, inject, signal } from "@angular/core"
import { ToastAction, ToastService } from "../../services/toast.service"
import { CopyCommandComponent } from "../copyCommand/copyCommand.component"

@Component({
    selector: "cc-toast",
    templateUrl: "./toast.component.html",
    imports: [CopyCommandComponent],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ToastComponent {
    private readonly toastService = inject(ToastService)
    private readonly expandedIds = signal<ReadonlySet<number>>(new Set())

    protected readonly messages = this.toastService.messages

    protected isExpanded(id: number): boolean {
        return this.expandedIds().has(id)
    }

    protected toggleDetails(id: number): void {
        this.expandedIds.update(ids => {
            const next = new Set(ids)
            if (!next.delete(id)) {
                next.add(id)
            }
            return next
        })
    }

    protected runAction(id: number, action: ToastAction): void {
        action.run()
        this.dismiss(id)
    }

    protected dismiss(id: number): void {
        this.expandedIds.update(ids => new Set([...ids].filter(expandedId => expandedId !== id)))
        this.toastService.dismiss(id)
    }
}
