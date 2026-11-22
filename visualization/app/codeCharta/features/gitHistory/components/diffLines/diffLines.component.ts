import {
    afterNextRender,
    ChangeDetectionStrategy,
    Component,
    computed,
    DestroyRef,
    ElementRef,
    effect,
    inject,
    input,
    signal,
    untracked,
    viewChild
} from "@angular/core"
import { DIFF_LINE_CLASSES, DiffLine, DiffLineKind } from "../../util/diffLines"
import { windowOf } from "../../util/virtualWindow"

/** `h-5`: every diff line is one row of this height, so only the rows in view need rendering. */
const DIFF_ROW_HEIGHT = 20
const OVERSCAN_ROWS = 40

/** The lines of one diff, virtualised; the text is interpolated, never parsed as HTML. */
@Component({
    selector: "cc-diff-lines",
    templateUrl: "./diffLines.component.html",
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: "flex min-h-0 flex-1 flex-col" }
})
export class DiffLinesComponent {
    readonly lines = input.required<readonly DiffLine[]>()
    /** A new file starts at the top; the same file re-read after a change keeps its scroll position. */
    readonly fileKey = input.required<string>()
    private readonly viewport = viewChild<ElementRef<HTMLElement>>("viewport")
    private readonly destroyRef = inject(DestroyRef)
    private readonly scrollTop = signal(0)
    private readonly viewportHeight = signal(0)
    private isScrollFramePending = false

    readonly window = computed(() =>
        windowOf({
            scrollTop: this.scrollTop(),
            viewportHeight: this.viewportHeight(),
            rowHeight: DIFF_ROW_HEIGHT,
            rowCount: this.lines().length,
            overscan: OVERSCAN_ROWS
        })
    )
    readonly visibleLines = computed(() => {
        const { firstIndex, lastIndex } = this.window()
        return this.lines().slice(firstIndex, lastIndex + 1)
    })

    constructor() {
        afterNextRender(() => this.observeViewport())
        effect(() => {
            this.fileKey()
            untracked(() => this.scrollToTop())
        })
    }

    classOf(kind: DiffLineKind): string {
        return DIFF_LINE_CLASSES[kind]
    }

    onScroll() {
        if (this.isScrollFramePending) {
            return
        }
        this.isScrollFramePending = true
        requestAnimationFrame(() => {
            this.isScrollFramePending = false
            this.scrollTop.set(this.viewport()?.nativeElement.scrollTop ?? 0)
        })
    }

    private scrollToTop() {
        const element = this.viewport()?.nativeElement
        if (element) {
            element.scrollTop = 0
        }
        this.scrollTop.set(0)
    }

    private observeViewport() {
        const element = this.viewport()?.nativeElement
        if (!element) {
            return
        }
        const measure = () => this.viewportHeight.set(element.clientHeight)
        measure()
        if (typeof ResizeObserver === "undefined") {
            return
        }
        const observer = new ResizeObserver(measure)
        observer.observe(element)
        this.destroyRef.onDestroy(() => observer.disconnect())
    }
}
