import { Page } from "@playwright/test"

const WINDOW_HEIGHT = 900
const FRAMES_TO_MEASURE_AND_RENDER = 3

export class CompactMetricsBarPageObject {
    constructor(private readonly page: Page) {}

    private bar() {
        return this.page.locator("cc-metrics-bar")
    }

    async resizeTo(width: number) {
        await this.page.setViewportSize({ width, height: WINDOW_HEIGHT })
        await this.page.evaluate(async frames => {
            for (let frame = 0; frame < frames; frame++) {
                await new Promise(resolve => requestAnimationFrame(resolve))
            }
        }, FRAMES_TO_MEASURE_AND_RENDER)
    }

    async isCompact() {
        return (await this.bar().getAttribute("data-compact")) === "true"
    }

    /** Narrows the window step by step from a width where the full bar shows and returns the first width where it turns compact. */
    async narrowestFullWindow(widestWindow: number, step: number) {
        for (let width = widestWindow; width > 0; width -= step) {
            await this.resizeTo(width)
            if (await this.isCompact()) {
                return width
            }
        }
        throw new Error("The bar never turned compact")
    }

    height() {
        return this.bar().evaluate(bar => bar.getBoundingClientRect().height)
    }

    /** How many parts of the bar animate right after a resize that switches its form. */
    async switchAnimationsWhenResizedTo(width: number) {
        await this.bar().evaluate(bar => {
            ;(window as WatchedWindow).barSwitchAnimations = new Promise<number>(resolve => {
                const observer = new MutationObserver(() => {
                    observer.disconnect()
                    requestAnimationFrame(() =>
                        resolve(bar.getAnimations({ subtree: true }).filter(animation => animation.id === "bar-switch").length)
                    )
                })
                observer.observe(bar, { attributes: true, attributeFilter: ["data-compact"] })
            })
        })
        await this.page.setViewportSize({ width, height: WINDOW_HEIGHT })
        return this.page.evaluate(() => (window as WatchedWindow).barSwitchAnimations)
    }
}

type WatchedWindow = Window & { barSwitchAnimations?: Promise<number> }
