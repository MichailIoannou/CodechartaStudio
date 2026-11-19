import { ChangeDetectionStrategy, Component, computed, ElementRef, HostListener, inject, signal } from "@angular/core"
import { CopyToClipboardService } from "../../../../util/copyToClipboard.service"
import { ToastService } from "../../../shared/facade"
import type { LoadedSide, ResolvedComparison } from "../../model/compare.model"
import { CompareService } from "../../services/compare.service"
import { rangeText, refName, sideCaption, staleTitle } from "../../services/comparisonText"
import { CompareStore } from "../../stores/compare.store"

interface BaseModeBadge {
    text: string
    title: string
}

interface ChipSide {
    caption: string
    shortCommit: string
    label: string | null
    staleBy: number
    staleTitle: string
}

@Component({
    selector: "cc-comparison-chip",
    templateUrl: "./comparisonChip.component.html",
    providers: [CopyToClipboardService],
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: "min-w-0" }
})
export class ComparisonChipComponent {
    private readonly store = inject(CompareStore)
    private readonly service = inject(CompareService)
    private readonly clipboard = inject(CopyToClipboardService)
    private readonly toastService = inject(ToastService)
    private readonly hostElement = inject<ElementRef<HTMLElement>>(ElementRef)

    readonly isMenuOpen = signal(false)
    readonly isNoDifferences = this.store.isShowingNoDifferences
    readonly base = computed(() => chipSideOf("base", this.store.state().base))
    readonly head = computed(() => chipSideOf("head", this.store.state().head))
    readonly baseModeBadge = computed(() => baseModeBadgeOf(this.store.state().resolved))

    @HostListener("document:click", ["$event"])
    closeMenuOnOutsideClick(event: MouseEvent): void {
        if (this.isMenuOpen() && event.target instanceof Node && !this.hostElement.nativeElement.contains(event.target)) {
            this.isMenuOpen.set(false)
        }
    }

    toggleMenu(): void {
        this.isMenuOpen.update(isOpen => !isOpen)
    }

    change(): void {
        this.isMenuOpen.set(false)
        const { base, head } = this.store.state()
        const folder = head?.requested.folder
        this.store.openDialog({
            ...(folder ? { folder } : {}),
            ...(base ? { base: refName(base.requested) } : {}),
            ...(head ? { head: refName(head.requested) } : {})
        })
    }

    swap(): void {
        this.isMenuOpen.set(false)
        this.service.swap()
    }

    async copyAsText(): Promise<void> {
        this.isMenuOpen.set(false)
        const { base, head, resolved } = this.store.state()
        if (!(base && head)) {
            return
        }
        const text = rangeText(resolved?.baseTip ?? base.requested, head.requested, resolved?.baseMode ?? "tip")
        await this.clipboard.copy(text)
        this.toastService.show(`Copied ${text}`)
    }

    leave(): void {
        this.isMenuOpen.set(false)
        this.service.exit()
    }
}

/** Only a comparison of branches or a pull request has a base mode worth naming. */
function baseModeBadgeOf(resolved: ResolvedComparison | null): BaseModeBadge | null {
    if (!resolved || resolved.origin === "commits") {
        return null
    }
    const head = refName(resolved.head.requested)
    const target = refName(resolved.baseTip ?? resolved.base.requested)
    return resolved.baseMode === "mergeBase"
        ? { text: "since merge base", title: `Changes on '${head}' since it left '${target}'` }
        : { text: "tip vs tip", title: "Everything that differs between the two tips" }
}

function chipSideOf(caption: string, side: LoadedSide | null): ChipSide | null {
    return side
        ? {
              caption,
              shortCommit: side.requested.shortCommit,
              label: sideCaption(side.requested),
              staleBy: side.staleBy,
              staleTitle: side.staleBy > 0 ? staleTitle(side) : ""
          }
        : null
}
