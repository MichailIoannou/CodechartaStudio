import { Page } from "@playwright/test"

const FRAMES_TO_RESIZE_FIT_AND_RENDER = 4

export type NavBarFitStep = "natural" | "project shortened" | "project icon-only" | "status narrowed" | "status icon-only"

export class NavBarFitPageObject {
    constructor(private readonly page: Page) {}

    /** Resizes the window and waits until the fit has applied its step and the triggers have finished changing width. */
    async resizeTo(width: number) {
        await this.page.setViewportSize({ width, height: 800 })
        await this.page.evaluate(async framesToResizeFitAndRender => {
            const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve))
            for (let frame = 0; frame < framesToResizeFitAndRender; frame++) {
                await nextFrame()
            }
            const runningWidthChanges = () =>
                document
                    .querySelector(".navbar-start")
                    .getAnimations({ subtree: true })
                    .filter(animation => animation instanceof CSSTransition)
            for (let widthChanges = runningWidthChanges(); widthChanges.length > 0; widthChanges = runningWidthChanges()) {
                await Promise.allSettled(widthChanges.map(widthChange => widthChange.finished))
            }
        }, FRAMES_TO_RESIZE_FIT_AND_RENDER)
    }

    step(): Promise<NavBarFitStep> {
        return this.page.evaluate(() => {
            const label = document.querySelector<HTMLElement>("[data-testid='project-switcher-label']")
            const status = document.querySelector<HTMLElement>("[data-testid='workspace-status-trigger']")
            if (status.style.width === "3.25rem") {
                return "status icon-only"
            }
            if (status.style.width.endsWith("px")) {
                return "status narrowed"
            }
            if (label.classList.contains("sr-only")) {
                return "project icon-only"
            }
            return label.style.maxWidth ? "project shortened" : "natural"
        })
    }

    /** How far the triggers reach past the start of the view tabs; never more than 0. */
    overlapWithTheViewTabs(): Promise<number> {
        return this.page.evaluate(() => {
            const status = document.querySelector("[data-testid='workspace-status-trigger']").getBoundingClientRect()
            const tabs = document.querySelector("[data-testid='view-switcher']").getBoundingClientRect()
            return status.right - tabs.left
        })
    }

    logoSize() {
        return this.page.getByAltText("CodeCharta").evaluate(logo => {
            const { width, height } = logo.getBoundingClientRect()
            return { width, height }
        })
    }
}
