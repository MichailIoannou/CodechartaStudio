import { TestBed } from "@angular/core/testing"
import { screen } from "@testing-library/angular"
import userEvent from "@testing-library/user-event"
import type { SnapshotSummary } from "../../../../model/coreApi/SnapshotSummary"
import { aFolder, aProject, aSnapshot } from "../../projects.mocks"
import { ProjectsTestBed, settle, setUpProjects } from "../../projectsTestBed.mocks"
import { AnalysesCardComponent } from "./analysesCard.component"

const IMPORTED = aSnapshot("p-1", "f-1", "s-imported", { source: "imported", createdAt: "2026-11-12T10:00:00Z" })
const ANALYSED = aSnapshot("p-1", "f-1", "s-analysed", {
    shortCommit: "9f8e7d6",
    subject: "Release 2.4.0",
    finishedAt: "2026-10-28T09:00:00Z"
})

describe("AnalysesCardComponent", () => {
    let testBed: ProjectsTestBed

    async function renderCard(snapshots: SnapshotSummary[], storeBytes: number | null = null) {
        testBed = await setUpProjects({ projects: [aProject("p-1", [aFolder("f-1")])], activeProjectId: "p-1", snapshots })
        const fixture = TestBed.createComponent(AnalysesCardComponent)
        fixture.componentRef.setInput("snapshots", snapshots)
        fixture.componentRef.setInput("storeBytes", storeBytes)
        fixture.autoDetectChanges()
        await settle()
        return fixture
    }

    it("should say that there is no analysis yet and disable Show map", async () => {
        // Arrange & Act
        await renderCard([])

        // Assert
        expect(screen.getByTestId("analyses-none").textContent).toContain("No analysis yet. Analyse the current checkout to see its map.")
        const showMap = screen.getByTestId("analyses-show-map") as HTMLButtonElement
        expect(showMap.disabled).toBe(true)
        expect(showMap.title).toBe("No analysis yet")
    })

    it("should label an imported snapshot with an unknown analysis time and an unknown commit", async () => {
        // Arrange & Act
        await renderCard([IMPORTED])

        // Assert
        const rows = screen.getByTestId("analyses-rows").textContent ?? ""
        expect(rows).toContain("commit unknown")
        expect(rows).toContain("analysis time unknown (imported 12 Nov)")
        expect(screen.getByTestId("analyses-in-the-map").textContent).toContain("nothing shown")
    })

    it("should show what is in the map, the count with the store size and go to the map", async () => {
        // Arrange
        await renderCard([ANALYSED], 61_200_000)
        await testBed.projects.showWorkingFolder()
        await settle()

        // Act
        await userEvent.click(screen.getByTestId("analyses-show-map"))

        // Assert
        expect(screen.getByTestId("analyses-in-the-map").textContent).toContain("9f8e7d6")
        expect(screen.getByTestId("analyses-rows").textContent).toContain("1 · 61.2 MB")
        expect(screen.getByTestId("analyses-rows").textContent).toContain("28 Oct")
        expect(testBed.router.navigateByUrl).toHaveBeenCalledWith("/")
    })
})
