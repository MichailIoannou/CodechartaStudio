import type { GitCommitSummary } from "../../model/coreApi/GitCommitSummary"
import type { GitStatus } from "../../model/coreApi/GitStatus"
import type { PickedFolder } from "../../model/coreApi/PickedFolder"
import type { Project } from "../../model/coreApi/Project"
import type { ProjectFolder } from "../../model/coreApi/ProjectFolder"
import type { SnapshotSummary } from "../../model/coreApi/SnapshotSummary"

const PROJECT_NOW = "2026-11-19T08:00:00Z"

export function aFolder(id: string, overrides: Partial<ProjectFolder> = {}): ProjectFolder {
    return {
        id,
        path: `/work/${id}`,
        label: id,
        role: "primary",
        kind: "git",
        git: null,
        addedAt: PROJECT_NOW,
        status: "ok",
        relationships: [],
        snapshotCount: 0,
        ...overrides
    }
}

export function aProject(id: string, folders: ProjectFolder[], overrides: Partial<Project> = {}): Project {
    return {
        id,
        name: id,
        description: null,
        createdAt: PROJECT_NOW,
        updatedAt: PROJECT_NOW,
        folders,
        analysisProfile: { exclude: [], without: [], parallel: true },
        view: { workingFolderId: folders[0]?.id ?? null, shownSnapshotIdByFolder: {} },
        ...overrides
    }
}

export function aSnapshot(
    projectId: string,
    folderId: string,
    snapshotId: string,
    overrides: Partial<SnapshotSummary> = {}
): SnapshotSummary {
    return {
        ref: { projectId, folderId, snapshotId },
        source: "analysed",
        createdAt: PROJECT_NOW,
        commit: null,
        shortCommit: null,
        subject: null,
        commitDate: null,
        dirty: false,
        originalFileName: null,
        fileModifiedAt: null,
        mapBytes: 1024,
        checksum: null,
        profileHash: null,
        target: null,
        finishedAt: null,
        durationMs: null,
        notInMap: [],
        ...overrides
    }
}

export function aPickedFolder(name: string, overrides: Partial<PickedFolder> = {}): PickedFolder {
    return {
        pickToken: name.padEnd(32, "0").slice(0, 32),
        path: `/work/${name}`,
        suggestedLabel: name,
        kind: "git",
        git: null,
        ...overrides
    }
}

export function aGitStatus(branch: string, overrides: Partial<GitStatus> = {}): GitStatus {
    return {
        head: { kind: "branch", name: branch, commit: "a1b2c3d".padEnd(40, "0") },
        upstream: null,
        counts: { staged: 0, unstaged: 0, untracked: 0, conflicted: 0 },
        operationInProgress: null,
        ...overrides
    }
}

export function aCommit(shortSha: string, subject: string, overrides: Partial<GitCommitSummary> = {}): GitCommitSummary {
    return {
        sha: shortSha.padEnd(40, "0"),
        parents: [],
        authorName: "Mia Chen",
        authorEmail: "mia@example.com",
        authoredAt: Date.parse(PROJECT_NOW) / 1000,
        committedAt: Date.parse(PROJECT_NOW) / 1000,
        subject,
        ...overrides
    }
}
