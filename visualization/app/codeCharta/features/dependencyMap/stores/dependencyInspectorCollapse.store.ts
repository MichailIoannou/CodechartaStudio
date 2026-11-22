import { computed, effect, Injectable, inject, signal, untracked } from "@angular/core"
import { DependencyInspectorStore } from "./dependencyInspector.store"

/** Whether the inspector gives way to the explorer as a strip; forgotten once the inspector shows nothing. */
@Injectable({ providedIn: "root" })
export class DependencyInspectorCollapseStore {
    private readonly inspector = inject(DependencyInspectorStore)

    private readonly isCollapsedWhileShown = signal(false)
    private readonly seenSubjectId = signal<string | null>(null)

    readonly isCollapsed = computed(() => this.inspector.isShown() && this.isCollapsedWhileShown())
    readonly isExpanded = computed(() => this.inspector.isShown() && !this.isCollapsedWhileShown())
    readonly hasUnseenSelection = computed(() => this.isCollapsed() && this.inspector.subjectId() !== this.seenSubjectId())

    constructor() {
        effect(() => {
            if (!this.inspector.isShown()) {
                untracked(() => this.isCollapsedWhileShown.set(false))
            }
        })
    }

    /** What the inspector showed when it collapsed counts as seen; subjects selected afterwards do not. */
    collapse(): void {
        this.seenSubjectId.set(this.inspector.subjectId())
        this.isCollapsedWhileShown.set(true)
    }

    expand(): void {
        this.isCollapsedWhileShown.set(false)
    }
}
