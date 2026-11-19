import { TestBed } from "@angular/core/testing"
import type { CommitSelection } from "../model/commitSelection"
import { COMMIT_ACTIONS, CommitAction } from "../ports/commitActions.port"
import { CommitActionsService } from "./commitActions.service"
import { aLogCommit } from "./gitApi.mocks"

const ONE_COMMIT: CommitSelection = {
    repo: { projectId: "p-billing", folderId: "f-api" },
    items: [{ kind: "commit", commit: aLogCommit("a", "Fix invoice rounding") }]
}

function anAction(id: string, overrides: Partial<CommitAction> = {}): CommitAction {
    return {
        id,
        label: id,
        icon: "fa-solid fa-play",
        hoverHint: id,
        isPrimary: false,
        isOfferedFor: () => true,
        run: jest.fn(),
        ...overrides
    }
}

describe("CommitActionsService", () => {
    function serviceWith(actions: CommitAction[] | null) {
        if (actions) {
            TestBed.configureTestingModule({
                providers: actions.map(action => ({ provide: COMMIT_ACTIONS, multi: true, useValue: action }))
            })
        }
        return TestBed.inject(CommitActionsService)
    }

    it("should offer nothing without contributions", () => {
        // Arrange
        const service = serviceWith(null)

        // Act
        const offered = service.offeredFor(ONE_COMMIT)
        const hasRun = service.runPrimary(ONE_COMMIT)

        // Assert
        expect(offered).toEqual([])
        expect(hasRun).toBe(false)
    })

    it("should offer the contributed actions in their order and skip those not offered", () => {
        // Arrange
        const service = serviceWith([anAction("show"), anAction("hidden", { isOfferedFor: () => false }), anAction("analyse")])

        // Act
        const offered = service.offeredFor(ONE_COMMIT)

        // Assert
        expect(offered.map(action => action.id)).toEqual(["show", "analyse"])
    })

    it("should give the details pane only the offered actions with a details label", () => {
        // Arrange
        const service = serviceWith([anAction("menu-only"), anAction("analyse", { detailsLabel: "Analyse this commit" })])

        // Act
        const buttons = service.detailsActionsFor(ONE_COMMIT)

        // Assert
        expect(buttons.map(action => action.id)).toEqual(["analyse"])
    })

    it("should run the first offered primary action", () => {
        // Arrange
        const notOffered = anAction("other-primary", { isPrimary: true, isOfferedFor: () => false })
        const primary = anAction("show", { isPrimary: true })
        const service = serviceWith([anAction("analyse"), notOffered, primary])

        // Act
        const hasRun = service.runPrimary(ONE_COMMIT)

        // Assert
        expect(hasRun).toBe(true)
        expect(primary.run).toHaveBeenCalledWith(ONE_COMMIT)
        expect(notOffered.run).not.toHaveBeenCalled()
    })
})
