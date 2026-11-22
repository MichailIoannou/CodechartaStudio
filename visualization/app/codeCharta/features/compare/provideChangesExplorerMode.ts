import { computed, inject, Provider } from "@angular/core"
import { EXPLORER_CONDITIONAL_MODES, ExplorerMode } from "../sidebarExplorer/facade"
import { CompareStore } from "./stores/compare.store"

export const CHANGES_EXPLORER_MODE: ExplorerMode = {
    id: "changes",
    label: "Changes",
    icon: "fa-solid fa-code-compare",
    searchPlaceholder: "*.js, **/app/*",
    searchAriaLabel: "Search files and folders",
    hidesListTools: true
}

/** The explorer's "Changes" mode, offered while a project comparison shows. */
export function provideChangesExplorerMode(): Provider {
    return {
        provide: EXPLORER_CONDITIONAL_MODES,
        multi: true,
        useFactory: () => {
            const store = inject(CompareStore)
            return computed(() => (store.isActive() || store.isShowingNoDifferences() ? [CHANGES_EXPLORER_MODE] : []))
        }
    }
}
