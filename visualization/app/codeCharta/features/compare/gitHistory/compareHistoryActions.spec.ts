import { signal } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import type { CommitSelection } from "../../gitHistory/facade"
import { BRANCH_ACTIONS, COMMIT_ACTIONS, GitRepositoryService } from "../../gitHistory/facade"
import { aLocalBranch, aLogCommit, aRefs, aStatusOn } from "../../gitHistory/services/gitApi.mocks"
import { ProjectsFacade } from "../../projects/facade"
import { aFolder, aProject } from "../../projects/projects.mocks"
import { FOLDER } from "../ports/compareGateways.mocks"
import { CompareFacade } from "../services/compareFacade"
import { provideCompareForGitHistory } from "./provideCompareForGitHistory"

const ROOT = aLogCommit("1", "Root")
const CHILD = aLogCommit("2", "Child", ["1"])
const REFS = aRefs({ localBranches: [aLocalBranch("feature/x", { isCurrent: true }), aLocalBranch("main")] })

describe("compare in the History", () => {
    let compare: Record<string, jest.Mock>

    function actions() {
        compare = {
            compareCommits: jest.fn(),
            compareWithParent: jest.fn(),
            compareWithCurrent: jest.fn(),
            compareBranch: jest.fn(),
            openDialog: jest.fn()
        }
        const project = aProject(FOLDER.projectId, [aFolder(FOLDER.folderId, { git: { defaultBranch: "main" } as never })])
        TestBed.configureTestingModule({
            providers: [
                ...provideCompareForGitHistory(),
                { provide: CompareFacade, useValue: compare },
                { provide: GitRepositoryService, useValue: { refs: signal({ kind: "ready", value: REFS }) } },
                { provide: ProjectsFacade, useValue: { activeProject: signal(project) } }
            ]
        })
        return { commit: TestBed.inject(COMMIT_ACTIONS), branch: TestBed.inject(BRANCH_ACTIONS) }
    }

    function selectionOf(...commits: (typeof ROOT)[]): CommitSelection {
        return { repo: FOLDER, items: commits.map(commit => ({ kind: "commit" as const, commit })) }
    }

    it("should offer Compare when two commits are selected", () => {
        // Arrange
        const { commit } = actions()
        const two = selectionOf(CHILD, ROOT)

        // Act
        const offered = commit.filter(action => action.isOfferedFor(two))
        offered[0].run(two)

        // Assert
        expect(offered.map(action => [action.label, action.detailsLabel])).toEqual([["Compare", "Compare"]])
        expect(compare.compareCommits).toHaveBeenCalledWith(FOLDER, CHILD.sha, ROOT.sha)
    })

    it("should disable Compare with parent for a root commit", () => {
        // Arrange
        const { commit } = actions()

        // Act
        const offered = commit.filter(action => action.isOfferedFor(selectionOf(ROOT)))
        const reasons = offered.map(action => action.disabledReasonFor?.(selectionOf(ROOT)) ?? null)

        // Assert
        expect(offered.map(action => action.label)).toEqual(["Compare with Parent", "Compare with Current", "Compare with…"])
        expect(reasons).toEqual(["This commit has no parent", null, null])
        expect(offered[0].disabledReasonFor?.(selectionOf(CHILD))).toBeNull()
    })

    it("should start each one-commit comparison for the selected commit", () => {
        // Arrange
        const { commit } = actions()
        const one = selectionOf(CHILD)
        const [withParent, withCurrent, withOther] = commit.filter(action => action.isOfferedFor(one))

        // Act
        withParent.run(one)
        withCurrent.run(one)
        withOther.run(one)
        withOther.run({ repo: FOLDER, items: [{ kind: "workingTree", status: aStatusOn("main") }] })

        // Assert
        expect(compare.compareWithParent).toHaveBeenCalledWith(FOLDER, CHILD.sha)
        expect(compare.compareWithCurrent).toHaveBeenCalledWith(FOLDER, CHILD.sha)
        expect(compare.openDialog).toHaveBeenCalledTimes(1)
        expect(compare.openDialog).toHaveBeenCalledWith({ folder: FOLDER, head: CHILD.sha })
    })

    it("should compare a branch with the current branch, and the current branch with the default branch", () => {
        // Arrange
        const { branch } = actions()
        const [withTarget, withOther] = branch
        const main = { repo: FOLDER, refName: "refs/heads/main", name: "main", kind: "local" as const, isCurrent: false }
        const current = { ...main, refName: "refs/heads/feature/x", name: "feature/x", isCurrent: true }
        const tag = { ...main, refName: "refs/tags/v1", name: "v1", kind: "tag" as const }

        // Act
        withTarget.run(current)
        withOther.run(tag)

        // Assert
        expect(withTarget.labelFor(main)).toBe("Compare with 'feature/x'")
        expect(withTarget.labelFor(current)).toBe("Compare with 'main'")
        expect(withTarget.hoverHintFor(current)).toBe("Show what 'feature/x' changes compared with 'main'")
        expect([withTarget.isOfferedFor(tag), withOther.isOfferedFor(tag)]).toEqual([false, true])
        expect([withOther.labelFor(tag), withOther.hoverHintFor(tag)]).toEqual(["Compare with…", "Choose the other side"])
        expect(compare.compareBranch).toHaveBeenCalledWith(FOLDER, "refs/heads/feature/x")
        expect(compare.openDialog).toHaveBeenCalledWith({ folder: FOLDER, head: "v1" })
    })
})
