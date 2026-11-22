import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal } from "@angular/core"
import type { AnalyserName } from "../../../../model/coreApi/AnalyserName"
import type { AnalysisProfile } from "../../../../model/coreApi/AnalysisProfile"
import type { Project } from "../../../../model/coreApi/Project"
import { ProjectsService } from "../../services/projects.service"

const ANALYSERS: readonly { name: AnalyserName; label: string }[] = [
    { name: "rawtextparser", label: "Raw text" },
    { name: "unifiedparser", label: "Unified (source code)" },
    { name: "dependencyparser", label: "Dependencies" },
    { name: "domainlanguageparser", label: "Domain language" },
    { name: "git", label: "Git history" },
    { name: "svn", label: "SVN history" }
]

@Component({
    selector: "cc-manage-profile",
    templateUrl: "./manageProfile.component.html",
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ManageProfileComponent {
    private readonly projects = inject(ProjectsService)

    readonly project = input.required<Project>()

    readonly analysers = ANALYSERS
    readonly excludeText = linkedSignal(() => this.project().analysisProfile.exclude.join("\n"))
    readonly without = linkedSignal<ReadonlySet<AnalyserName>>(() => new Set(this.project().analysisProfile.without))
    readonly parallel = linkedSignal(() => this.project().analysisProfile.parallel)
    readonly isSaving = signal(false)
    readonly failure = signal<string | null>(null)

    readonly profile = computed<AnalysisProfile>(() => ({
        exclude: this.excludeText()
            .split("\n")
            .map(pattern => pattern.trim())
            .filter(pattern => pattern !== ""),
        without: ANALYSERS.map(analyser => analyser.name).filter(name => this.without().has(name)),
        parallel: this.parallel()
    }))
    readonly isDirty = computed(() => JSON.stringify(this.profile()) !== JSON.stringify(this.savedProfile()))

    setSkipped(name: AnalyserName, isSkipped: boolean) {
        const without = new Set(this.without())
        if (isSkipped) {
            without.add(name)
        } else {
            without.delete(name)
        }
        this.without.set(without)
    }

    async save() {
        if (!this.isDirty() || this.isSaving()) {
            return
        }
        this.isSaving.set(true)
        this.failure.set(null)
        try {
            await this.projects.updateProject({ analysisProfile: this.profile() })
        } catch (error) {
            this.failure.set((error as Error).message)
        } finally {
            this.isSaving.set(false)
        }
    }

    private savedProfile(): AnalysisProfile {
        const { exclude, without, parallel } = this.project().analysisProfile
        return { exclude, without: ANALYSERS.map(analyser => analyser.name).filter(name => without.includes(name)), parallel }
    }
}
