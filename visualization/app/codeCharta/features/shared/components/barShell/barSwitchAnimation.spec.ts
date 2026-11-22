import { prepareBarSwitch } from "./barSwitchAnimation"

interface RecordedAnimation {
    element: HTMLElement
    keyframes: Keyframe[]
    options: KeyframeAnimationOptions
    animation: { id: string; finish: jest.Mock; onfinish: (() => void) | null }
}

describe("prepareBarSwitch", () => {
    let animations: RecordedAnimation[]
    let prefersReducedMotion: boolean
    let rects: Map<HTMLElement, Partial<DOMRect>>

    beforeEach(() => {
        animations = []
        prefersReducedMotion = false
        rects = new Map()
        HTMLElement.prototype.animate = function (this: HTMLElement, keyframes: Keyframe[], options: KeyframeAnimationOptions) {
            const animation = { id: String(options.id), finish: jest.fn(), onfinish: null }
            animations.push({ element: this, keyframes, options, animation })
            return animation as unknown as Animation
        } as typeof HTMLElement.prototype.animate
        HTMLElement.prototype.getAnimations = () => animations.map(recorded => recorded.animation) as unknown as Animation[]
        globalThis.matchMedia = jest.fn(() => ({ matches: prefersReducedMotion })) as unknown as typeof matchMedia
        jest.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
            return { left: 0, top: 0, width: 0, height: 0, ...rects.get(this) } as DOMRect
        })
        jest.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(() => [{}] as unknown as DOMRectList)
    })

    afterEach(() => {
        jest.restoreAllMocks()
        delete (HTMLElement.prototype as Partial<HTMLElement>).animate
        delete (HTMLElement.prototype as Partial<HTMLElement>).getAnimations
        delete (globalThis as { matchMedia?: unknown }).matchMedia
        document.body.replaceChildren()
    })

    function aBar() {
        const bar = document.createElement("div")
        bar.innerHTML = `
            <div data-cell><span data-bar-icon="area" id="area-icon" data-testid="area"></span><span data-bar-text>Area</span>
                <div popover id="area-settings"></div></div>
            <cc-bar-tools-cell><button class="btn">tool</button></cc-bar-tools-cell>
            <div data-testid="probe" style="position: fixed"></div>`
        document.body.appendChild(bar)
        return bar
    }

    function moveTo(element: Element, left: number, width = 20) {
        rects.set(element as HTMLElement, { left, top: 10, width, height: 20 })
    }

    it("should switch instantly with reduced motion", () => {
        // Arrange
        prefersReducedMotion = true

        // Act
        const playSwitch = prepareBarSwitch(aBar())

        // Assert
        expect(playSwitch).toBeNull()
    })

    it("should switch instantly where elements cannot animate", () => {
        // Arrange
        delete (HTMLElement.prototype as Partial<HTMLElement>).animate

        // Act
        const playSwitch = prepareBarSwitch(aBar())

        // Assert
        expect(playSwitch).toBeNull()
    })

    it("should fade out a copy of the old form that cannot be found, used or anchored to", () => {
        // Arrange
        const bar = aBar()
        const playSwitch = prepareBarSwitch(bar)

        // Act
        playSwitch?.()

        // Assert
        const ghost = bar.querySelector<HTMLElement>("[data-bar-ghost]")
        expect(ghost.inert).toBe(true)
        expect(ghost.querySelector("[popover], [id], [data-testid]")).toBeNull()
        expect(ghost.querySelector<HTMLElement>("[data-bar-icon]").style.visibility).toBe("hidden")
        const fade = animations.find(recorded => recorded.element === ghost)
        expect(fade.options.duration).toBe(85)
        fade.animation.onfinish()
        expect(bar.querySelector("[data-bar-ghost]")).toBeNull()
    })

    it("should animate the bar's width from the old to the new one and give the overflow back when done", () => {
        // Arrange
        const bar = aBar()
        moveTo(bar, 0, 700)
        const playSwitch = prepareBarSwitch(bar)
        moveTo(bar, 0, 235)

        // Act
        playSwitch?.()

        // Assert
        const shell = animations.find(recorded => recorded.element === bar)
        expect(shell.keyframes).toEqual([{ width: "700px" }, { width: "235px" }])
        expect(shell.options).toMatchObject({ duration: 240, easing: "cubic-bezier(.2,.8,.2,1)" })
        expect(bar.style.overflow).toBe("clip")
        shell.animation.onfinish()
        expect(bar.style.overflow).toBe("")
    })

    it("should move every icon from its old place to its new one and fade the new text in late", () => {
        // Arrange
        const bar = aBar()
        const icon = bar.querySelector("[data-bar-icon]")
        const tool = bar.querySelector(".btn")
        moveTo(icon, 100)
        moveTo(tool, 600)
        const playSwitch = prepareBarSwitch(bar)
        moveTo(icon, 40)
        moveTo(tool, 200)

        // Act
        playSwitch?.()

        // Assert
        const moveOf = (element: Element) => animations.find(recorded => recorded.element === element)?.keyframes
        expect(moveOf(icon)).toEqual([{ transform: "translate(60px, 0px)" }, { transform: "none" }])
        expect(moveOf(tool)).toEqual([{ transform: "translate(400px, 0px)" }, { transform: "none" }])
        expect(moveOf(bar.querySelector("[data-cell] [data-bar-text]"))).toEqual([
            { opacity: 0 },
            { opacity: 0, offset: 0.4 },
            { opacity: 1 }
        ])
    })

    it("should finish a running switch before it starts the next one", () => {
        // Arrange
        const bar = aBar()
        prepareBarSwitch(bar)?.()
        const running = animations.map(recorded => recorded.animation)

        // Act
        prepareBarSwitch(bar)

        // Assert
        expect(running.every(animation => animation.finish.mock.calls.length === 1)).toBe(true)
        expect(bar.querySelector("[data-bar-ghost]")).toBeNull()
    })
})
