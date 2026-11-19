import { ChangeDetectionStrategy, Component, computed, ElementRef, effect, inject, signal, untracked, viewChild } from "@angular/core"
import { shortSha } from "../../../../util/wording"
import { BranchActionsService, BranchDialogRequest } from "../../services/branchActions.service"
import { checkBranchName } from "../../util/branchName"
import { renameEffect } from "../../util/effectText"

const TITLES: Readonly<Record<BranchDialogRequest["kind"], string>> = {
    create: "New Branch",
    rename: "Rename Branch",
    setUpstream: "Set Upstream",
    checkOutRemote: "Check Out as New Local Branch"
}
const SUBMIT_LABELS: Readonly<Record<BranchDialogRequest["kind"], string>> = {
    create: "Create branch",
    rename: "Rename",
    setUpstream: "Set upstream",
    checkOutRemote: "Check out"
}
const NO_UPSTREAM = ""

/** Design H14: New Branch, Rename Branch, Set Upstream and Check Out as New Local Branch. */
@Component({
    selector: "cc-branch-dialog",
    templateUrl: "./branchDialog.component.html",
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class BranchDialogComponent {
    private readonly actions = inject(BranchActionsService)
    private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>("dialog")
    private readonly nameInput = viewChild<ElementRef<HTMLInputElement>>("nameInput")

    readonly noUpstream = NO_UPSTREAM
    readonly request = this.actions.dialog
    readonly name = signal("")
    readonly isSwitching = signal(false)
    readonly upstream = signal(NO_UPSTREAM)

    readonly title = computed(() => TITLES[this.request()?.kind ?? "create"])
    readonly submitLabel = computed(() => SUBMIT_LABELS[this.request()?.kind ?? "create"])
    readonly nameCheck = computed(() => this.checkName())
    readonly isSubmittable = computed(() => this.request()?.kind === "setUpstream" || this.nameCheck().isValid)
    readonly remoteBranches = computed(() => this.actions.refs()?.remoteBranches ?? [])
    readonly startText = computed(() => {
        const request = this.request()
        return request?.kind === "create" ? { sha: shortSha(request.startPoint), subject: request.subject } : null
    })
    readonly renameText = computed(() => {
        const request = this.request()
        return request?.kind === "rename" ? renameEffect(request.branch.name, this.name()) : null
    })

    constructor() {
        effect(() => {
            const request = this.request()
            untracked(() => this.showOrClose(request))
        })
    }

    submit(event: Event) {
        event.preventDefault()
        const request = this.request()
        if (!request || !this.isSubmittable()) {
            return
        }
        this.actions.closeDialog()
        void this.run(request)
    }

    cancel() {
        this.actions.closeDialog()
    }

    /** Escape and the backdrop close the native dialog. */
    onClosed() {
        if (this.request()) {
            this.actions.closeDialog()
        }
    }

    private run(request: BranchDialogRequest): Promise<void> {
        const name = this.name()
        switch (request.kind) {
            case "create":
                return this.actions.createBranch({ name, startPoint: request.startPoint, checkout: this.isSwitching() })
            case "rename":
                return this.actions.renameBranch(request.branch, name)
            case "setUpstream":
                return this.actions.setUpstream(request.branch, this.upstream() === NO_UPSTREAM ? null : this.upstream())
            case "checkOutRemote":
                return this.actions.checkOutRemote(request.remote, name)
        }
    }

    private checkName() {
        const request = this.request()
        const name = this.name()
        const takenNames = this.actions.refs()?.localBranches.map(branch => branch.name) ?? []
        if (request?.kind === "rename" && name === request.branch.name) {
            return { isValid: false, message: null }
        }
        return checkBranchName(name, takenNames)
    }

    private showOrClose(request: BranchDialogRequest | null) {
        const dialog = this.dialog().nativeElement
        if (!request) {
            if (dialog.open) {
                dialog.close()
            }
            return
        }
        this.name.set(initialNameOf(request))
        this.isSwitching.set(false)
        this.upstream.set(request.kind === "setUpstream" ? (request.branch.upstream?.refName ?? NO_UPSTREAM) : NO_UPSTREAM)
        if (!dialog.open) {
            dialog.showModal()
        }
        setTimeout(() => this.nameInput()?.nativeElement.select())
    }
}

function initialNameOf(request: BranchDialogRequest): string {
    switch (request.kind) {
        case "rename":
            return request.branch.name
        case "checkOutRemote":
            return request.remote.branchName
        default:
            return ""
    }
}
