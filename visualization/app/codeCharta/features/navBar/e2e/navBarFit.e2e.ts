import { readFileSync } from "node:fs"
import { join } from "node:path"
import { gzipSync } from "node:zlib"
import { expect, test } from "@playwright/test"
import { goto, standInForTheDesktopBridge } from "../../../../playwright.helper"
import { aFolder, aGitStatus, aProject, aSnapshot } from "../../projects/projects.mocks"
import { NavBarFitPageObject, NavBarFitStep } from "./navBarFit.po"

const ASSETS = join(__dirname, "..", "..", "..", "assets")
const SAMPLE1 = [...gzipSync(readFileSync(join(ASSETS, "sample1.cc.json")))]
const STUDIO = aProject("p-studio", [aFolder("f-studio", { label: "codechartastudio" })], { name: "CodeChartaStudio" })
const SEED = {
    projects: [STUDIO],
    activeProjectId: "p-studio",
    snapshots: [aSnapshot("p-studio", "f-studio", "s-studio", { shortCommit: "ad536f6" })],
    snapshotMaps: { "s-studio": SAMPLE1 },
    gitStatuses: {
        "f-studio": aGitStatus("docs/studio-plans", {
            upstream: {
                refName: "refs/remotes/origin/docs/studio-plans",
                name: "origin/docs/studio-plans",
                ahead: 5,
                behind: 0,
                isGone: false
            }
        })
    }
}
const STEPS_IN_ORDER: NavBarFitStep[] = ["natural", "project shortened", "project icon-only", "status narrowed", "status icon-only"]
const WIDEST_WINDOW = 1600
const NARROWEST_WINDOW = 760
const WINDOW_STEP = 16
const SUBPIXEL_ROUNDING = 0.5

test.describe("Nav bar fit", () => {
    test("should give way one step at a time as the window narrows, never reaching under the view tabs", async ({ page }) => {
        // Arrange
        const navBar = new NavBarFitPageObject(page)
        await standInForTheDesktopBridge(page, SEED)
        await page.setViewportSize({ width: WIDEST_WINDOW, height: 800 })
        await goto(page)
        await expect(page.getByTestId("workspace-status-branch")).toHaveText("docs/studio-plans")
        const logoAtFullWidth = await navBar.logoSize()
        const seenSteps: NavBarFitStep[] = []
        let widestOverlap = Number.NEGATIVE_INFINITY

        // Act
        for (let width = WIDEST_WINDOW; width >= NARROWEST_WINDOW; width -= WINDOW_STEP) {
            await navBar.resizeTo(width)
            const step = await navBar.step()
            if (seenSteps.at(-1) !== step) {
                seenSteps.push(step)
            }
            widestOverlap = Math.max(widestOverlap, await navBar.overlapWithTheViewTabs())
        }

        // Assert
        expect(seenSteps).toEqual(STEPS_IN_ORDER)
        expect(widestOverlap).toBeLessThanOrEqual(SUBPIXEL_ROUNDING)
        expect(await navBar.logoSize()).toEqual(logoAtFullWidth)
        expect(logoAtFullWidth).toEqual({ width: 44, height: 32 })
    })

    test("should show the folder only and keep the commit out of the workspace status", async ({ page }) => {
        // Arrange
        await standInForTheDesktopBridge(page, SEED)
        await page.setViewportSize({ width: WIDEST_WINDOW, height: 800 })

        // Act
        await goto(page)

        // Assert
        await expect(page.getByTestId("project-switcher-label")).toHaveText("codechartastudio")
        await expect(page.getByTestId("workspace-status-trigger")).not.toContainText("ad536f6")
        await expect(page.getByTestId("workspace-status-trigger")).toHaveAttribute("title", /Map shows ad536f6/)
        await expect(page.getByTestId("workspace-status-counts")).toHaveText("5")
    })
})
