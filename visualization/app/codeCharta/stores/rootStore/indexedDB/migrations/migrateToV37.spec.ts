import { migrateCcStateRecordToV37 } from "./migrateToV37"

describe("migrateCcStateRecordToV37 (the theme)", () => {
    it("should put preferences saved before themes existed into the dark theme, and keep the rest", () => {
        // Arrange
        const oldShapeState = { preferences: { radialLevels: 4 } }

        // Act
        const migrated = migrateCcStateRecordToV37(oldShapeState)

        // Assert
        expect(migrated).toEqual({ preferences: { radialLevels: 4, theme: "cc-dark" } })
    })

    it("should leave preferences that name a theme already, and states without any, as they are", () => {
        // Arrange
        const namedAlready = { preferences: { theme: "cc-light" } }
        const withoutPreferences = { mapState: {} }

        // Act
        const migrated = [namedAlready, withoutPreferences, null].map(state => migrateCcStateRecordToV37(state))

        // Assert
        expect(migrated).toEqual([namedAlready, withoutPreferences, null])
    })
})
