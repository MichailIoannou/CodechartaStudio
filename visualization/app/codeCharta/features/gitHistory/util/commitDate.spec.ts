import { commitDateTime, shortCommitDateTime } from "./commitDate"

const THIRD_OF_NOVEMBER_14_03_UTC = 1_793_714_580

describe("commitDate", () => {
    it("should write the date and time for a given locale and zone", () => {
        // Act
        const british = commitDateTime(THIRD_OF_NOVEMBER_14_03_UTC, { timeZone: "UTC" })
        const german = commitDateTime(THIRD_OF_NOVEMBER_14_03_UTC, { locale: "de-DE", timeZone: "Europe/Berlin" })

        // Assert
        expect(british).toBe("3 Nov 2026, 14:03")
        expect(german).toBe("3. Nov. 2026, 15:03")
    })

    it("should write a short date and time without the year", () => {
        // Act
        const short = shortCommitDateTime(THIRD_OF_NOVEMBER_14_03_UTC, { timeZone: "UTC" })

        // Assert
        expect(short).toBe("3 Nov 14:03")
    })
})
