import type { SnapshotResolution } from "../../../model/coreApi/SnapshotResolution"
import { aSnapshot } from "../../projects/projects.mocks"
import type { SelectedTarget } from "../model/snapshotTarget"
import { aJob, COMMIT_SHA } from "../snapshots.mocks"
import { NoticeInput, noticeText, sentenceOf } from "./noticeText"

const COMMIT: SelectedTarget = { kind: "commit", sha: COMMIT_SHA }
const WORKING_TREE: SelectedTarget = { kind: "workingTree" }
const SHOWN = aSnapshot("p-billing", "f-api", "s-shown", {
    commit: "9f8e7d6".padEnd(40, "0"),
    shortCommit: "9f8e7d6",
    subject: "Release 2.4.0",
    target: "commit"
})
const IMPORTED = { ...SHOWN, source: "imported" as const, target: null }

function nearest(
    relation: "ancestor" | "descendant" | "diverged",
    behind: number,
    ahead: number,
    snapshot = SHOWN
): Extract<SnapshotResolution, { kind: "nearest" }> {
    return { kind: "nearest", snapshot, isCurrentProfile: true, relation, behind, ahead }
}

function textOf(input: Partial<NoticeInput>) {
    const { notice, badge } = noticeText({ folderLabel: "billing-api", target: COMMIT, resolution: null, job: null, ...input })
    return { text: notice ? sentenceOf(notice.parts) : null, notice, badge }
}

