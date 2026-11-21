import { AxisWindow, fitWindowOf, panBothAxesTo, windowDraggedBy, windowHolding, windowKeepingInPlace, windowResizedTo } from "./axisWindow"
import { aBox } from "./dependencyGraphTestData"
import { Rectangle } from "./geometry"

const VIEWPORT = { width: 800, height: 600 }
const root = aBox("/root", { kind: "folder", isExpanded: true, depth: 0, isInLevelBand: false, width: 400, height: 200 })
const view = aBox("/root/view.ts", { x: 16, y: 44 })
const model = aBox("/root/model.ts", { x: 16, y: 120 })
const util = aBox("/root/util.ts", { x: 200, y: 120 })
const SHOWN: AxisWindow = { x: [100, 500], y: [100, 400] }

function rounded({ x, y }: AxisWindow): AxisWindow {
    return { x: [Math.round(x[0]), Math.round(x[1])], y: [Math.round(y[0]), Math.round(y[1])] }
}

describe("windowKeepingInPlace", () => {
    it("should move with the box, at the same scale", () => {
        // Arrange
        const before: Rectangle = { x: 200, y: 150, width: 160, height: 40 }
        const after: Rectangle = { x: 260, y: 180, width: 200, height: 120 }

        // Act
        const kept = windowKeepingInPlace(SHOWN, before, after, VIEWPORT)

        // Assert
        expect(rounded(kept)).toEqual({ x: [160, 560], y: [130, 430] })
    })

    it("should slide over a box that grew out of the window, leaving a margin", () => {
        // Arrange
        const before: Rectangle = { x: 300, y: 200, width: 160, height: 40 }
        const after: Rectangle = { x: 300, y: 200, width: 250, height: 250 }

        // Act
        const kept = windowKeepingInPlace(SHOWN, before, after, VIEWPORT)

        // Assert
        expect(rounded(kept)).toEqual({ x: [162, 562], y: [159, 459] })
    })

    it("should slide back to a box whose corner lay outside the window", () => {
        // Arrange
        const before: Rectangle = { x: 0, y: 0, width: 900, height: 700 }
        const after: Rectangle = { x: 0, y: 0, width: 160, height: 40 }

        // Act
        const kept = windowKeepingInPlace(SHOWN, before, after, VIEWPORT)

        // Assert
        expect(rounded(kept)).toEqual({ x: [-12, 388], y: [-9, 291] })
    })

    it("should fit a box too large for the window", () => {
        // Arrange
        const before: Rectangle = { x: 200, y: 150, width: 160, height: 40 }
        const after: Rectangle = { x: 200, y: 150, width: 2000, height: 900 }

        // Act
        const kept = windowKeepingInPlace(SHOWN, before, after, VIEWPORT)

        // Assert
        expect(kept).toEqual(fitWindowOf({ boxes: [aBox("/root", after)], bands: [], width: 0, height: 0 }, VIEWPORT))
    })
})

describe("the bottom of the viewport lying under a bar", () => {
    const UNDER_A_BAR = { ...VIEWPORT, coveredBottom: 100 }
    const pixelsFromTheTop = ({ y }: AxisWindow, layoutY: number) => ((layoutY - y[0]) / (y[1] - y[0])) * UNDER_A_BAR.height

    it("should fit the graph into the part above the bar, centred there", () => {
        // Arrange
        const root = aBox("/root", { x: 0, y: 0, width: 400, height: 1000 })
        const layout = { boxes: [root], bands: [], width: 400, height: 1000 }

        // Act
        const fitted = fitWindowOf(layout, UNDER_A_BAR)

        // Assert
        expect(pixelsFromTheTop(fitted, 0)).toBeCloseTo(15)
        expect(pixelsFromTheTop(fitted, 1000)).toBeCloseTo(485)
    })

    it("should bring a box into view that the shown window holds only under the bar", () => {
        // Arrange
        const shownAtOnePixelPerUnit: AxisWindow = { x: [0, 800], y: [0, 600] }
        const underTheBar = aBox("/root/low.ts", { x: 100, y: 540, width: 160, height: 40 })
        const layout = { boxes: [underTheBar], bands: [], width: 800, height: 600 }

        // Act
        const holding = windowHolding([underTheBar.path], layout, UNDER_A_BAR, shownAtOnePixelPerUnit)

        // Assert
        expect(holding).not.toBe(shownAtOnePixelPerUnit)
        expect(pixelsFromTheTop(holding, underTheBar.y + underTheBar.height)).toBeLessThan(500)
    })

    it("should slide a toggled box up from under the bar", () => {
        // Arrange
        const shownAtOnePixelPerUnit: AxisWindow = { x: [0, 800], y: [0, 600] }
        const before: Rectangle = { x: 100, y: 400, width: 160, height: 40 }
        const after: Rectangle = { x: 100, y: 400, width: 160, height: 150 }

        // Act
        const kept = windowKeepingInPlace(shownAtOnePixelPerUnit, before, after, UNDER_A_BAR)

        // Assert
        expect(rounded(kept)).toEqual({ x: [0, 800], y: [65, 665] })
    })
})

