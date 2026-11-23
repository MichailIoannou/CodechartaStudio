import { measureFullBarMinimum } from "./fullBarMinimum"

function anElement(style: string, width = 0, ...children: HTMLElement[]): HTMLElement {
    const element = document.createElement("div")
    element.setAttribute("style", style)
    element.getBoundingClientRect = () => ({ width }) as DOMRect
    element.append(...children)
    return element
}

describe("measureFullBarMinimum", () => {
    afterEach(() => {
        document.body.replaceChildren()
    })

    it("should add up the cards at their minimum widths, the other items at their widths, the gaps and the frame", () => {
        // Arrange
        const layoutCell = anElement("flex-shrink: 0", 60)
        const areaCard = anElement("flex-shrink: 1; min-width: 80px", 140)
        const heightCard = anElement("flex-shrink: 1; min-width: 90px; margin: 0 4px", 160)
        const metricCells = anElement("display: contents", 0, areaCard, heightCard)
        const linkButton = anElement("flex-shrink: 1; min-width: auto", 32)
        const hiddenCell = anElement("display: none", 50)
        const probe = anElement("position: fixed", 900)
        const bar = anElement(
            "padding: 0 6px; border: 1px solid; column-gap: 4px",
            600,
            layoutCell,
            metricCells,
            linkButton,
            hiddenCell,
            probe
        )
        document.body.appendChild(bar)

        // Act
        const minimum = measureFullBarMinimum(bar)

        // Assert
        expect(minimum).toBe(2 * 6 + 2 * 1 + 3 * 4 + 60 + 80 + (90 + 8) + 32)
    })

    it("should be only its frame without items", () => {
        // Arrange
        const bar = anElement("padding: 0 6px", 0)
        document.body.appendChild(bar)

        // Act
        const minimum = measureFullBarMinimum(bar)

        // Assert
        expect(minimum).toBe(12)
    })
})
