import { DesktopBridgeError, valueOrThrow } from "./desktopResult"

describe("desktopResult", () => {
    it("should return the value of a successful result", () => {
        // Arrange
        const result = { ok: true as const, value: { coreVersion: "0.1.0" } }

        // Act
        const value = valueOrThrow(result)

        // Assert
        expect(value).toEqual({ coreVersion: "0.1.0" })
    })

    it("should throw a bridge error carrying code and details for a failed result", () => {
        // Arrange
        const result = { ok: false as const, error: { code: "TOOL_FAILED" as const, message: "git failed", details: { tool: "git" } } }

        // Act
        const unwrap = () => valueOrThrow(result)

        // Assert
        expect(unwrap).toThrow(DesktopBridgeError)
        expect(unwrap).toThrow(expect.objectContaining({ code: "TOOL_FAILED", message: "git failed", details: { tool: "git" } }))
    })

    it("should default the details of an error built without any", () => {
        // Arrange
        const error = new DesktopBridgeError({ code: "NOT_ALLOWED", message: "no" })

        // Act
        const { details } = error

        // Assert
        expect(details).toEqual({})
        expect(error).toBeInstanceOf(Error)
    })
})