describe("windowDraggedBy", () => {
    const viewport = { width: 800, height: 600 }
    const shownAtHalfAPixelPerUnit: AxisWindow = { x: [0, 1600], y: [0, 1200] }
    const reach: AxisWindow = { x: [-1000, 3000], y: [-1000, 3000] }

    it("should move the window against the drag by as many layout units as the pixels dragged stand for", () => {
        // Arrange
        const draggedRightAndUp: [number, number] = [100, -50]

        // Act
        const dragged = windowDraggedBy({ shownWindow: shownAtHalfAPixelPerUnit, reach, viewport }, draggedRightAndUp)

        // Assert
        expect(dragged).toEqual({ x: [-200, 1400], y: [100, 1300] })
    })

    it("should stop at the reach of the axes and keep its scale", () => {
        // Arrange
        const draggedFarRightAndUp: [number, number] = [5000, -5000]

        // Act
        const dragged = windowDraggedBy({ shownWindow: shownAtHalfAPixelPerUnit, reach, viewport }, draggedFarRightAndUp)

        // Assert
        expect(dragged).toEqual({ x: [-1000, 600], y: [1800, 3000] })
    })
})

describe("panBothAxesTo", () => {
    it("should ask the zoom of each axis to show its part of the window", () => {
        // Arrange
        const shownWindow: AxisWindow = { x: [10, 20], y: [30, 40] }

        // Act
        const action = panBothAxesTo(shownWindow)

        // Assert
        expect(action).toEqual({
            type: "dataZoom",
            batch: [
                { dataZoomIndex: 0, startValue: 10, endValue: 20 },
                { dataZoomIndex: 1, startValue: 30, endValue: 40 }
            ]
        })
    })
})

describe("windowHolding", () => {
    const layout = { boxes: [root, view, model, util], bands: [], width: 400, height: 200 }
    const viewport = { width: 800, height: 400 }

    it("should keep the window shown when it holds the boxes asked for already", () => {
        // Arrange
        const shownWindow: AxisWindow = { x: [0, 400], y: [0, 200] }

        // Act
        const window = windowHolding([view.path, model.path], layout, viewport, shownWindow)

        // Assert
        expect(window).toBe(shownWindow)
    })

    it("should centre on the boxes asked for when one of them lies outside the window shown, no larger than one and a half times their size", () => {
        // Arrange
        const lookingElsewhere: AxisWindow = { x: [1000, 1400], y: [1000, 1200] }

        // Act
        const window = windowHolding([view.path], layout, viewport, lookingElsewhere)

        // Assert
        const centre = [(window.x[0] + window.x[1]) / 2, (window.y[0] + window.y[1]) / 2]
        expect(centre).toEqual([view.x + view.width / 2, view.y + view.height / 2])
        expect(800 / (window.x[1] - window.x[0])).toBeCloseTo(1.5)
    })

    it("should zoom out as far as it takes to hold boxes lying far apart, with room around them", () => {
        // Arrange
        const far = aBox("/root/far.ts", { x: 3000, y: 44 })
        const wide = { ...layout, boxes: [...layout.boxes, far] }

        // Act
        const window = windowHolding([view.path, far.path], wide, viewport, null)

        // Assert
        expect(window.x[0]).toBeLessThan(view.x)
        expect(window.x[1]).toBeGreaterThan(far.x + far.width)
        expect((far.x + far.width - view.x) / (window.x[1] - window.x[0])).toBeCloseTo(0.8)
    })

    it("should have no window for boxes that are not on screen", () => {
        // Arrange
        const pathsWithoutABox = ["/root/hidden.ts"]

        // Act
        const window = windowHolding(pathsWithoutABox, layout, viewport, null)

        // Assert
        expect(window).toBeNull()
    })
})

describe("fitWindowOf", () => {
    it("should fit the root as drawn, grown by dragged boxes, with equal scale on both axes", () => {
        // Arrange
        const grownRoot = aBox("/root", { kind: "folder", isExpanded: true, depth: 0, x: -100, y: -50, width: 500, height: 250 })
        const layout = { boxes: [grownRoot], bands: [], width: 400, height: 200 }

        // Act
        const window = fitWindowOf(layout, { width: 1000, height: 500 })

        // Assert
        expect((window.x[0] + window.x[1]) / 2).toBe(150)
        expect((window.y[0] + window.y[1]) / 2).toBe(75)
        expect((window.x[1] - window.x[0]) / 1000).toBeCloseTo((window.y[1] - window.y[0]) / 500)
        expect(window.x[1] - window.x[0]).toBeGreaterThan(500)
    })

    it("should fit the root without a scale while the chart has no size yet", () => {
        // Arrange
        const layout = { boxes: [root], bands: [], width: 400, height: 200 }

        // Act
        const window = fitWindowOf(layout, { width: 0, height: 0 })

        // Assert
        expect(window).toEqual({ x: [0, 400], y: [0, 200] })
    })

    it("should fit an empty graph without a size to finite numbers", () => {
        // Arrange
        const emptyLayout = { boxes: [], bands: [], width: 0, height: 0 }

        // Act
        const window = fitWindowOf(emptyLayout, { width: 0, height: 0 })

        // Assert
        expect([...window.x, ...window.y].every(Number.isFinite)).toBe(true)
    })
})

describe("windowResizedTo", () => {
    it("should keep the window's centre and its pixels per unit on both axes when the chart is resized", () => {
        // Arrange
        const windowFittedAtWideSize: AxisWindow = { x: [0, 1276], y: [0, 638] }

        // Act
        const window = windowResizedTo(windowFittedAtWideSize, { width: 1600, height: 800 }, { width: 800, height: 800 })

        // Assert
        expect(window).toEqual({ x: [319, 957], y: [0, 638] })
        expect(800 / (window.x[1] - window.x[0])).toBeCloseTo(1600 / 1276)
        expect(800 / (window.y[1] - window.y[0])).toBeCloseTo(1600 / 1276)
    })
})
