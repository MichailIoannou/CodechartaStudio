import { computed, Injectable, inject, signal } from "@angular/core"
import { HistoryTab, HistoryTabRepo } from "../repos/historyTab.repo"
import { GitRepositoryService } from "./gitRepository.service"

/** Design H4: the History's Log or Changes tab, remembered per project. */
@Injectable({ providedIn: "root" })
export class HistoryTabService {
    private readonly repo = inject(HistoryTabRepo)
    private readonly repository = inject(GitRepositoryService)
    private readonly chosenTabs = signal<Readonly<Record<string, HistoryTab>>>({})

    readonly tab = computed<HistoryTab>(() => {
        const projectId = this.repository.activeProject()?.id
        if (!projectId) {
            return "log"
        }
        return this.chosenTabs()[projectId] ?? this.repo.read(projectId)
    })

    select(tab: HistoryTab): void {
        const projectId = this.repository.activeProject()?.id
        if (projectId) {
            this.chosenTabs.update(tabs => ({ ...tabs, [projectId]: tab }))
            this.repo.write(projectId, tab)
        }
    }
}
