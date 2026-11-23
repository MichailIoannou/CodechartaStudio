import { aSnapshot } from "../../projects/projects.mocks"
import { checkoutResolutionOf, isAnalysisOf } from "./snapshotViewRules"

const SHOWN = aSnapshot("p-billing", "f-api", "s-older", { commit: "9f8e7d6", shortCommit: "9f8e7d6" })

describe("snapshotViewRules", () => {
    describe("checkoutResolutionOf", () => {
        it.each([
            [{ onlyInCandidate: 0, onlyInTarget: 4 }, "ancestor"],
            [{ onlyInCandidate: 2, onlyInTarget: 0 }, "descendant"],
            [{ onlyInCandidate: 2, onlyInTarget: 4 }, "diverged"]
        ])("should word the distance %j as a nearest snapshot that is %s", (counts, relation) => {
            // Arrange
            const distance = { sha: "9f8e7d6", ...counts }

            // Act
            const resolution = checkoutResolutionOf(SHOWN, distance)

            // Assert
            expect(resolution).toEqual({
                kind: "nearest",
                snapshot: SHOWN,
                isCurrentProfile: true,
                relation,
                behind: counts.onlyInTarget,
                ahead: counts.onlyInCandidate
            })
        })

        it("should compare nothing at the same commit or without a distance", () => {
            // Arrange
            const sameCommit = { sha: "9f8e7d6", onlyInCandidate: 0, onlyInTarget: 0 }

            // Act
            const resolutions = [checkoutResolutionOf(SHOWN, sameCommit), checkoutResolutionOf(SHOWN, null)]

            // Assert
            expect(resolutions).toEqual([null, null])
        })
    })

    describe("isAnalysisOf", () => {
        it("should count only a clean analysis of the commit", () => {
            // Arrange
            const dirty = aSnapshot("p-billing", "f-api", "s-dirty", { commit: "a1b2c3d", dirty: true })
            const clean = aSnapshot("p-billing", "f-api", "s-clean", { commit: "a1b2c3d" })

            // Act
            const answers = [isAnalysisOf("a1b2c3d", [SHOWN, dirty]), isAnalysisOf("a1b2c3d", [dirty, clean])]

            // Assert
            expect(answers).toEqual([false, true])
        })
    })
})
