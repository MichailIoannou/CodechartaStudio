import { TestBed } from "@angular/core/testing"
import { LocalStorageRepo } from "../../../util/persistence/localStorage.repo"
import { ThemeBootMirrorRepo, themeBootMirrorFor } from "./themeBootMirror.repo"

describe("ThemeBootMirrorRepo", () => {
    let stored: string | null
    let repo: ThemeBootMirrorRepo
    let write: jest.Mock

    beforeEach(() => {
        stored = null
        write = jest.fn()
        TestBed.configureTestingModule({
            providers: [{ provide: LocalStorageRepo, useValue: { read: () => stored, write } }]
        })
        repo = TestBed.inject(ThemeBootMirrorRepo)
    })

    it("should read back the mirror it wrote", () => {
        // Arrange
        const mirror = themeBootMirrorFor("cc-light")
        repo.write(mirror)
        stored = write.mock.calls[0][1]

        // Act
        const readBack = repo.read()

        // Assert
        expect(write).toHaveBeenCalledWith("codeCharta.themeBoot", expect.any(String))
        expect(readBack).toEqual(mirror)
    })

    it("should read nothing when no mirror was written", () => {
        // Arrange & Act
        const readBack = repo.read()

        // Assert
        expect(readBack).toBeNull()
    })

    it("should ignore a mirror of the wrong shape", () => {
        // Arrange
        const wrongShapes = [
            "[]",
            "null",
            JSON.stringify({ ...themeBootMirrorFor("cc-light"), version: 2 }),
            JSON.stringify({ ...themeBootMirrorFor("cc-light"), preference: 7 }),
            JSON.stringify({ ...themeBootMirrorFor("cc-light"), dark: { id: "cc-dark" } }),
            JSON.stringify({ ...themeBootMirrorFor("cc-light"), light: [] })
        ]

        // Act
        const readBack = wrongShapes.map(shape => {
            stored = shape
            return repo.read()
        })

        // Assert
        expect(readBack).toEqual(wrongShapes.map(() => null))
    })

    it("should ignore a mirror that is no JSON", () => {
        // Arrange
        stored = "{not json"

        // Act
        const readBack = repo.read()

        // Assert
        expect(readBack).toBeNull()
    })
})

describe("themeBootMirrorFor", () => {
    it("should show a picked theme whatever the system scheme", () => {
        // Arrange & Act
        const mirror = themeBootMirrorFor("cc-light")

        // Assert
        expect(mirror.light).toEqual({ id: "cc-light", background: "#ffffff", content: "#1f2937", track: "#d1d5db", accent: "#0374c9" })
        expect(mirror.dark).toEqual(mirror.light)
    })

    it("should show both CodeCharta themes while following the system", () => {
        // Arrange & Act
        const mirror = themeBootMirrorFor("system")

        // Assert
        expect(mirror.preference).toBe("system")
        expect(mirror.light.id).toBe("cc-light")
        expect(mirror.dark).toEqual({ id: "cc-dark", background: "#1e2329", content: "#e6e9ee", track: "#3a424d", accent: "#8b9cff" })
    })
})
