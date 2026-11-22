import { TestBed } from "@angular/core/testing"
import { screen } from "@testing-library/angular"
import userEvent from "@testing-library/user-event"
import { aSnapshot } from "../../../projects/projects.mocks"
import { SnapshotRetentionService } from "../../services/snapshotRetention.service"
import { DeleteSnapshotDialogComponent } from "./deleteSnapshotDialog.component"

const SNAPSHOT = aSnapshot("p-billing", "f-api", "s-1", { target: "commit", shortCommit: "a1b2c3d" })

describe("DeleteSnapshotDialogComponent", () => {
    const retention = { delete: jest.fn().mockResolvedValue(undefined) }

    async function renderDialog() {
        HTMLDialogElement.prototype.showModal = jest.fn()
        HTMLDialogElement.prototype.close = jest.fn()
        retention.delete.mockClear()
        TestBed.configureTestingModule({ providers: [{ provide: SnapshotRetentionService, useValue: retention }] })
        const fixture = TestBed.createComponent(DeleteSnapshotDialogComponent)
        fixture.autoDetectChanges()
        await fixture.whenStable()
        return fixture
    }

    it("should ask about the snapshot and delete nothing on cancel", async () => {
        // Arrange
        const fixture = await renderDialog()

        // Act
        fixture.componentInstance.open(SNAPSHOT)
        await fixture.whenStable()
        await userEvent.click(screen.getByTestId("delete-snapshot-cancel"))

        // Assert
        expect(screen.getByTestId("delete-snapshot-question").textContent).toBe("Move the analysis of a1b2c3d to the recycle bin?")
        expect(retention.delete).not.toHaveBeenCalled()
        expect(HTMLDialogElement.prototype.close).toHaveBeenCalled()
    })

    it("should delete the snapshot it asked about and close", async () => {
        // Arrange
        const fixture = await renderDialog()
        fixture.componentInstance.open(SNAPSHOT)

        // Act
        await userEvent.click(screen.getByTestId("delete-snapshot-confirm"))
        await fixture.whenStable()

        // Assert
        expect(retention.delete).toHaveBeenCalledWith(SNAPSHOT)
        expect(HTMLDialogElement.prototype.close).toHaveBeenCalled()
    })

    it("should do nothing when confirmed before it was opened", async () => {
        // Arrange
        const fixture = await renderDialog()

        // Act
        await fixture.componentInstance.confirm()

        // Assert
        expect(retention.delete).not.toHaveBeenCalled()
    })
})
