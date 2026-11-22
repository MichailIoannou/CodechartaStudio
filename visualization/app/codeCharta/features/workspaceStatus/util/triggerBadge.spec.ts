import { aSnapshot } from "../../projects/projects.mocks"
import { stalenessOf } from "./triggerBadge"

const SHOWN = aSnapshot("p", "f-api", "s-1", { target: "commit", shortCommit: "9f8e7d6", subject: "Release 2.4.0" })

describe("triggerBadge", () => {
    it("should word each distance and a different profile", () => {
        // Arrange
        const badge = { text: "badge", tone: "warning" as const }
        const base = { kind: "nearest" as const, snapshot: SHOWN, isCurrentProfile: true }

        // Act
        const phrases = [
            stalenessOf({ ...base, relation: "descendant", behind: 0, ahead: 1 }, badge, "a1b2c3d"),
            stalenessOf({ ...base, relation: "diverged", behind: 3, ahead: 2 }, badge, "a1b2c3d"),
            stalenessOf({ kind: "exact", snapshot: SHOWN, isCurrentProfile: false }, badge, "a1b2c3d")
        ].map(staleness => staleness?.phrase)
        const withoutBadge = stalenessOf({ kind: "exact", snapshot: SHOWN, isCurrentProfile: true }, null, "a1b2c3d")

        // Assert
        expect(phrases).toEqual([
            "1 commit ahead of a1b2c3d",
            "3 commits behind and 2 ahead of a1b2c3d",
            "analysed with a different profile"
        ])
        expect(withoutBadge).toBeNull()
    })
})
