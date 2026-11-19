import { TestBed } from "@angular/core/testing"
import { screen } from "@testing-library/angular"
import userEvent from "@testing-library/user-event"
import type { FolderListRow } from "../../util/folderListRows"
import { FolderListEditorComponent } from "./folderListEditor.component"

function aRow(key: string, overrides: Partial<FolderListRow> = {}): FolderListRow {
    return {
        key,
        label: key,
        role: "helper",
        kind: "git",
        path: `/work/${key}`,
        remote: null,
        hint: null,
        isMissing: false,
        snapshotCount: 0,
        ...overrides
    }
}

describe("FolderListEditorComponent", () => {
    function renderEditor(rows: FolderListRow[], managesSavedFolders = false) {
        const fixture = TestBed.createComponent(FolderListEditorComponent)
        fixture.componentRef.setInput("rows", rows)
        fixture.componentRef.setInput("managesSavedFolders", managesSavedFolders)
        fixture.autoDetectChanges()
        return fixture
    }

    it("should explain what to add when there are no folders", () => {
        // Arrange & Act
        renderEditor([])

        // Assert
        expect(screen.getByTestId("folder-list-empty").textContent).toContain("No folders yet. Add the repository folder first")
    })

    it("should refuse a label another folder uses or one with a slash", async () => {
        // Arrange
        const fixture = renderEditor([aRow("api"), aRow("web")])
        const changes = jest.fn()
        fixture.componentInstance.labelChange.subscribe(changes)
        const [, webLabel] = screen.getAllByLabelText("Folder label")

        // Act
        await userEvent.clear(webLabel)
        await userEvent.type(webLabel, "API{Enter}")
        const duplicates = screen.queryAllByText("Another folder already uses this label.")
        await userEvent.clear(webLabel)
        await userEvent.type(webLabel, "a/b{Enter}")

        // Assert
        expect(duplicates).toHaveLength(1)
        expect(screen.getByText("A label cannot contain '/'.")).toBeTruthy()
        expect(fixture.componentInstance.hasProblems()).toBe(true)
        expect(changes).not.toHaveBeenCalled()
    })

    it("should put back the label when it is emptied", async () => {
        // Arrange
        const fixture = renderEditor([aRow("api")])
        const changes = jest.fn()
        fixture.componentInstance.labelChange.subscribe(changes)
        const label = screen.getByLabelText("Folder label") as HTMLInputElement

        // Act
        await userEvent.clear(label)
        await userEvent.tab()

        // Assert
        expect(label.value).toBe("api")
        expect(changes).not.toHaveBeenCalled()
    })

    it("should offer re-link for a missing folder and refresh for the others when managing saved folders", async () => {
        // Arrange
        const fixture = renderEditor([aRow("api"), aRow("gone", { isMissing: true })], true)
        const relinked = jest.fn()
        const refreshed = jest.fn()
        fixture.componentInstance.relink.subscribe(relinked)
        fixture.componentInstance.refresh.subscribe(refreshed)

        // Act
        await userEvent.click(screen.getByRole("button", { name: "Re-link…" }))
        await userEvent.click(screen.getByRole("button", { name: "Refresh git facts of api" }))

        // Assert
        expect(screen.getByText("missing")).toBeTruthy()
        expect(relinked).toHaveBeenCalledWith(expect.objectContaining({ key: "gone" }))
        expect(refreshed).toHaveBeenCalledWith(expect.objectContaining({ key: "api" }))
    })

    it("should show the path, the first remote and the relationship", () => {
        // Arrange & Act
        renderEditor([aRow("fork", { remote: "origin github.com/acme/fork", hint: "fork of api" })])

        // Assert
        const row = screen.getByTestId("folder-row-fork").textContent?.replace(/\s+/g, " ")
        expect(row).toContain("/work/fork · origin github.com/acme/fork · fork of api")
    })
})
