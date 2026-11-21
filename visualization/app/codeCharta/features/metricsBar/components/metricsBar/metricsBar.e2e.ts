import { expect, type Locator, test } from "@playwright/test"
import { clearIndexedDB, collapseExplorer, goto, readPersistedLayoutAlgorithm } from "../../../../../playwright.helper"
import sample1 from "../../../../assets/sample1.cc.json"
import sample2 from "../../../../assets/sample2.cc.json"
import { NavBarFolderButtonPageObject } from "../../../navBar/components/navBarFolderButton/navBarFolderButton.po"
import { MetricsBarPageObject } from "./metricsBar.po"

test.describe("MetricsBar", () => {
    test.beforeEach(async ({ page }) => {
        await goto(page)
        const uploadFilesButton = new NavBarFolderButtonPageObject(page)
        await uploadFilesButton.openFiles(["./app/codeCharta/resources/sample1_with_different_edges.cc.json"])
    })

    test.afterEach(async ({ page }) => {
        await clearIndexedDB(page)
    })

    test("should open the area metric select dropdown and list the available metrics", async ({ page }) => {
        const metricsBar = new MetricsBarPageObject(page)

        await metricsBar.openAreaMetricSelect()

        const options = await metricsBar.getAreaMetricOptionNames()
        expect(options.length).toBeGreaterThan(1)
        expect(options).toContain("rloc")
    })

    test("should filter the metric options when typing in the search box", async ({ page }) => {
        const metricsBar = new MetricsBarPageObject(page)

        await metricsBar.openAreaMetricSelect()
        await metricsBar.searchAreaMetric("functions")

        await expect
            .poll(async () => {
                const options = await metricsBar.getAreaMetricOptionNames()
                return options.length > 0 && options.every(option => option.toLowerCase().includes("functions"))
            })
            .toBe(true)
    })

    test("should update the area segment when selecting a different metric", async ({ page }) => {
        const metricsBar = new MetricsBarPageObject(page)

        await metricsBar.openAreaMetricSelect()
        const currentMetric = await metricsBar.getSelectedAreaMetricName()

        const options = await metricsBar.getAreaMetricOptionNames()
        const otherMetric = options.find(option => option !== currentMetric)
        expect(otherMetric).toBeDefined()

        await metricsBar.selectAreaMetricOption(otherMetric as string)

        await expect(metricsBar.selectedAreaMetricName()).toHaveText(otherMetric as string)
    })
})

test.describe("MetricsBar layout cell", () => {
    test.beforeEach(async ({ page }) => {
        await goto(page)
    })

    test.afterEach(async ({ page }) => {
        await clearIndexedDB(page)
    })

    test("should open the layout picker from the keyboard as well", async ({ page }) => {
        // Arrange
        const metricsBar = new MetricsBarPageObject(page)
        await metricsBar.layoutCell().focus()

        // Act
        await page.keyboard.press("Enter")

        // Assert
        await expect(page.getByTestId("metrics-bar-layout-picker")).toBeVisible()
    })

    test("should switch the map layout and name it on the cell", async ({ page }) => {
        // Arrange
        const metricsBar = new MetricsBarPageObject(page)
        await metricsBar.openLayoutPicker()

        // Act
        await metricsBar.pickLayout("StreetMap")

        // Assert
        await expect(metricsBar.layoutCell()).toContainText("StreetMap")
        await expect(page.locator("[data-testid='metrics-bar-layout-picker'] button[data-layout='StreetMap']")).toHaveAttribute(
            "aria-pressed",
            "true"
        )
    })

    test("should offer the file limit only while TreeMapStreet is picked", async ({ page }) => {
        // Arrange
        const metricsBar = new MetricsBarPageObject(page)
        await metricsBar.openLayoutPicker()
        await expect(metricsBar.maxTreeMapFilesInput()).toHaveCount(0)

        // Act
        await metricsBar.pickLayout("TreeMapStreet")

        // Assert
        await expect(metricsBar.maxTreeMapFilesInput()).toBeVisible()
        await expect(metricsBar.maxTreeMapFilesInput()).toHaveValue("100")
    })

    test("should offer the level count only while a radial layout is picked", async ({ page }) => {
        // Arrange
        const metricsBar = new MetricsBarPageObject(page)
        await metricsBar.openLayoutPicker()
        await expect(metricsBar.radialLevelsInput()).toHaveCount(0)

        // Act
        await metricsBar.pickLayout("Sunburst")

        // Assert
        await expect(metricsBar.radialLevelsInput()).toBeVisible()
        await expect(metricsBar.radialLevelsInput()).toHaveValue("3")
    })

    test("should show the map's total under the area metric after a reload in a radial layout", async ({ page }) => {
        // Arrange
        const metricsBar = new MetricsBarPageObject(page)
        await metricsBar.switchLayoutTo("Sunburst")
        await expect.poll(() => readPersistedLayoutAlgorithm(page), { timeout: 60_000 }).toBe("Sunburst")

        // Act
        await page.reload()
        await page.locator("#loading-gif-file").waitFor({ state: "hidden", timeout: 60_000 })

        // Assert
        const areaMetric = await metricsBar.getSelectedAreaMetricName()
        const bootMapTotal = sumOfMetric(sample1, areaMetric) + sumOfMetric(sample2, areaMetric)
        await expect(metricsBar.areaMetricSummary()).toContainText(bootMapTotal.toLocaleString("en-US"))
    })

    test("should sit inside the bar, with nothing sticking out of it", async ({ page }) => {
        // Arrange
        const metricsBar = new MetricsBarPageObject(page)
        const bar = await boundingBoxOf(page.locator("cc-metrics-bar"))

        // Act
        const cells = await Promise.all([metricsBar.layoutCell(), metricsBar.viewTools()].map(boundingBoxOf))

        // Assert
        for (const cell of cells) {
            expect(isInside(cell, bar)).toBe(true)
        }
    })
})

