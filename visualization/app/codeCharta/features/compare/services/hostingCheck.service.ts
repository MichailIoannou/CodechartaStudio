import { Injectable, inject } from "@angular/core"
import type { ToolStatus } from "../../../model/coreApi/ToolStatus"
import { DesktopToolsService } from "../../desktopTools/facade"
import { ProjectsFacade } from "../../projects/facade"
import type { FolderRef, HostingProvider } from "../model/compare.model"
import { HOSTING_GATEWAY } from "../ports/compareGateways"
import { HostingChecksStore } from "../stores/hostingChecks.store"
import { cliOf, PullRequestPanel, pullRequestPanelOf } from "./pullRequestPanel"

/** Asks the core which hosting provider a folder belongs to, and words the "Pull requests" segment from that and the desktop tools. */
@Injectable({ providedIn: "root" })
export class HostingCheckService {
    private readonly hosting = inject(HOSTING_GATEWAY)
    private readonly checks = inject(HostingChecksStore)
    private readonly projects = inject(ProjectsFacade)
    private readonly tools = inject(DesktopToolsService)

    /** Reads a signal: call it inside a computed to follow the check, the folder's remotes and the tools report. */
    panelOf(folder: FolderRef): PullRequestPanel {
        const check = this.checks.checkOf(folder)
        const provider = check.kind === "known" ? check.status.provider : null
        return pullRequestPanelOf({ hasRemote: this.hasRemote(folder), check, cli: this.cliStatusOf(provider) })
    }

    /** Asks once per folder while the app runs; `refresh` asks again. */
    async check(folder: FolderRef): Promise<void> {
        if (!this.checks.has(folder)) {
            await this.refresh(folder)
        }
    }

    async refresh(folder: FolderRef): Promise<void> {
        this.checks.set(folder, { kind: "checking" })
        try {
            this.checks.set(folder, { kind: "known", status: await this.hosting.status(folder) })
        } catch {
            this.checks.set(folder, { kind: "unsupported" })
        }
    }

    /** "Treat git.example.org as GitHub Enterprise / GitLab": kept on the folder, then asked again. */
    async treatHostAs(folder: FolderRef, host: string, provider: HostingProvider): Promise<void> {
        await this.hosting.setOverride(folder, { provider, host })
        await this.refresh(folder)
    }

    private hasRemote(folder: FolderRef): boolean {
        const projectFolder = this.projects.activeProject()?.folders.find(candidate => candidate.id === folder.folderId)
        return (projectFolder?.git?.remotes.length ?? 0) > 0
    }

    /** Undefined while the tools were not checked yet. */
    private cliStatusOf(provider: HostingProvider | null): ToolStatus | null | undefined {
        const report = this.tools.report()
        if (report === null) {
            return undefined
        }
        return provider ? (report.tools.find(tool => tool.tool === cliOf(provider)) ?? null) : null
    }
}