describe("noticeText", () => {
    it("should say nothing for the exact snapshot of a commit", () => {
        // Arrange
        const resolution: SnapshotResolution = { kind: "exact", snapshot: SHOWN, isCurrentProfile: true }

        // Act
        const { notice, badge } = textOf({ resolution })

        // Assert
        expect(notice).toBeNull()
        expect(badge).toBeNull()
    })

    it("should say nothing for an imported exact snapshot or the exact snapshot of the working tree", () => {
        // Arrange
        const imported: SnapshotResolution = { kind: "exact", snapshot: IMPORTED, isCurrentProfile: false }
        const workingTree: SnapshotResolution = {
            kind: "exact",
            snapshot: { ...SHOWN, target: "workingTree", dirty: true },
            isCurrentProfile: true
        }

        // Act
        const forImport = textOf({ resolution: imported })
        const forWorkingTree = textOf({ target: WORKING_TREE, resolution: workingTree })

        // Assert
        expect([forImport.notice, forImport.badge, forWorkingTree.notice, forWorkingTree.badge]).toEqual([null, null, null, null])
    })

    it("should name the commits and how stale the nearest ancestor is", () => {
        // Act
        const { text, notice, badge } = textOf({ resolution: nearest("ancestor", 3, 0) })

        // Assert
        expect(text).toBe("No analysis for a1b2c3d — showing 9f8e7d6 (Release 2.4.0), stale by 3 commits.")
        expect(notice).toMatchObject({ kind: "stale", tone: "warning", action: "Analyse a1b2c3d now", isDismissible: true })
        expect(notice?.parts.filter(part => part.isSha).map(part => part.text)).toEqual(["a1b2c3d", "9f8e7d6"])
        expect(badge).toEqual({ text: "stale by 3", tone: "warning" })
    })

    it("should count a single commit in the singular", () => {
        // Act
        const ancestor = textOf({ resolution: nearest("ancestor", 1, 0) })
        const descendant = textOf({ resolution: nearest("descendant", 0, 1) })

        // Assert
        expect(ancestor.text).toBe("No analysis for a1b2c3d — showing 9f8e7d6 (Release 2.4.0), stale by 1 commit.")
        expect(descendant.text).toBe("No analysis for a1b2c3d — showing 9f8e7d6 (Release 2.4.0), which is ahead by 1 commit.")
    })

    it("should say a descendant is ahead", () => {
        // Act
        const { text, badge } = textOf({ resolution: nearest("descendant", 0, 4) })

        // Assert
        expect(text).toBe("No analysis for a1b2c3d — showing 9f8e7d6 (Release 2.4.0), which is ahead by 4 commits.")
        expect(badge).toEqual({ text: "ahead by 4", tone: "warning" })
    })

    it("should say a diverged snapshot is behind and ahead", () => {
        // Act
        const { text, badge } = textOf({ resolution: nearest("diverged", 3, 2) })

        // Assert
        expect(text).toBe("No analysis for a1b2c3d — showing 9f8e7d6 (Release 2.4.0) from a diverged line: 3 behind / 2 ahead.")
        expect(badge).toEqual({ text: "diverged 3↓ 2↑", tone: "warning" })
    })

    it("should speak of the current checkout when the working tree has no snapshot at HEAD", () => {
        // Act
        const { text, notice } = textOf({ target: WORKING_TREE, resolution: nearest("ancestor", 3, 0) })

        // Assert
        expect(text).toBe("No analysis of the current checkout — showing 9f8e7d6 (Release 2.4.0), stale by 3 commits.")
        expect(notice?.action).toBe("Analyse current checkout")
    })

    it("should leave out a missing subject", () => {
        // Act
        const { text } = textOf({ resolution: nearest("ancestor", 2, 0, { ...SHOWN, subject: null }) })

        // Assert
        expect(text).toBe("No analysis for a1b2c3d — showing 9f8e7d6, stale by 2 commits.")
    })

    it("should say a shown imported snapshot has no known analysis time", () => {
        // Act
        const { text, badge } = textOf({ resolution: nearest("ancestor", 3, 0, IMPORTED) })

        // Assert
        expect(text).toBe(
            "No analysis for a1b2c3d — showing 9f8e7d6 (imported, analysis time unknown) (Release 2.4.0), stale by 3 commits."
        )
        expect(badge).toEqual({ text: "stale by 3 · imported", tone: "warning" })
    })

    it("should add a different profile to the sentence and the badge", () => {
        // Arrange
        const resolution: SnapshotResolution = { ...nearest("ancestor", 3, 0), isCurrentProfile: false }

        // Act
        const { text, badge } = textOf({ resolution })

        // Assert
        expect(text).toBe(
            "No analysis for a1b2c3d — showing 9f8e7d6 (Release 2.4.0), stale by 3 commits. Analysed with a different profile."
        )
        expect(badge).toEqual({ text: "stale by 3 · profile", tone: "warning" })
    })

    it("should only mention the profile for an exact snapshot of another profile", () => {
        // Arrange
        const resolution: SnapshotResolution = { kind: "exact", snapshot: SHOWN, isCurrentProfile: false }

        // Act
        const { text, notice, badge } = textOf({ resolution })

        // Assert
        expect(text).toBe("Analysed with a different profile.")
        expect(notice).toMatchObject({ kind: "profile", tone: "info", action: null, isDismissible: true })
        expect(badge).toEqual({ text: "other profile", tone: "ghost" })
    })

    it("should say nothing for the newest snapshot of a plain folder or of a folder that is no repository", () => {
        // Act
        const plain = textOf({ target: WORKING_TREE, resolution: { kind: "latest", snapshot: SHOWN, reason: "PLAIN_FOLDER" } })
        const noRepository = textOf({
            target: WORKING_TREE,
            resolution: { kind: "latest", snapshot: SHOWN, reason: "REPOSITORY_UNAVAILABLE" }
        })

        // Assert
        expect([plain.notice, plain.badge, noRepository.notice]).toEqual([null, null, null])
    })

    it("should say when git is not available", () => {
        // Act
        const { text, notice } = textOf({
            target: WORKING_TREE,
            resolution: { kind: "latest", snapshot: SHOWN, reason: "GIT_UNAVAILABLE" }
        })

        // Assert
        expect(text).toBe("Git is not available — showing the newest analysis.")
        expect(notice).toMatchObject({ kind: "gitUnavailable", tone: "info", action: null, isDismissible: true })
    })

    it("should offer to analyse a folder without analyses and not let the notice be dismissed", () => {
        // Act
        const { text, notice } = textOf({ target: WORKING_TREE, resolution: { kind: "none", reason: "NO_SNAPSHOTS" } })

        // Assert
        expect(text).toBe("No analysis yet for 'billing-api'.")
        expect(notice).toMatchObject({ kind: "none", tone: "warning", action: "Analyse now", isDismissible: false })
    })

    it("should say a commit is not in the local repository", () => {
        // Act
        const { text, notice } = textOf({ resolution: { kind: "none", reason: "UNKNOWN_COMMIT" } })

        // Assert
        expect(text).toBe("This commit is not in the local repository.")
        expect(notice).toMatchObject({ kind: "unknownCommit", tone: "warning", action: null, isDismissible: true })
    })

    it("should replace the action with a running analysis of the target", () => {
        // Arrange
        const job = aJob("job-1", { state: "running", progress: { mode: "determinate", percent: 42 } })

        // Act
        const { text, notice, badge } = textOf({ resolution: nearest("ancestor", 3, 0), job })

        // Assert
        expect(text).toBe("Analysing a1b2c3d…")
        expect(notice).toMatchObject({ kind: "running", tone: "info", hint: "Progress shows in the status at the top.", action: null })
        expect(notice?.isDismissible).toBe(false)
        expect(badge).toEqual({ text: "stale by 3", tone: "warning" })
    })

    it("should name the working tree while it is queued", () => {
        // Act
        const { text } = textOf({
            target: WORKING_TREE,
            resolution: { kind: "none", reason: "NO_SNAPSHOTS" },
            job: aJob("job-1", { target: { kind: "workingTree" } })
        })

        // Assert
        expect(text).toBe("Analysing the working tree…")
    })

    it("should tell a failed analysis of the target with its message and hint", () => {
        // Arrange
        const error = { code: "JAVA_TOO_OLD" as const, message: "Java 21 is too old.", hint: "CodeCharta needs Java 22 or newer." }

        // Act
        const { text, notice } = textOf({ resolution: nearest("ancestor", 3, 0), job: aJob("job-1", { state: "failed", error }) })

        // Assert
        expect(text).toBe("Analysis of a1b2c3d failed: Java 21 is too old.")
        expect(notice).toMatchObject({ kind: "failed", tone: "error", hint: "CodeCharta needs Java 22 or newer.", isDismissible: true })
    })

    it("should say nothing before the target is resolved", () => {
        // Act
        const { notice, badge } = textOf({ resolution: null })

        // Assert
        expect([notice, badge]).toEqual([null, null])
    })
})
