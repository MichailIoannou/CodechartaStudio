import { aGitStatus } from "../projects.mocks"
import { branchLabel, byteSize, changesSentence, counted, relativeTime, remoteDisplay, shortSha, upstreamState } from "./folderWording"

const NOW_MS = Date.parse("2026-11-19T12:00:00Z")
const upstream = { refName: "refs/remotes/origin/main", name: "origin/main", ahead: 0, behind: 0, isGone: false }

describe("folderWording", () => {
    it("should pluralise counts", () => {
        // Arrange & Act
        const words = [counted(1, "folder"), counted(4, "folder"), counted(0, "analysis", "analyses")]

        // Assert
        expect(words).toEqual(["1 folder", "4 folders", "0 analyses"])
    })

    it("should shorten a sha to seven characters", () => {
        // Arrange & Act
        const short = shortSha("a1b2c3d4e5f6")

        // Assert
        expect(short).toBe("a1b2c3d")
    })

    it("should name the branch or the detached commit", () => {
        // Arrange
        const detached = aGitStatus("main", { head: { kind: "detached", commit: "9f8e7d6c5b4a" } })

        // Act
        const labels = [branchLabel(aGitStatus("main")), branchLabel(detached)]

        // Assert
        expect(labels).toEqual(["main", "detached at 9f8e7d6"])
    })

    it("should describe the upstream", () => {
        // Arrange
        const statuses = [
            aGitStatus("main"),
            aGitStatus("main", { upstream: { ...upstream, isGone: true } }),
            aGitStatus("main", { upstream }),
            aGitStatus("main", { upstream: { ...upstream, ahead: 2, behind: 1 } })
        ]

        // Act
        const states = statuses.map(upstreamState)

        // Assert
        expect(states).toEqual([
            { sentence: "no upstream", toPush: 0, toPull: 0 },
            { sentence: "upstream gone", toPush: 0, toPull: 0 },
            { sentence: "in sync", toPush: 0, toPull: 0 },
            { sentence: null, toPush: 2, toPull: 1 }
        ])
    })

    it("should describe the uncommitted changes", () => {
        // Arrange
        const counts = { staged: 1, unstaged: 1, untracked: 1, conflicted: 0 }
        const statuses = [
            aGitStatus("main"),
            aGitStatus("main", { counts }),
            aGitStatus("main", { counts: { ...counts, staged: 0 } }),
            aGitStatus("main", { counts: { ...counts, conflicted: 2 }, operationInProgress: "merge" }),
            aGitStatus("main", { counts: { ...counts, conflicted: 1 }, operationInProgress: "cherryPick" })
        ]

        // Act
        const sentences = statuses.map(changesSentence)

        // Assert
        expect(sentences).toEqual([
            "clean",
            "3 uncommitted (1 staged)",
            "2 uncommitted",
            "merge in progress — 2 conflicts",
            "cherry-pick in progress — 1 conflict"
        ])
    })

    it("should show a remote as host and path without credentials or .git", () => {
        // Arrange
        const urls = ["https://token@github.com/acme/billing-api.git", "git@github.com:acme/billing-api.git", "ssh://git@host:22/repo/"]

        // Act
        const shown = urls.map(url => remoteDisplay({ name: "origin", url }))

        // Assert
        expect(shown).toEqual(["github.com/acme/billing-api", "github.com/acme/billing-api", "host:22/repo"])
    })

    it("should say how long ago something happened", () => {
        // Arrange
        const nowSeconds = NOW_MS / 1000

        // Act
        const times = [10, 120, 7200, 2 * 86_400, 8 * 86_400, 400 * 86_400].map(ago => relativeTime(nowSeconds - ago, NOW_MS))

        // Assert
        expect(times).toEqual(["just now", "2 min ago", "2 hours ago", "2 days ago", "1 week ago", "1 year ago"])
    })

    it("should write a byte size with one decimal", () => {
        // Arrange & Act
        const sizes = [512, 61_200_000, 4_200].map(byteSize)

        // Assert
        expect(sizes).toEqual(["512 B", "61.2 MB", "4.2 kB"])
    })
})
