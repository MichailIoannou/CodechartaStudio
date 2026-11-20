import { LabelElement } from "./labelElement"

describe("LabelElement", () => {
    const styleOf = (element: HTMLElement) => element.getAttribute("style") ?? ""

    it("should style the label with theme tokens", () => {
        // Arrange & Act
        const label = new LabelElement("index.ts", "rloc: 42", 1)

        // Assert
        const content = label.getContentElement()
        expect(styleOf(content)).toContain("var(--color-base-100)")
        expect(styleOf(content)).toContain("var(--color-base-content)")
        expect(styleOf(content)).toContain("var(--color-base-300)")
        expect(styleOf(content)).not.toMatch(/#[0-9a-f]{3,6}\b|rgba\(255/i)
    })

    it("should write the metric in the faded text color of the theme", () => {
        // Arrange & Act
        const label = new LabelElement("index.ts", "rloc: 42", 1)

        // Assert
        const metricSpan = label.getContentElement().children[1] as HTMLElement
        expect(metricSpan.textContent).toBe("rloc: 42")
        expect(styleOf(metricSpan)).toContain("var(--color-base-content)")
    })

    it("should write the hidden count in the faded text color of the theme", () => {
        // Arrange
        const label = new LabelElement("index.ts", "", 1)

        // Act
        label.setBadge(3)

        // Assert
        const badge = label.getContentElement().lastElementChild as HTMLElement
        expect(badge.textContent).toBe("+3 more")
        expect(styleOf(badge)).toContain("var(--color-base-content)")
    })
})
