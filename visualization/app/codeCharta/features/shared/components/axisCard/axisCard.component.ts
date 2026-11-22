import { NgTemplateOutlet } from "@angular/common"
import {
    afterRenderEffect,
    ChangeDetectionStrategy,
    Component,
    computed,
    ElementRef,
    InjectionToken,
    inject,
    input,
    TemplateRef
} from "@angular/core"
import { injectIsAnyPopoverOpen } from "../../util/injectIsAnyPopoverOpen"
import { maxContentWidth } from "../../util/maxContentWidth"
import { measureShortenedTextWidth } from "../../util/measureTextWidth"
import { fontsLoadedSignal, shortestCellWidth } from "../../util/shortestCellWidth"
import { BAR_CELL_CLASSES, openBarCellClasses } from "../barShell/barCell"
import { AxisCardHeaderComponent } from "./axisCardHeader.component"

/** Provided by a bar whose cards never get narrower than their label row, their meta value or this many characters of the name plus "…". */
export const SHORTEST_CARD_NAME_CHARACTERS = new InjectionToken<number>("SHORTEST_CARD_NAME_CHARACTERS")

@Component({
    selector: "cc-axis-card",
    templateUrl: "./axisCard.component.html",
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: {
        class: `group relative flex min-w-0 flex-col items-stretch ${BAR_CELL_CLASSES}`,
        "[class]": "openClasses()"
    },
    imports: [NgTemplateOutlet, AxisCardHeaderComponent]
})
export class AxisCardComponent {
    readonly label = input.required<string>()
    readonly metricName = input<string | null>(null)
    readonly hasCog = input(false)
    readonly cogPopoverId = input<string | null>(null)
    readonly cogAnchorName = input<string | null>(null)
    readonly cogIcon = input<TemplateRef<unknown> | null>(null)
    readonly cogTitle = input("Settings")
    readonly searchPopoverId = input<string | null>(null)
    readonly searchAnchorName = input<string | null>(null)
    readonly disabled = input(false)
    readonly dimmed = input(false)
    readonly testId = input<string | null>(null)
    readonly cogTestId = input<string | null>(null)
    readonly minWidthClass = input("")

    readonly cardClasses = "flex flex-col items-stretch gap-1 max-w-[180px] min-w-0"

    private readonly host: HTMLElement = inject(ElementRef).nativeElement
    private readonly shortestNameCharacters = inject(SHORTEST_CARD_NAME_CHARACTERS, { optional: true })

    constructor() {
        const shortestNameCharacters = this.shortestNameCharacters
        if (shortestNameCharacters === null) {
            return
        }
        const areFontsLoaded = fontsLoadedSignal()
        afterRenderEffect(() => {
            this.metricName()
            this.label()
            areFontsLoaded()
            this.host.style.minWidth = `${this.shortestWidth(shortestNameCharacters)}px`
        })
    }

    private shortestWidth(shortestNameCharacters: number): number {
        const widthOf = (selector: string) => {
            const part = this.host.querySelector<HTMLElement>(selector)
            return part ? maxContentWidth(part) : 0
        }
        const name = this.host.querySelector<HTMLElement>("[data-card-name]")
        const shortestName = name ? measureShortenedTextWidth(name.textContent?.trim() ?? "", shortestNameCharacters, name) : 0
        return shortestCellWidth(this.host, [widthOf("[data-card-header]"), widthOf("[data-card-body]"), shortestName])
    }

    private readonly isPopoverOpen = injectIsAnyPopoverOpen(() => [this.cogPopoverId(), this.searchPopoverId()])
    protected readonly openClasses = computed(() => openBarCellClasses(this.isPopoverOpen()))

    readonly bodyAnchorStyle = computed(() => {
        const anchor = this.searchAnchorName()
        return anchor ? `--${anchor}` : null
    })

    readonly contentButtonClasses = computed(() => {
        const classes = ["flex", "flex-col", "items-stretch", "gap-1", "bg-transparent", "border-0", "p-0", "text-current"]
        if (this.disabled()) {
            classes.push("cursor-default")
        } else {
            classes.push("cursor-pointer")
        }
        return classes.join(" ")
    })
}