test.describe("MetricsBar legend tool", () => {
    test.beforeEach(async ({ page }) => {
        await goto(page)
    })

    test.afterEach(async ({ page }) => {
        await clearIndexedDB(page)
    })

    test("should open the legend from the bar and close it again", async ({ page }) => {
        // Arrange
        const metricsBar = new MetricsBarPageObject(page)
        await metricsBar.legendTool().click()
        await expect(page.getByTestId("legend-panel")).toBeVisible()

        // Act
        await metricsBar.legendTool().click()

        // Assert
        await expect(page.getByTestId("legend-panel")).toHaveCount(0)
        await expect(metricsBar.legendTool()).toHaveAttribute("aria-expanded", "false")
    })
})

test.describe("MetricsBar beside the explorer", () => {
    test.beforeEach(async ({ page }) => {
        await goto(page)
    })

    test.afterEach(async ({ page }) => {
        await clearIndexedDB(page)
    })

    test("should centre in the space beside the open explorer, and on the window once it is collapsed", async ({ page }) => {
        // Arrange
        const explorer = page.locator("cc-sidebar-explorer")
        const bar = page.locator("cc-metrics-bar")
        const viewportWidth = page.viewportSize().width
        const explorerRight = await boundingBoxOf(explorer).then(box => box.x + box.width)
        await expect
            .poll(async () => centreOf(await boundingBoxOf(bar)), { timeout: 5000 })
            .toBeCloseTo((explorerRight + viewportWidth) / 2, -1)
        expect(overlaps(await boundingBoxOf(explorer), await boundingBoxOf(bar))).toBe(false)

        // Act
        await collapseExplorer(page)

        // Assert
        await expect.poll(async () => centreOf(await boundingBoxOf(bar)), { timeout: 5000 }).toBeCloseTo(viewportWidth / 2, -1)
    })

    test("should be clickable from its first cell with the explorer open", async ({ page }) => {
        // Arrange
        const metricsBar = new MetricsBarPageObject(page)

        // Act
        await metricsBar.openLayoutPicker()

        // Assert
        await expect(page.getByTestId("metrics-bar-layout-picker")).toBeVisible()
    })
})

type Box = { x: number; y: number; width: number; height: number }

async function boundingBoxOf(locator: Locator): Promise<Box> {
    const box = await locator.boundingBox()
    if (!box) {
        throw new Error("The element has not been laid out")
    }
    return box
}

function centreOf(box: Box) {
    return box.x + box.width / 2
}

function isInside(inner: Box, outer: Box) {
    const isInsideHorizontally = inner.x >= outer.x && inner.x + inner.width <= outer.x + outer.width
    const isInsideVertically = inner.y >= outer.y && inner.y + inner.height <= outer.y + outer.height
    return isInsideHorizontally && isInsideVertically
}

function overlaps(first: Box, second: Box) {
    const overlapsHorizontally = first.x < second.x + second.width && second.x < first.x + first.width
    const overlapsVertically = first.y < second.y + second.height && second.y < first.y + first.height
    return overlapsHorizontally && overlapsVertically
}

function sumOfMetric(ccJson: { lenses: { metrics: { attributes: Record<string, Record<string, number>> } } }, metric: string) {
    return Object.values(ccJson.lenses.metrics.attributes).reduce((total, attributes) => total + (attributes[metric] ?? 0), 0)
}
