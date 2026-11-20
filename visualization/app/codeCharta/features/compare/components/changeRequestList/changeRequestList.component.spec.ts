import { render, screen } from "@testing-library/angular"
import userEvent from "@testing-library/user-event"
import type { KnownHosting } from "../../model/compare.model"
import { FOLDER } from "../../ports/compareGateways.mocks"
import { ChangeRequestService } from "../../services/changeRequest.service"
import { HostingCheckService } from "../../services/hostingCheck.service"
import type { PullRequestPanel } from "../../services/pullRequestPanel"
import { ChangeRequestListComponent } from "./changeRequestList.component"

const GITHUB: KnownHosting = { provider: "github", host: "github.com", repository: "mia/billing", remote: "origin" }
const GITLAB: KnownHosting = { provider: "gitlab", host: "gitlab.com", repository: "mia/billing", remote: "origin" }

describe("ChangeRequestListComponent", () => {
    const changeRequests = { openByNumber: jest.fn(), baseBranchesOf: jest.fn() }
    const hostingCheck = { treatHostAs: jest.fn(), refresh: jest.fn() }

    async function setup(panel: PullRequestPanel, defaultBranch: string | null = "main") {
        jest.clearAllMocks()
        changeRequests.baseBranchesOf.mockResolvedValue(["feature/x", "main"])
        const openDesktopTools = jest.fn()
        const started = jest.fn()
        const rendered = await render(ChangeRequestListComponent, {
            inputs: { folder: FOLDER, panel, defaultBranch },
            on: { openDesktopTools, started },
            providers: [
                { provide: ChangeRequestService, useValue: changeRequests },
                { provide: HostingCheckService, useValue: hostingCheck }
            ]
        })
        await rendered.fixture.whenStable()
        return { ...rendered, openDesktopTools, started }
    }

    it("should show five skeleton rows while checking", async () => {
        // Act
        await setup({ kind: "checking" })

        // Assert
        expect(screen.getByTestId("change-requests-checking").querySelectorAll("li")).toHaveLength(5)
        expect(screen.queryByTestId("change-requests-number-entry")).toBeNull()
    })

    it("should ask what an unrecognised host is and keep the answer", async () => {
        // Arrange
        await setup({ kind: "unknownHost", host: "git.example.org" })

        // Act
        await userEvent.click(screen.getByRole("button", { name: "GitLab" }))

        // Assert
        expect(screen.getByTestId("change-requests-unknown-host").textContent).toContain(
            "This host is not recognised. Treat git.example.org as:"
        )
        expect(hostingCheck.treatHostAs).toHaveBeenCalledWith(FOLDER, "git.example.org", "gitlab")
    })

    it("should say how to install the GitHub CLI and open the desktop tools", async () => {
        // Arrange
        const { openDesktopTools } = await setup({ kind: "notInstalled", hosting: GITHUB })

        // Act
        await userEvent.click(screen.getByRole("button", { name: "Open desktop tools" }))

        // Assert
        expect(screen.getByTestId("change-requests-not-installed").textContent).toContain(
            "Install the GitHub CLI (gh) to list pull requests, or enter a number below."
        )
        expect(screen.getByRole("link", { name: "cli.github.com" }).getAttribute("href")).toBe("https://cli.github.com")
        expect(openDesktopTools).toHaveBeenCalled()
    })

    it("should word the GitLab CLI and merge requests", async () => {
        // Act
        await setup({ kind: "notInstalled", hosting: GITLAB })

        // Assert
        expect(screen.getByTestId("change-requests-not-installed").textContent).toContain(
            "Install the GitLab CLI (glab) to list merge requests"
        )
        expect(screen.getByLabelText("Open merge request by number").getAttribute("placeholder")).toBe("!123")
    })

    it("should show the CLI's problem and refresh", async () => {
        // Arrange
        await setup({ kind: "cliProblem", hosting: GITHUB, line: "gh: command failed" })

        // Act
        await userEvent.click(screen.getByRole("button", { name: "Refresh pull requests" }))

        // Assert
        expect(screen.getByTestId("change-requests-problem").textContent).toContain("gh: command failed")
        expect(hostingCheck.refresh).toHaveBeenCalledWith(FOLDER)
    })

    it("should compare by number without a CLI", async () => {
        // Arrange
        const { started } = await setup({ kind: "notInstalled", hosting: GITHUB })

        // Act
        await userEvent.type(screen.getByTestId("change-requests-number"), "42")
        await userEvent.click(screen.getByRole("button", { name: "Open" }))

        // Assert
        expect(started).toHaveBeenCalled()
        expect(changeRequests.openByNumber).toHaveBeenCalledWith({
            folder: FOLDER,
            provider: "github",
            number: 42,
            remote: "origin",
            baseRefName: "main",
            url: "https://github.com/mia/billing/pull/42"
        })
    })

    it("should open nothing until a whole number is entered", async () => {
        // Arrange
        await setup({ kind: "numberEntry", hosting: GITHUB })

        // Act
        await userEvent.type(screen.getByTestId("change-requests-number"), "4.5")

        // Assert
        expect((screen.getByRole("button", { name: "Open" }) as HTMLButtonElement).disabled).toBe(true)
    })

    it("should offer the folder's branches as the base, the default branch first", async () => {
        // Act
        await setup({ kind: "numberEntry", hosting: GITHUB }, "develop")

        // Assert
        const options = Array.from((screen.getByTestId("change-requests-base") as HTMLSelectElement).options).map(option => option.value)
        expect(options).toEqual(["develop", "feature/x", "main"])
    })
})
