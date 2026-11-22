import type { PickedImportFile } from "../../../../model/coreApi/PickedImportFile"
import type { ProjectSummary } from "../../../../model/coreApi/ProjectSummary"
import type { OpenFileTarget, PendingFile } from "../../services/openFile.service"

export interface TargetSentence {
    kind: "newProject" | "existing" | "import"
    project: string
    folder: string
    path: string
}

export interface TargetContext {
    picked: PickedImportFile | null
    projects: ProjectSummary[]
}

export function initialTargetOf(pending: PendingFile): OpenFileTarget {
    const existing = pending.picked.existingTarget
    if (pending.importTarget) {
        return { kind: "folder", ...pending.importTarget }
    }
    return existing ? { kind: "folder", projectId: existing.projectId, folderId: existing.folderId } : { kind: "newProject" }
}

export function folderIdToTarget({ picked, projects }: TargetContext, projectId: string): string | undefined {
    const existing = picked?.existingTarget
    if (existing?.projectId === projectId) {
        return existing.folderId
    }
    const project = projects.find(candidate => candidate.id === projectId)
    return (project?.folders.find(folder => folder.role === "primary") ?? project?.folders[0])?.id
}

export function summaryOf(projects: ProjectSummary[], target: OpenFileTarget): ProjectSummary | null {
    return target.kind === "folder" ? (projects.find(project => project.id === target.projectId) ?? null) : null
}

export function isContainingFolder(picked: PickedImportFile | null, target: OpenFileTarget): boolean {
    if (target.kind === "newProject") {
        return true
    }
    const existing = picked?.existingTarget
    return existing?.projectId === target.projectId && existing.folderId === target.folderId
}

export function isGitFolder(projects: ProjectSummary[], target: OpenFileTarget): target is Extract<OpenFileTarget, { kind: "folder" }> {
    if (target.kind !== "folder") {
        return false
    }
    const folder = summaryOf(projects, target)?.folders.find(candidate => candidate.id === target.folderId)
    return folder?.kind === "git" && folder.status === "ok"
}

export function folderLabelOf({ picked, projects }: TargetContext, target: OpenFileTarget): string {
    if (target.kind === "newProject") {
        return picked?.containingFolder.suggestedName ?? ""
    }
    return summaryOf(projects, target)?.folders.find(folder => folder.id === target.folderId)?.label ?? ""
}

export function sentenceOf(context: TargetContext, target: OpenFileTarget, isImport: boolean): TargetSentence {
    const { picked, projects } = context
    if (target.kind === "newProject") {
        const containing = picked?.containingFolder
        return { kind: "newProject", project: containing?.suggestedName ?? "", folder: "", path: containing?.path ?? "" }
    }
    const project = summaryOf(projects, target)?.name ?? picked?.existingTarget?.projectName ?? ""
    return { kind: isImport ? "import" : "existing", project, folder: folderLabelOf(context, target), path: "" }
}

export function duplicateProjectNameOf({ picked, projects }: TargetContext, target: OpenFileTarget): string | null {
    const duplicate = picked?.duplicateOf
    if (!duplicate || target.kind !== "folder" || target.projectId !== duplicate.projectId) {
        return null
    }
    const summary = projects.find(project => project.id === duplicate.projectId)
    return summary?.name ?? picked.existingTarget?.projectName ?? ""
}
