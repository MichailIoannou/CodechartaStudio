import { computed, Injectable, inject, signal } from "@angular/core"
import { takeUntilDestroyed, toSignal } from "@angular/core/rxjs-interop"
import { ThreeRendererService, ThreeSceneService } from "../../../renderer/threeViewer/threeViewer.facade"
import { SidebarInspectorReadStore } from "../stores/sidebarInspector.read.store"

@Injectable({ providedIn: "root" })
export class InspectorVisibilityService {
    private readonly readStore = inject(SidebarInspectorReadStore)
    private readonly threeSceneService = inject(ThreeSceneService)
    private readonly threeRendererService = inject(ThreeRendererService)

    readonly selectedNode = toSignal(this.readStore.selectedNode$, { initialValue: undefined })

    readonly isVisible = computed(() => this.selectedNode() != null)

    /** Collapsed while the panel on the other side needs the room; forgotten once nothing is selected. */
    private readonly isCollapsedWhileVisible = signal(false)

    readonly isCollapsed = computed(() => this.isVisible() && this.isCollapsedWhileVisible())
    readonly isExpanded = computed(() => this.isVisible() && !this.isCollapsedWhileVisible())

    constructor() {
        this.readStore.selectedNode$.pipe(takeUntilDestroyed()).subscribe(node => {
            if (node == null) {
                this.isCollapsedWhileVisible.set(false)
            }
        })
    }

    collapse() {
        this.isCollapsedWhileVisible.set(true)
    }

    expand() {
        this.isCollapsedWhileVisible.set(false)
    }

    close() {
        this.threeSceneService.clearSelection()
        this.threeRendererService.render()
    }
}
