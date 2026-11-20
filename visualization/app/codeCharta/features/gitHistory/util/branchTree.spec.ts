import type { GitRefs } from "../../../model/coreApi/GitRefs"
import { aLocalBranch, aRefs, aRemoteBranch, aTag } from "../services/gitApi.mocks"
import { BranchRow, BranchRowOptions, branchRows, buildBranchTree, GROUP_ROW_CAP, hasAnyRef } from "./branchTree"

const NO_OPTIONS: BranchRowOptions = { filter: "", toggledIds: new Set(), uncappedIds: new Set() }

function outline(rows: BranchRow[]): string[] {
    return rows.map(row => {
        const indent = "  ".repeat(row.depth)
        switch (row.kind) {
            case "all":
                return "All branches"
            case "showAll":
                return `${indent}Show all ${row.total}`
            case "ref":
                return `${indent}${row.label}`
            default:
                return `${indent}${row.isExpanded ? "▾" : "▸"} ${row.label}${row.count === null ? "" : ` (${row.count})`}`
        }
    })
}

function rowsOf(refs: GitRefs, options: Partial<BranchRowOptions> = {}): string[] {
    return outline(branchRows(buildBranchTree(refs), { ...NO_OPTIONS, ...options }))
}

describe("branchTree", () => {
    it("should nest branches that share a folder and keep a lone slash in one row", () => {
        // Arrange
        const refs = aRefs({
            localBranches: [
                aLocalBranch("feature/invoice-rounding"),
                aLocalBranch("main", { isCurrent: true }),
                aLocalBranch("release/2.4"),
                aLocalBranch("release/2.5")
            ]
        })

        // Act
        const rows = rowsOf(refs)

        // Assert
        expect(rows).toEqual(["All branches", "▾ Local (4)", "  feature/invoice-rounding", "  main", "  ▸ release/"])
    })

    it("should open the folder of the current branch", () => {
        // Arrange
        const refs = aRefs({ localBranches: [aLocalBranch("release/2.4", { isCurrent: true }), aLocalBranch("release/2.5")] })

        // Act
        const rows = rowsOf(refs)

        // Assert
        expect(rows).toEqual(["All branches", "▾ Local (2)", "  ▾ release/", "    2.4", "    2.5"])
    })

    it("should group remote branches per remote and keep tags closed", () => {
        // Arrange
        const refs = aRefs({
            remoteBranches: [aRemoteBranch("origin", "main"), aRemoteBranch("origin", "feature/x"), aRemoteBranch("fork", "main")],
            tags: [aTag("v2.4.0")]
        })

        // Act
        const rows = rowsOf(refs)

        // Assert
        expect(rows).toEqual([
            "All branches",
            "▾ Local (1)",
            "  main",
            "▾ Remote",
            "  ▾ origin (2)",
            "    main",
            "    feature/x",
            "  ▾ fork (1)",
            "    main",
            "▸ Tags (1)"
        ])
    })

    it("should leave out the remote and tag groups of a repository without them", () => {
        // Arrange & Act
        const rows = rowsOf(aRefs())

        // Assert
        expect(rows).toEqual(["All branches", "▾ Local (1)", "  main"])
    })

    it("should follow the groups the user opened or closed", () => {
        // Arrange
        const refs = aRefs({ remoteBranches: [aRemoteBranch("origin", "main")], tags: [aTag("v1")] })

        // Act
        const rows = rowsOf(refs, { toggledIds: new Set(["tags", "remote:origin"]) })

        // Assert
        expect(rows).toEqual(["All branches", "▾ Local (1)", "  main", "▾ Remote", "  ▸ origin (1)", "▾ Tags (1)", "  v1"])
    })

    it("should filter case-insensitively over full names and keep the parents of a hit open", () => {
        // Arrange
        const refs = aRefs({
            localBranches: [aLocalBranch("main"), aLocalBranch("release/2.4"), aLocalBranch("release/2.5")],
            remoteBranches: [aRemoteBranch("origin", "Release/3.0")],
            tags: [aTag("v1")]
        })

        // Act
        const rows = rowsOf(refs, { filter: " RELEASE/2.5 ", toggledIds: new Set(["local"]) })

        // Assert — the tags and remote groups have no hit and hide
        expect(rows).toEqual(["All branches", "▾ Local (3)", "  ▾ release/", "    2.5"])
    })

    it("should find a remote branch by its remote name too", () => {
        // Arrange
        const refs = aRefs({ remoteBranches: [aRemoteBranch("origin", "main"), aRemoteBranch("fork", "main")] })

        // Act
        const rows = rowsOf(refs, { filter: "fork/" })

        // Assert
        expect(rows).toEqual(["All branches", "▾ Remote", "  ▾ fork (1)", "    main"])
    })

    it("should cap a long remote group and show all of it on request", () => {
        // Arrange
        const branches = Array.from({ length: GROUP_ROW_CAP + 5 }, (_, index) => aRemoteBranch("origin", `topic-${index}`))
        const tree = buildBranchTree(aRefs({ remoteBranches: branches }))

        // Act
        const capped = branchRows(tree, NO_OPTIONS)
        const uncapped = branchRows(tree, { ...NO_OPTIONS, uncappedIds: new Set(["remote:origin"]) })

        // Assert
        expect(capped.filter(row => row.kind === "ref")).toHaveLength(1 + GROUP_ROW_CAP)
        expect(capped.at(-1)).toEqual({ kind: "showAll", id: "remote:origin#showAll", groupId: "remote:origin", total: 205, depth: 2 })
        expect(uncapped.filter(row => row.kind === "ref")).toHaveLength(1 + GROUP_ROW_CAP + 5)
        expect(uncapped.some(row => row.kind === "showAll")).toBe(false)
    })

    it("should not cap the local branches", () => {
        // Arrange
        const branches = Array.from({ length: GROUP_ROW_CAP + 1 }, (_, index) => aLocalBranch(`topic-${index}`))

        // Act
        const rows = branchRows(buildBranchTree(aRefs({ localBranches: branches })), NO_OPTIONS)

        // Assert
        expect(rows.filter(row => row.kind === "ref")).toHaveLength(GROUP_ROW_CAP + 1)
    })

    it("should tell a repository without any ref", () => {
        // Arrange
        const empty = buildBranchTree(aRefs({ localBranches: [] }))
        const withTagOnly = buildBranchTree(aRefs({ localBranches: [], tags: [aTag("v1")] }))

        // Act & Assert
        expect([hasAnyRef(empty), hasAnyRef(withTagOnly)]).toEqual([false, true])
    })
})
