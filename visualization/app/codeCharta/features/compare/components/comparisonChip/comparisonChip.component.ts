import { ChangeDetectionStrategy, Component, computed, ElementRef, HostListener, inject, signal, viewChild } from "@angular/core"
import { CopyToClipboardService } from "../../../../util/copyToClipboard.service"
import { ProjectsFacade } from "../../../projects/facade"
import { ToastService } from "../../../shared/facade"
import { gitChangeLine } from "../../selectors/deltaChangeSummary"
import { CompareService } from "../../services/compare.service"
import { rangeText, refName } from "../../services/comparisonText"
import { CompareStore } from "../../stores/compare.store"
import { baseModeLineOf, chipChangeRequestOf, chipSideOf } from "./chipSides"

/** Design C2 revision 2: one compact button in the nav bar, the details of the comparison in its dropdown. */
@Component({
    selector: "cc-comparison-chip",
    templateUrl: "./comparisonChip.component.html",
    providers: [CopyToClipboardService],
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: "shrink-0" }
})
export class ComparisonChipComponent {
    private readonly store = inject(CompareStore)
    private readonly service = inject(CompareService)
    private readonly clipboard = inject(CopyToClipboardService)
    private readonly toastService = inject(ToastService)
    private readonly hostElement = inject<ElementRef<HTMLElement>>(ElementRef)
    private readonly projects = inject(ProjectsFacade)
    private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>("trigger")

    readonly isMenuOpen = signal(false)
    readonly isNoDifferences = this.store.isShowingNoDifferences
    readonly base = computed(() => {
        const { base, resolved } = this.store.state()
        const isResolvedBase = base !== null && base.requested.commit === resolved?.base.requested.commit
        return chipSideOf("Base", base, this.folderLabelOf("base"), isResolvedBase ? (resolved?.baseTip ?? null) : null)
    })
    readonly head = computed(() => chipSideOf("Head", this.store.state().head, this.folderLabelOf("head")))
    readonly sides = computed(() => [this.base(), this.head()].filter(side => side !== null))
    readonly isStale = computed(() => this.sides().some(side => side.status.isStale))
    readonly title = computed(() =>
        this.sides()
            .map(side => side.title)
            .join(" · ")
    )
    readonly baseModeLine = computed(() => baseModeLineOf(this.store.state().resolved))
    readonly changeRequest = computed(() => chipChangeRequestOf(this.store.state().changeRequest))
    readonly gitLine = computed(() => {
        const changedFiles = this.store.state().changedFiles
        return changedFiles !== null && changedFiles !== "loading" && changedFiles.source === "git"
            ? gitChangeLine(changedFiles.files)
            : null
    })

    @HostListener("document:click", ["$event"])
    closeMenuOnOutsideClick(event: MouseEvent): void {
        if (this.isMenuOpen() && event.target instanceof Node && !this.hostElement.nativeElement.contains(event.target)) {
            this.isMenuOpen.set(false)
        }
    }

    toggleMenu(): void {
        this.isMenuOpen.update(isOpen => !isOpen)
    }

    openWithKeyboard(event: Event): void {
        event.preventDefault()
        this.isMenuOpen.set(true)
    }

    closeWithKeyboard(): void {
        if (this.isMenuOpen()) {
            this.isMenuOpen.set(false)
            this.trigger().nativeElement.focus()
        }
    }

    change(): void {
        this.isMenuOpen.set(false)
        const { base, head, resolved } = this.store.state()
        const folder = (resolved?.baseTip ?? base?.requested ?? head?.requested)?.folder
        const headFolder = head?.requested.folder
        const isAcrossFolders = folder !== undefined && headFolder !== undefined && headFolder.folderId !== folder.folderId
        this.store.openDialog({
            ...(folder ? { folder } : {}),
            ...(base ? { base: refName(base.requested) } : {}),
            ...(head ? { head: refName(head.requested) } : {}),
            ...(isAcrossFolders ? { headFolder } : {})
        })
    }

    swap(): void {
        this.service.swap()
    }

    async copyAsText(): Promise<void> {
        this.isMenuOpen.set(false)
        const { base, head, resolved, changeRequest } = this.store.state()
        if (!(base && head)) {
            return
        }
        const range = rangeText(resolved?.baseTip ?? base.requested, head.requested, resolved?.baseMode ?? "tip")
        const text = changeRequest?.url ? `${range} ${changeRequest.url}` : range
        await this.clipboard.copy(text)
        this.toastService.show(`Copied ${text}`)
    }

    leave(): void {
        this.isMenuOpen.set(false)
        this.service.exit()
    }

    /** Only a comparison across two folders names each side's folder. */
    private folderLabelOf(caption: "base" | "head"): string | null {
        const { resolved } = this.store.state()
        const side = this.store.state()[caption]
        if (resolved?.origin !== "folders" || !side) {
            return null
        }
        const folderId = side.requested.folder.folderId
        return this.projects.activeProject()?.folders.find(folder => folder.id === folderId)?.label ?? null
    }
}
