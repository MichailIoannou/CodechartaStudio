import type { ToolStatus } from "../../../model/coreApi/ToolStatus"
import { GITHUB_STATUS } from "../ports/compareGateways.mocks"
import { pullRequestPanelOf } from "./pullRequestPanel"

const KNOWN = { kind: "known" as const, status: GITHUB_STATUS }
const GITHUB_HOSTING = { provider: "github", host: "github.com", repository: "mia/billing", remote: "origin" }
const gh = (state: ToolStatus["state"], problem: string | null = null): ToolStatus => ({
    tool: "gh",
    isRequired: false,
    state,
    path: null,
    source: null,
    version: null,
    minimumVersion: null,
    problem
})

describe("pullRequestPanelOf", () => {
    it("should leave the segment out for a folder without a remote", () => {
        // Act
        const panel = pullRequestPanelOf({ hasRemote: false, check: KNOWN, cli: gh("ok") })

        // Assert
        expect(panel).toEqual({ kind: "absent" })
    })

    it("should leave the segment out when the core has no hosting support", () => {
        // Act
        const panel = pullRequestPanelOf({ hasRemote: true, check: { kind: "unsupported" }, cli: gh("ok") })

        // Assert
        expect(panel).toEqual({ kind: "absent" })
    })

    it("should leave the segment out when no remote names a hosted repository", () => {
        // Act
        const panel = pullRequestPanelOf({
            hasRemote: true,
            check: { kind: "known", status: { provider: null, host: null, repository: null, remote: null, detectedBy: null } },
            cli: gh("ok")
        })

        // Assert
        expect(panel).toEqual({ kind: "absent" })
    })

    it("should be checking until the core answered and the tools were checked", () => {
        // Act
        const panels = [
            pullRequestPanelOf({ hasRemote: true, check: { kind: "checking" }, cli: gh("ok") }),
            pullRequestPanelOf({ hasRemote: true, check: KNOWN, cli: undefined })
        ]

        // Assert
        expect(panels).toEqual([{ kind: "checking" }, { kind: "checking" }])
    })

    it("should ask what an unrecognised host is", () => {
        // Act
        const panel = pullRequestPanelOf({
            hasRemote: true,
            check: { kind: "known", status: { ...GITHUB_STATUS, provider: null, host: "git.example.org", detectedBy: null } },
            cli: gh("ok")
        })

        // Assert
        expect(panel).toEqual({ kind: "unknownHost", host: "git.example.org" })
    })

    it("should say the CLI is not installed when the tools did not find it", () => {
        // Act
        const panels = [
            pullRequestPanelOf({ hasRemote: true, check: KNOWN, cli: gh("missing") }),
            pullRequestPanelOf({ hasRemote: true, check: KNOWN, cli: null })
        ]

        // Assert
        expect(panels).toEqual([
            { kind: "notInstalled", hosting: GITHUB_HOSTING },
            { kind: "notInstalled", hosting: GITHUB_HOSTING }
        ])
    })

    it("should show the CLI's problem when it is too old or failed", () => {
        // Act
        const panels = [
            pullRequestPanelOf({ hasRemote: true, check: KNOWN, cli: gh("tooOld", "gh 2.0 is older than 2.40") }),
            pullRequestPanelOf({ hasRemote: true, check: KNOWN, cli: gh("failed") })
        ]

        // Assert
        expect(panels).toEqual([
            { kind: "cliProblem", hosting: GITHUB_HOSTING, line: "gh 2.0 is older than 2.40" },
            { kind: "cliProblem", hosting: GITHUB_HOSTING, line: "failed" }
        ])
    })

    it("should offer the number entry when the CLI works", () => {
        // Act
        const panel = pullRequestPanelOf({ hasRemote: true, check: KNOWN, cli: gh("ok") })

        // Assert
        expect(panel).toEqual({ kind: "numberEntry", hosting: GITHUB_HOSTING })
    })
})
