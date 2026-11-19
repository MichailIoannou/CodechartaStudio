import { TestBed } from "@angular/core/testing"
import { ProjectsBootService } from "../features/projects/facade"
import { CodeChartaComponent } from "./codeCharta.component"

describe("codeChartaComponent", () => {
    beforeEach(() => {
        TestBed.configureTestingModule({
            imports: [CodeChartaComponent],
            providers: [{ provide: ProjectsBootService, useValue: { boot: jest.fn() } }]
        })
    })

    it("should boot through the projects boot on initialization", () => {
        // Arrange
        const mockedProjectsBoot = {
            boot: jest.fn().mockResolvedValue(undefined)
        } as unknown as ProjectsBootService
        const codeChartaComponent = new CodeChartaComponent(mockedProjectsBoot)

        // Act
        codeChartaComponent.ngOnInit()

        // Assert
        expect(mockedProjectsBoot.boot).toHaveBeenCalled()
    })

    it("should set isInitialized on angulars init event after the files are loaded", async () => {
        // Arrange
        const mockedProjectsBoot = {
            boot: jest.fn().mockResolvedValue(undefined)
        } as unknown as ProjectsBootService
        const codeChartaComponent = new CodeChartaComponent(mockedProjectsBoot)

        // Act
        expect(codeChartaComponent.isInitialized()).toBe(false)
        codeChartaComponent.ngOnInit()
        await Promise.resolve()
        await Promise.resolve()

        // Assert
        expect(codeChartaComponent.isInitialized()).toBe(true)
    })

    it("should set isInitialized even when the load rejects", async () => {
        // Arrange
        const mockedProjectsBoot = {
            boot: jest.fn().mockRejectedValue(new Error("boom"))
        } as unknown as ProjectsBootService
        const codeChartaComponent = new CodeChartaComponent(mockedProjectsBoot)

        // Act
        codeChartaComponent.ngOnInit()
        await Promise.resolve()
        await Promise.resolve()
        await Promise.resolve()

        // Assert
        expect(codeChartaComponent.isInitialized()).toBe(true)
    })
})
