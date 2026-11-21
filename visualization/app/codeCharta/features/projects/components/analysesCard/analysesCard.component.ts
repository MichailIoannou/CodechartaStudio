import { NgTemplateOutlet } from "@angular/common"
import { ChangeDetectionStrategy, Component, computed, inject, input } from "@angular/core"
import type { SnapshotSummary } from "../../../../model/coreApi/SnapshotSummary"
import { ProjectsService } from "../../services/projects.service"
import { shortDate } from "../../util/folderWording"

interface SnapshotLine {
    shortCommit: string | null
    subject: string | null
    isImported: boolean
}

@Component({
    selector: "cc-analyses-card",
    templateUrl: "./analysesCard.component.html",
    imports: [NgTemplateOutlet],
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: "flex min-w-0 flex-col gap-2 rounded-[10px] bg-base-100 p-4" }
})
export class AnalysesCardComponent {
    private readonly projects = inject(ProjectsService)

    readonly snapshots = input.required<SnapshotSummary[]>()

    readonly inTheMap = computed(() => {
        const shown = this.projects.shownSnapshot()
        return shown ? lineOf(shown) : null
    })
    readonly latest = computed(() => {
        const newest = this.snapshots()[0]
        return newest ? { ...lineOf(newest), when: latestWhen(newest) } : null
    })
    readonly analysesCount = computed(() => String(this.snapshots().length))

    showMap() {
        this.projects.showMap()
    }
}

function lineOf(snapshot: SnapshotSummary): SnapshotLine {
    return { shortCommit: snapshot.shortCommit, subject: snapshot.subject, isImported: snapshot.source === "imported" }
}

function latestWhen(snapshot: SnapshotSummary): string {
    if (snapshot.source === "imported") {
        return `analysis time unknown (imported ${shortDate(snapshot.createdAt)})`
    }
    return shortDate(snapshot.createdAt)
}
