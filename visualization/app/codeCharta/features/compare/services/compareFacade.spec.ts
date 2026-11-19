import { signal } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { StoreModule } from "@ngrx/store"
import { appReducers, setStateMiddleware } from "../../../stores/rootStore/store"
import { ProjectsFacade } from "../../projects/facade"
import { aFolder, aProject } from "../../projects/projects.mocks"
import { ToastService } from "../../shared/facade"
import { FOLDER, HEAD_SHA } from "../ports/compareGateways.mocks"
import { CompareStore } from "../stores/compare.store"
import { CompareService } from "./compare.service"
import { CompareFacade } from "./compareFacade"

describe("CompareFacade", () => {
    let service: { start: jest.Mock; swap: jest.Mock; exit: jest.Mock }
    let toast: jest.Mock
    let project: ReturnType<typeof signal<ReturnType<typeof aProject> | null>>

    function createFacade() {
        service = { start: jest.fn().mockResolvedValue(undefined), swap: jest.fn(), exit: jest.fn() }
        toast = jest.fn()
        project = signal<ReturnType<typeof aProject> | null>(aProject("p-billing", [aFolder("f-api")]))
        TestBed.configureTestingModule({
            imports: [StoreModule.forRoot(appReducers, { metaReducers: [setStateMiddleware] })],
            providers: [
                { provide: CompareService, useValue: service },
                { provide: ToastService, useValue: { show: toast } },
                { provide: ProjectsFacade, useValue: { isDesktop: signal(true), activeProject: project } }
            ]
        })
        return TestBed.inject(CompareFacade)
    }

    it("should be available with a git folder in the active project only", () => {
        // Arrange
        const facade = createFacade()
        const withGit = facade.isAvailable()

        // Act
        project.set(aProject("p-out", [aFolder("f-out", { kind: "plain" })]))

        // Assert
        expect(withGit).toBe(true)
        expect(facade.isAvailable()).toBe(false)
    })

    it("should start each commit intent", async () => {
        // Arrange
        const facade = createFacade()

        // Act
        await facade.compareCommits(FOLDER, "a", "b")
        await facade.compareWithParent(FOLDER, HEAD_SHA)
        await facade.compareWithCurrent(FOLDER, HEAD_SHA)

        // Assert
        expect(service.start.mock.calls.map(([intent]) => intent.kind)).toEqual(["commits", "withParent", "withCurrent"])
    })

    it("should compare a branch in the base mode last chosen for the project unless one is given", async () => {
        // Arrange
        localStorage.setItem("codeChartaCompareBaseMode", JSON.stringify({ [FOLDER.projectId]: "tip" }))
        const facade = createFacade()

        // Act
        await facade.compareBranch(FOLDER, "refs/heads/feature/x")
        await facade.compareBranch(FOLDER, "refs/heads/feature/x", { target: "refs/heads/main", baseMode: "mergeBase" })

        // Assert
        expect(service.start.mock.calls.map(([intent]) => intent)).toEqual([
            { kind: "branch", folder: FOLDER, branch: "refs/heads/feature/x", target: null, baseMode: "tip" },
            { kind: "branch", folder: FOLDER, branch: "refs/heads/feature/x", target: "refs/heads/main", baseMode: "mergeBase" }
        ])
        localStorage.clear()
    })

    it("should open the dialog when a comparison started from a menu needs a decision", async () => {
        // Arrange
        const facade = createFacade()
        const store = TestBed.inject(CompareStore)
        service.start.mockImplementation(() => {
            store.update({ phase: "needsDecision" })
            return Promise.resolve()
        })

        // Act
        await facade.compareWithParent(FOLDER, HEAD_SHA)

        // Assert
        expect(store.dialogPrefill()).toEqual({ folder: FOLDER })
    })

    it("should toast the error of a comparison started from a menu", async () => {
        // Arrange
        const facade = createFacade()
        const store = TestBed.inject(CompareStore)
        service.start.mockImplementation(() => {
            store.update({ phase: "failed", error: { kind: "coreUnavailable", message: "" } })
            return Promise.resolve()
        })

        // Act
        await facade.compareWithParent(FOLDER, HEAD_SHA)

        // Assert
        expect(toast).toHaveBeenCalledWith("The CodeCharta core is not running.", "error")
        expect(store.dialogPrefill()).toBeNull()
    })

    it("should leave errors to an open dialog", async () => {
        // Arrange
        const facade = createFacade()
        const store = TestBed.inject(CompareStore)
        facade.openDialog()
        service.start.mockImplementation(() => {
            store.update({ phase: "failed", error: { kind: "coreUnavailable", message: "" } })
            return Promise.resolve()
        })

        // Act
        await facade.compareWithParent(FOLDER, HEAD_SHA)

        // Assert
        expect(toast).not.toHaveBeenCalled()
    })

    it("should pass swap and exit to the service", () => {
        // Arrange
        const facade = createFacade()

        // Act
        facade.swap()
        facade.exit()

        // Assert
        expect(service.swap).toHaveBeenCalled()
        expect(service.exit).toHaveBeenCalled()
    })
})
