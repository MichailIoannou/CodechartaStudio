import { Injectable, inject } from "@angular/core"
import { Store } from "@ngrx/store"
import type { CcState } from "../../../model/codeCharta.model"
import { pathToNodeSelector } from "../../../renderer/renderModel/renderModel.facade"

/** The nodes of the map shown now, by path. */
@Injectable({ providedIn: "root" })
export class LoadedMapReadStore {
    readonly pathToNode = inject<Store<CcState>>(Store).selectSignal(pathToNodeSelector)
}
