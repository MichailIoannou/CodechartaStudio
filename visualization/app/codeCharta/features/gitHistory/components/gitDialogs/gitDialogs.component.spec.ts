import { TestBed } from "@angular/core/testing"
import { render, screen } from "@testing-library/angular"
import { aFolder, aProject } from "../../../projects/projects.mocks"
import { BranchActionsService } from "../../services/branchActions.service"
import { aLocalBranch } from "../../services/gitApi.mocks"
import { GitConfirmationService } from "../../services/gitConfirmation.service"
import { provideGitHistory } from "../../services/gitHistoryTestBed.mocks"
import { HOOKS_NOTICE } from "../../util/effectText"
import { GitDialogsComponent } from "./gitDialogs.component"

describe("GitDialogsComponent", () => {
    const originalShowModal = HTMLDialogElement.prototype.showModal

    beforeEach(() => {
        HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
            this.setAttribute("open", "")
        }
    })

    afterEach(() => {
        HTMLDialogElement.prototype.showModal = originalShowModal
    })

    async function renderDialogs() {
        provideGitHistory({}, aProject("p-billing", [aFolder("f-api")]))
        const rendered = await render(GitDialogsComponent)
        return rendered.fixture
    }

    it("should show the confirmation a git action asks for", async () => {
        // Arrange
        const fixture = await renderDialogs()

        // Act
        void TestBed.inject(GitConfirmationService).ask(HOOKS_NOTICE)
        fixture.detectChanges()

        // Assert
        expect((screen.getByTestId("git-confirm-dialog") as HTMLDialogElement).open).toBe(true)
        expect(screen.getByText("Git Hooks")).toBeTruthy()
    })

    it("should show the branch dialog a git action opens", async () => {
        // Arrange
        const fixture = await renderDialogs()

        // Act
        TestBed.inject(BranchActionsService).openDialog({ kind: "setUpstream", branch: aLocalBranch("main", { isCurrent: true }) })
        fixture.detectChanges()

        // Assert
        expect((screen.getByTestId("branch-dialog") as HTMLDialogElement).open).toBe(true)
        expect(screen.getByRole("heading", { name: "Set Upstream", hidden: true })).toBeTruthy()
    })
})
