import { afterNextRender, DestroyRef, Directive, ElementRef, effect, inject, input, signal } from "@angular/core"

export const TOAST_OFFSET_CSS_VARIABLE = "--cc-toast-offset"

/**
 * Moves the toasts down by the height of the element while `ccToastOffset` is true, so they never cover it.
 * A kept-alive view is not destroyed when it is hidden, so its owner says when the element is on screen.
 */
@Directive({ selector: "[ccToastOffset]" })
export class ToastOffsetDirective {
    readonly isOnScreen = input.required<boolean>({ alias: "ccToastOffset" })

    private readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement
    private readonly destroyRef = inject(DestroyRef)
    private readonly height = signal(0)
    private readonly root = document.documentElement

    constructor() {
        afterNextRender(() => this.observeHeight())
        effect(() => {
            if (this.isOnScreen()) {
                this.root.style.setProperty(TOAST_OFFSET_CSS_VARIABLE, `${this.height()}px`)
            } else {
                this.root.style.removeProperty(TOAST_OFFSET_CSS_VARIABLE)
            }
        })
        this.destroyRef.onDestroy(() => this.root.style.removeProperty(TOAST_OFFSET_CSS_VARIABLE))
    }

    private observeHeight() {
        const measure = () => this.height.set(Math.round(this.element.getBoundingClientRect().height))
        measure()
        if (typeof ResizeObserver === "undefined") {
            return
        }
        const observer = new ResizeObserver(measure)
        observer.observe(this.element)
        this.destroyRef.onDestroy(() => observer.disconnect())
    }
}
