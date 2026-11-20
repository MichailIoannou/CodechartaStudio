import { Injectable, inject } from "@angular/core"
import { toSignal } from "@angular/core/rxjs-interop"
import { Store } from "@ngrx/store"
import { selectedNodePathSelector } from "../../../stores/sharedView/sharedView.read.facade"

/** The selected building's path, for the inspector's git change line. */
@Injectable({ providedIn: "root" })
export class SelectedFileReadStore {
    private readonly store = inject(Store)

    readonly selectedNodePath = toSignal(this.store.select(selectedNodePathSelector), { requireSync: true })
}
