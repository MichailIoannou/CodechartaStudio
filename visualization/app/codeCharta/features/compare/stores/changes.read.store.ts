import { computed, Injectable, inject } from "@angular/core"
import { toSignal } from "@angular/core/rxjs-interop"
import { Store } from "@ngrx/store"
import { accumulatedDataSelector, pathToNodeSelector } from "../../../renderer/renderModel/renderModel.facade"
import { areaMetricSelector, heightMetricSelector, mapColorsSelector } from "../../../stores/mapState/mapState.read.facade"
import { changedFilesFilterSelector, selectedNodePathSelector } from "../../../stores/sharedView/sharedView.read.facade"

/** What the Changes list reads from the map: the delta tree, its nodes by path, the metrics, the filter and the delta colours. */
@Injectable({ providedIn: "root" })
export class ChangesReadStore {
    private readonly store = inject(Store)

    readonly accumulatedData = toSignal(this.store.select(accumulatedDataSelector), { requireSync: true })
    readonly pathToNode = toSignal(this.store.select(pathToNodeSelector), { requireSync: true })
    readonly areaMetric = toSignal(this.store.select(areaMetricSelector), { requireSync: true })
    readonly heightMetric = toSignal(this.store.select(heightMetricSelector), { requireSync: true })
    readonly changedFilesFilter = toSignal(this.store.select(changedFilesFilterSelector), { requireSync: true })
    readonly selectedNodePath = toSignal(this.store.select(selectedNodePathSelector), { requireSync: true })
    private readonly mapColors = toSignal(this.store.select(mapColorsSelector), { requireSync: true })
    readonly areDeltaColorsInverted = computed(() => this.mapColors().areDeltaColorsInverted ?? false)
}
