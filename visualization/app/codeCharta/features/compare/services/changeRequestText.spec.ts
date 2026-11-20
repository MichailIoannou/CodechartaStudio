import { changeRequestLabel, changeRequestUrl, providerWordingOf, segmentLabelOf, unknownHostText } from "./changeRequestText"

describe("changeRequestText", () => {
    it("should call GitLab's requests merge requests and number them with an exclamation mark", () => {
        // Act
        const words = [
            segmentLabelOf("github"),
            segmentLabelOf("gitlab"),
            segmentLabelOf(null),
            changeRequestLabel("github", 7),
            changeRequestLabel("gitlab", 7)
        ]

        // Assert
        expect(words).toEqual(["Pull requests", "Merge requests", "Pull requests", "#7", "!7"])
    })

    it("should point at each provider's CLI", () => {
        // Act
        const wordings = [providerWordingOf("github"), providerWordingOf("gitlab")]

        // Assert
        expect(wordings.map(wording => wording.notInstalled)).toEqual([
            "Install the GitHub CLI (gh) to list pull requests, or enter a number below.",
            "Install the GitLab CLI (glab) to list merge requests, or enter a number below."
        ])
        expect(wordings.map(wording => wording.cliUrl)).toEqual(["https://cli.github.com", "https://gitlab.com/gitlab-org/cli"])
    })

    it("should link a request to its page on the hosting site", () => {
        // Act
        const urls = [
            changeRequestUrl({ provider: "github", host: "github.com", repository: "mia/billing", remote: "origin" }, 7),
            changeRequestUrl({ provider: "gitlab", host: "gitlab.example.org", repository: "group/sub/billing", remote: "origin" }, 7),
            changeRequestUrl({ provider: "github", host: "github.com", repository: null, remote: "origin" }, 7)
        ]

        // Assert
        expect(urls).toEqual([
            "https://github.com/mia/billing/pull/7",
            "https://gitlab.example.org/group/sub/billing/-/merge_requests/7",
            null
        ])
    })

    it("should ask what an unrecognised host is", () => {
        // Act
        const text = unknownHostText("git.example.org")

        // Assert
        expect(text).toBe("This host is not recognised. Treat git.example.org as:")
    })
})
