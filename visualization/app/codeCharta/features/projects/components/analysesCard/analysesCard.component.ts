import { NgTemplateOutlet } from "@angular/common"
import { ChangeDetectionStrategy, Component, computed, inject, input } from "@angular/core"
import type { SnapshotSummary } from "../../../../model/coreApi/SnapshotSummary"
import { ProjectsService } from "../../services/projects.service"
import { byteSize, durationText, shortDate } from "../../util/folderWording"

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
    readonly storeBytes = input<number | null>(null)

    readonly inTheMap = computed(() => {
        const shown = this.projects.shownSnapshot()
        return shown ? lineOf(shown) : null
    })
    readonly latest = computed(() => {
        const newest = this.snapshots()[0]
        return newest ? { ...lineOf(newest), when: latestWhen(newest) } : null
    })
    readonly analysesCount = computed(() => {
        const bytes = this.storeBytes()
        const count = String(this.snapshots().length)
        return bytes === null ? count : `${count} · ${byteSize(bytes)}`
    })

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
    const date = shortDate(snapshot.finishedAt ?? snapshot.createdAt)
    return snapshot.durationMs === null ? date : `${date} · took ${durationText(snapshot.durationMs)}`
}
