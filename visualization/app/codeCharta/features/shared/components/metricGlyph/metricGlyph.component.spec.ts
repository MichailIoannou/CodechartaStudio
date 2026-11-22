import { render } from "@testing-library/angular"
import { MetricGlyphComponent, MetricGlyphKind } from "./metricGlyph.component"

describe("MetricGlyphComponent", () => {
    async function renderGlyph(kind: MetricGlyphKind) {
        const { container } = await render(MetricGlyphComponent, { inputs: { kind } })
        return container.querySelector("svg") as SVGElement
    }

    it("should draw the area as a footprint tile with a tinted top", async () => {
        // Act
        const glyph = await renderGlyph("area")

        // Assert
        const paths = glyph.querySelectorAll("path")
        expect(glyph.dataset.glyph).toBe("area")
        expect(paths).toHaveLength(2)
        expect(paths[0].getAttribute("fill-opacity")).toBe(".4")
    })

    it("should draw the height as a building with an up arrow", async () => {
        // Act
        const glyph = await renderGlyph("height")

        // Assert
        expect(glyph.dataset.glyph).toBe("height")
        expect(glyph.querySelectorAll("path")).toHaveLength(3)
    })

    it("should be decorative and follow the text colour", async () => {
        // Act
        const glyph = await renderGlyph("area")

        // Assert
        expect(glyph.getAttribute("aria-hidden")).toBe("true")
        expect(glyph.getAttribute("stroke")).toBe("currentColor")
        expect(glyph.getAttribute("viewBox")).toBe("0 0 20 20")
    })
})
