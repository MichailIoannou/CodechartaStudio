import { ChangeDetectionStrategy, Component, computed, inject } from "@angular/core"
import { changeBadgeOf } from "../../../gitHistory/facade"
import { CompareStore } from "../../stores/compare.store"
import { SelectedFileReadStore } from "../../stores/selectedFile.read.store"

const RENAMES: ReadonlySet<string> = new Set(["renamed", "copied"])

/** The git change of the selected file during a comparison whose changed files came from git: "renamed from src/old.ts". */
@Component({
    selector: "cc-file-git-change",
    template: `
        @if (change(); as change) {
            <div class="mt-1 flex min-w-0 items-center gap-1 text-xs" data-testid="inspector-git-change">
                <span class="badge badge-xs shrink-0 {{ change.badge.toneClass }}" [attr.title]="change.badge.title">{{ change.badge.label }}</span>
                @if (change.previousPath; as previousPath) {
                    <span class="min-w-0 truncate text-base-content/70" [title]="previousPath">from {{ previousPath }}</span>
                } @else {
                    <span class="text-base-content/70">in git</span>
                }
            </div>
        }
    `,
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class FileGitChangeComponent {
    private readonly store = inject(CompareStore)
    private readonly selectedFile = inject(SelectedFileReadStore)

    readonly change = computed(() => {
        const changedFiles = this.store.state().changedFiles
        const selectedPath = this.selectedFile.selectedNodePath()
        const isComparing = this.store.isActive() || this.store.isShowingNoDifferences()
        if (!(isComparing && selectedPath && changedFiles !== null && changedFiles !== "loading" && changedFiles.source === "git")) {
            return null
        }
        const rootPath = `/${selectedPath.split("/")[1]}`
        const file = changedFiles.files.find(candidate => `${rootPath}/${candidate.path}` === selectedPath)
        if (!file) {
            return null
        }
        return { badge: changeBadgeOf(file.change), previousPath: RENAMES.has(file.change) ? file.previousPath : null }
    })
}
