import { computed, DestroyRef, DOCUMENT, inject, Signal, signal } from "@angular/core"

type PopoverToggleEvent = Event & { newState?: string }

/** Popovers open and close in the browser; their `toggle` events do not bubble, so they are caught on the way down. */
export function injectIsAnyPopoverOpen(popoverIds: () => readonly (string | null)[]): Signal<boolean> {
    const openPopoverIds = signal<ReadonlySet<string>>(new Set())
    const document = inject(DOCUMENT)

    const onToggle = (event: PopoverToggleEvent) => {
        const popoverId = event.target instanceof Element ? event.target.id : ""
        if (popoverId && popoverIds().includes(popoverId)) {
            openPopoverIds.update(openIds => withPopover(openIds, popoverId, event.newState === "open"))
        }
    }

    document.addEventListener("toggle", onToggle, true)
    inject(DestroyRef).onDestroy(() => document.removeEventListener("toggle", onToggle, true))
    return computed(() => openPopoverIds().size > 0)
}

function withPopover(openIds: ReadonlySet<string>, popoverId: string, isOpen: boolean): ReadonlySet<string> {
    const nextIds = new Set(openIds)
    if (isOpen) {
        nextIds.add(popoverId)
    } else {
        nextIds.delete(popoverId)
    }
    return nextIds
}
