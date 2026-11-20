import { TestBed } from "@angular/core/testing"
import { BehaviorSubject } from "rxjs"
import { FileMeta } from "../../../model/codeCharta.model"
import { FileStoreReadWindow } from "../../../stores/fileStore/fileStore.facade"
import { PreferencesReadWindow } from "../../../stores/preferences/preferences.read.facade"
import { ToastService } from "../../shared/facade"
import { LINKED_SOURCE_FOLDERS, LinkedSourceFolder } from "../ports/linkedSourceFolders.port"
import { BLOCKED_MESSAGE, LocalSourceAvailability } from "./localSourceAvailability"

describe("LocalSourceAvailability", () => {
    const toastMock = { show: jest.fn() }
    const linkedFolder: LinkedSourceFolder = { status: "available", rootPath: "/repos/app", readFile: async () => null }
    let isSwitchedOn: BehaviorSubject<boolean>
    let visibleFileStates: BehaviorSubject<{ file: { fileMeta: Pick<FileMeta, "fileName"> } }[]>

    function availabilityIn({ hasPicker = true, isOn = true }: { hasPicker?: boolean; isOn?: boolean } = {}) {
        if (hasPicker) {
            ;(window as unknown as { showDirectoryPicker: jest.Mock }).showDirectoryPicker = jest.fn()
        }
        isSwitchedOn = new BehaviorSubject(isOn)
        visibleFileStates = new BehaviorSubject([{ file: { fileMeta: { fileName: "upload.cc.json" } } }])
        TestBed.configureTestingModule({
            providers: [
                { provide: PreferencesReadWindow, useValue: { localSourceEnabled$: isSwitchedOn } },
                { provide: FileStoreReadWindow, useValue: { visibleFileStates$: visibleFileStates } },
                { provide: ToastService, useValue: toastMock },
                {
                    provide: LINKED_SOURCE_FOLDERS,
                    useValue: { folderOf: (fileMeta: FileMeta) => (fileMeta.fileName === "app@1a2b3c4" ? linkedFolder : null) }
                }
            ]
        })
        return TestBed.inject(LocalSourceAvailability)
    }

    beforeEach(() => {
        jest.clearAllMocks()
    })

    afterEach(() => {
        delete (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker
    })

    it("should offer local source files where folders can be opened and the reader switched them on", () => {
        // Act
        const availability = availabilityIn()

        // Assert
        expect(availability.isAvailable()).toBe(true)
    })

    it("should hide local source files while they are switched off, and offer them once switched on", () => {
        // Arrange
        const availability = availabilityIn({ isOn: false })
        const whileOff = availability.isAvailable()

        // Act
        isSwitchedOn.next(true)

        // Assert
        expect(whileOff).toBe(false)
        expect(availability.isAvailable()).toBe(true)
    })

    it("should hide local source files where the browser cannot open folders, even when switched on", () => {
        // Act
        const availability = availabilityIn({ hasPicker: false })

        // Assert
        expect(availability.isAvailable()).toBe(false)
    })

    it("should hide local source files for the rest of the session once the browser blocked a folder, and say so once", () => {
        // Arrange
        const availability = availabilityIn()

        // Act
        availability.reportBlocked()
        availability.reportBlocked()

        // Assert
        expect(availability.isAvailable()).toBe(false)
        expect(toastMock.show).toHaveBeenCalledTimes(1)
        expect(toastMock.show).toHaveBeenCalledWith(BLOCKED_MESSAGE, "warning")
    })

    it("should offer the source files of a visible map that has a linked folder, even while switched off", () => {
        // Arrange
        const availability = availabilityIn({ hasPicker: false, isOn: false })
        const withoutLinkedMap = availability.isAvailable()

        // Act
        visibleFileStates.next([{ file: { fileMeta: { fileName: "app@1a2b3c4" } } }])

        // Assert
        expect(withoutLinkedMap).toBe(false)
        expect(availability.isAvailable()).toBe(true)
        expect(availability.canChooseFolders()).toBe(false)
    })

    it("should offer choosing folders only where folders can be opened and the reader switched them on", () => {
        // Act
        const availability = availabilityIn()

        // Assert
        expect(availability.canChooseFolders()).toBe(true)
    })
})
