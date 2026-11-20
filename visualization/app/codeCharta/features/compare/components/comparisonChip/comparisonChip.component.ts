import { ChangeDetectionStrategy, Component, computed, ElementRef, HostListener, inject, signal } from "@angular/core"
import { CopyToClipboardService } from "../../../../util/copyToClipboard.service"
import { ProjectsFacade } from "../../../projects/facade"
import { ToastService } from "../../../shared/facade"
import type { ComparedChangeRequest, LoadedSide, ResolvedComparison } from "../../model/compare.model"
import { gitChangeLine } from "../../selectors/deltaChangeSummary"
import { changeRequestLabel } from "../../services/changeRequestText"
import { CompareService } from "../../services/compare.service"
import { rangeText, refName, shownSideCaption, sideName, staleBadge, staleCount, staleTitle } from "../../services/comparisonText"
import { CompareStore } from "../../stores/compare.store"

interface BaseModeBadge {
    text: string
    /** The first line of the caret menu once the badge left the chip (design C2, space priority step 1). */
    menuText: string
    title: string
}

interface ChipSide {
    caption: string
    /** Starts with "Base:" or "Head:", which say the side once the captions are hidden. */
    title: string
    /** Null for a working-tree or imported snapshot, which has no commit. */
    shortCommit: string | null
    /** The short commit, else the snapshot's label: how a sentence names the side. */
    name: string
    label: string | null
    staleBadge: string | null
    staleCount: string | null
    staleTitle: string
}

interface ChipChangeRequest {
    label: string
    url: string | null
    title: string
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
    private readonly projects = inject(ProjectsFacade)

    readonly isMenuOpen = signal(false)
    readonly isNoDifferences = this.store.isShowingNoDifferences
    readonly base = computed(() => chipSideOf("base", this.store.state().base, this.folderLabelOf("base")))
    readonly head = computed(() => chipSideOf("head", this.store.state().head, this.folderLabelOf("head")))
    readonly baseModeBadge = computed(() => baseModeBadgeOf(this.store.state().resolved))
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
        this.isMenuOpen.set(false)
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

/** Only a comparison of branches or a pull request has a base mode worth naming. */
function baseModeBadgeOf(resolved: ResolvedComparison | null): BaseModeBadge | null {
    if (!resolved || resolved.origin === "commits") {
        return null
    }
    const head = refName(resolved.head.requested)
    const target = refName(resolved.baseTip ?? resolved.base.requested)
    return resolved.baseMode === "mergeBase"
        ? { text: "since merge base", menuText: "Since the merge base", title: `Changes on '${head}' since it left '${target}'` }
        : { text: "tip vs tip", menuText: "Tip vs tip", title: "Everything that differs between the two tips" }
}

function chipChangeRequestOf(changeRequest: ComparedChangeRequest | null): ChipChangeRequest | null {
    if (!changeRequest) {
        return null
    }
    const label = changeRequestLabel(changeRequest.provider, changeRequest.number)
    const noun = changeRequest.provider === "gitlab" ? "Merge request" : "Pull request"
    return { label, url: changeRequest.url, title: `${noun} ${label}` }
}

function chipSideOf(caption: "base" | "head", side: LoadedSide | null, folderLabel: string | null): ChipSide | null {
    if (!side) {
        return null
    }
    const label = shownSideCaption(side)
    const titleCaption = caption === "base" ? "Base:" : "Head:"
    const inFolder = folderLabel ? `in ${folderLabel}` : null
    return {
        caption,
        title: [titleCaption, side.requested.shortCommit, label, inFolder].filter(Boolean).join(" "),
        shortCommit: side.requested.shortCommit,
        name: side.requested.shortCommit ?? label ?? sideName(side.requested),
        label,
        staleBadge: staleBadge(side),
        staleCount: staleCount(side),
        staleTitle: side.relation ? staleTitle(side) : ""
    }
}
