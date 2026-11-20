import { TestBed } from "@angular/core/testing"
import type { ErrorPayload } from "../../../model/coreApi/ErrorPayload"
import { createFakeDesktopBridge, FakeDesktopBridge } from "../../../util/desktop/desktopBridge.mocks"
import { DESKTOP_BRIDGE } from "../../../util/desktop/desktopBridge.token"
import { ToastService } from "../../shared/facade"
import { PATHS } from "../desktopTools.mocks"
import { StoreFolderService } from "./storeFolder.service"

const CHOSEN = { ...PATHS, storeRoot: "/elsewhere/store", isDefaultStoreRoot: false }

describe("StoreFolderService", () => {
    let bridge: FakeDesktopBridge
    let toastService: { show: jest.Mock }

    function createService() {
        bridge = createFakeDesktopBridge()
        toastService = { show: jest.fn() }
        TestBed.configureTestingModule({
            providers: [
                { provide: DESKTOP_BRIDGE, useValue: bridge },
                { provide: ToastService, useValue: toastService }
            ]
        })
        return TestBed.inject(StoreFolderService)
    }

    function refusal(code: ErrorPayload["code"], message: string, details: ErrorPayload["details"] = {}): ErrorPayload {
        return { code, message, details }
    }

    it("should change the store folder through the native picker and announce the change", async () => {
        // Arrange
        const service = createService()
        bridge.respondWith("chooseStoreRoot", CHOSEN)

        // Act
        const paths = await service.chooseFolder()

        // Assert
        expect(paths).toEqual(CHOSEN)
        expect(bridge.calls.find(call => call.name === "chooseStoreRoot")?.args).toEqual([{ title: "Choose the store folder" }])
        expect(toastService.show).toHaveBeenCalledWith("Analyses are now kept in '/elsewhere/store'.", "success")
        expect(service.changes()).toBe(1)
        expect(service.isChanging()).toBe(false)
    })

    it("should change nothing when the picker is cancelled", async () => {
        // Arrange
        const service = createService()

        // Act
        const paths = await service.chooseFolder()

        // Assert
        expect(paths).toBeNull()
        expect(toastService.show).not.toHaveBeenCalled()
        expect(service.changes()).toBe(0)
    })

    it("should go back to the default folder", async () => {
        // Arrange
        const service = createService()
        bridge.respondWith("paths.resetStoreRoot", PATHS)

        // Act
        const paths = await service.useDefaultFolder()

        // Assert
        expect(paths).toEqual(PATHS)
        expect(toastService.show).toHaveBeenCalledWith(`Analyses are now kept in '${PATHS.storeRoot}'.`, "success")
        expect(service.changes()).toBe(1)
    })

    it("should name the refused folder when it is neither empty nor a store", async () => {
        // Arrange
        const service = createService()
        bridge.failWith("chooseStoreRoot", refusal("BAD_REQUEST", "not empty", { path: "/home/mia" }))

        // Act
        await service.chooseFolder()

        // Assert
        expect(toastService.show).toHaveBeenCalledWith(
            "'/home/mia' is not empty and holds no CodeCharta store. Choose an empty folder.",
            "error"
        )
        expect(service.changes()).toBe(0)
    })

    it("should say that the store could not be copied and pass on other refusals", async () => {
        // Arrange
        const service = createService()
        bridge.failWith("chooseStoreRoot", refusal("IO", "Disk full"))
        bridge.failWith("paths.resetStoreRoot", refusal("CONFLICT", "Analyses are running."))

        // Act
        await service.chooseFolder()
        await service.useDefaultFolder()

        // Assert
        expect(toastService.show.mock.calls).toEqual([
            ["The store could not be copied: Disk full", "error"],
            ["Analyses are running.", "error"]
        ])
    })

    it("should stay silent while the core is offline and start no second change", async () => {
        // Arrange
        const service = createService()
        bridge.failWith("chooseStoreRoot", refusal("CORE_UNAVAILABLE", "offline"))

        // Act
        const first = service.chooseFolder()
        const second = await service.useDefaultFolder()
        await first

        // Assert
        expect(second).toBeNull()
        expect(toastService.show).not.toHaveBeenCalled()
        expect(bridge.calls.filter(call => call.name === "request")).toEqual([])
    })
})
