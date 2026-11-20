import { ComponentFixture, TestBed } from "@angular/core/testing"
import type { PathsInfo } from "../../../../model/coreApi/PathsInfo"
import type { ToolsReport } from "../../../../model/coreApi/ToolsReport"
import type { CoreResult } from "../../../../util/desktop/desktopBridge"
import { createFakeDesktopBridge, FakeDesktopBridge, FakeDesktopSeed } from "../../../../util/desktop/desktopBridge.mocks"
import { DESKTOP_BRIDGE } from "../../../../util/desktop/desktopBridge.token"
import { ToastService } from "../../../shared/facade"
import { aToolsReport, PATHS } from "../../desktopTools.mocks"
import { DesktopToolsPanelComponent } from "./desktopToolsPanel.component"

describe("DesktopToolsPanelComponent", () => {
    let bridge: FakeDesktopBridge
    let fixture: ComponentFixture<DesktopToolsPanelComponent>

    async function renderPanel(seed: FakeDesktopSeed = {}, prepare: (fake: FakeDesktopBridge) => void = () => {}) {
        bridge = createFakeDesktopBridge({ responses: { "tools.doctor": aToolsReport(), "paths.get": PATHS }, ...seed })
        prepare(bridge)
        TestBed.configureTestingModule({
            imports: [DesktopToolsPanelComponent],
            providers: [
                { provide: DESKTOP_BRIDGE, useValue: bridge },
                { provide: ToastService, useValue: { show: jest.fn() } }
            ]
        })
        fixture = TestBed.createComponent(DesktopToolsPanelComponent)
        await settle()
    }

    async function settle() {
        fixture.detectChanges()
        await fixture.whenStable()
        await new Promise(resolve => setTimeout(resolve))
        fixture.detectChanges()
    }

    function element(): HTMLElement {
        return fixture.nativeElement
    }

    function row(tool: string): HTMLElement {
        return element().querySelector(`[data-testid="desktop-tool-${tool}"]`)
    }

    function textOf(selector: string, scope: HTMLElement = element()) {
        return scope.querySelector(selector)?.textContent.trim()
    }

    function buttonNamed(label: string, scope: HTMLElement = element()): HTMLButtonElement | undefined {
        return [...scope.querySelectorAll("button")].find(button => button.textContent.trim() === label)
    }

    it("should list every tool with its version", async () => {
        // Act
        await renderPanel()

        // Assert
        const names = [...element().querySelectorAll("[data-testid='desktop-tool-name']")].map(name => name.textContent.trim())
        const versions = [...element().querySelectorAll("[data-testid='desktop-tool-version']")].map(version => version.textContent.trim())
        expect(names).toEqual(["Git", "ccsh", "Java", "GitHub CLI", "GitLab CLI"])
        expect(versions).toEqual(["2.47.1", "2.4.0", "21.0.2", "2.62.0", "—"])
        expect(element().querySelector("[data-testid='desktop-tool-path']").getAttribute("title")).toBe("/usr/bin/git")
    })

    it("should mark a missing required tool as an error", async () => {
        // Act
        await renderPanel({
            responses: { "tools.doctor": aToolsReport({ git: { state: "missing", path: null, version: null } }), "paths.get": PATHS }
        })

        // Assert
        const badge = row("git").querySelector("[data-testid='desktop-tool-state']")
        expect(badge.textContent.trim()).toBe("missing")
        expect(badge.classList).toContain("badge-error")
        expect(textOf("[data-testid='desktop-tool-purpose']", row("git"))).toBe(
            "history, branches, analyses of commits — not found on PATH or in the usual folders. Install it, or choose the executable."
        )
        expect(textOf("[data-testid='desktop-tools-summary']")).toBe("Git history and analyses need Git and Java.")
    })

    it("should mark a missing optional tool as not installed", async () => {
        // Act
        await renderPanel()

        // Assert
        const badge = row("glab").querySelector("[data-testid='desktop-tool-state']")
        expect(badge.textContent.trim()).toBe("not installed")
        expect(badge.classList).toContain("badge-ghost")
    })

    it("should offer the default only for a custom path", async () => {
        // Arrange
        await renderPanel({ responses: { "tools.doctor": aToolsReport(), "paths.get": PATHS, "tools.clearPath": aToolsReport() } })

        // Act
        buttonNamed("Use default", row("ccsh")).click()
        await settle()

        // Assert
        expect(buttonNamed("Use default", row("git"))).toBeUndefined()
        expect(textOf("[data-testid='desktop-tool-custom']", row("ccsh"))).toBe("custom")
        expect(bridge.calls.some(call => call.name === "request" && call.args[0] === "tools.clearPath")).toBe(true)
    })

    it("should open the picker for a tool", async () => {
        // Arrange
        await renderPanel()

        // Act
        buttonNamed("Choose…", row("java")).click()
        await settle()

        // Assert
        expect(bridge.calls.find(call => call.name === "chooseToolExecutable")?.args[0]).toBe("java")
    })

    it("should reveal the data folder", async () => {
        // Arrange
        await renderPanel()

        // Act
        buttonNamed("Show").click()
        await settle()

        // Assert
        expect(textOf("[data-testid='desktop-tools-data-folder']")).toBe(PATHS.dataDir)
        expect(bridge.calls.find(call => call.name === "reveal")?.args).toEqual([{ kind: "dataFolder" }])
    })

    it("should show the store folder and reveal it", async () => {
        // Arrange
        await renderPanel()
        const storeRow = element().querySelector<HTMLElement>("[data-testid='desktop-tools-store-change']").parentElement

        // Act
        buttonNamed("Show", storeRow).click()
        await settle()

        // Assert
        expect(textOf("[data-testid='desktop-tools-store-folder']")).toBe(PATHS.storeRoot)
        expect(bridge.calls.find(call => call.name === "reveal")?.args).toEqual([{ kind: "storeRoot" }])
    })

    it("should call chooseRoot and show no change when the choice is cancelled", async () => {
        // Arrange
        await renderPanel()

        // Act
        buttonNamed("Change…").click()
        await settle()

        // Assert
        expect(bridge.calls.filter(call => call.name === "chooseStoreRoot")).toHaveLength(1)
        expect(textOf("[data-testid='desktop-tools-store-folder']")).toBe(PATHS.storeRoot)
    })

    it("should offer Use default only for a custom root", async () => {
        // Arrange
        const custom = { ...PATHS, storeRoot: "/elsewhere/store", isDefaultStoreRoot: false }
        await renderPanel({ responses: { "tools.doctor": aToolsReport(), "paths.get": custom, "paths.resetStoreRoot": PATHS } })
        const offeredForCustom = element().querySelector("[data-testid='desktop-tools-store-default']") !== null

        // Act
        element().querySelector<HTMLButtonElement>("[data-testid='desktop-tools-store-default']").click()
        await settle()

        // Assert
        expect(offeredForCustom).toBe(true)
        expect(textOf("[data-testid='desktop-tools-store-folder']")).toBe(PATHS.storeRoot)
        expect(element().querySelector("[data-testid='desktop-tools-store-default']")).toBeNull()
    })

    it("should show that the store is being copied and then the new folder", async () => {
        // Arrange
        const chosen = { ...PATHS, storeRoot: "/elsewhere/store", isDefaultStoreRoot: false }
        let finishCopy: (value: CoreResult<PathsInfo | null>) => void = () => {}
        await renderPanel({}, fake => {
            fake.chooseStoreRoot = () => new Promise(resolve => (finishCopy = resolve))
        })

        // Act
        buttonNamed("Change…").click()
        await settle()
        const whileCopying = textOf("[data-testid='desktop-tools-store-copying']")
        const checkAgainDisabled = buttonNamed("Check again").disabled
        finishCopy({ ok: true, value: chosen })
        await settle()

        // Assert
        expect(whileCopying).toBe("Copying the store…")
        expect(checkAgainDisabled).toBe(true)
        expect(element().querySelector("[data-testid='desktop-tools-store-copying']")).toBeNull()
        expect(textOf("[data-testid='desktop-tools-store-folder']")).toBe("/elsewhere/store")
    })

    it("should offer a core restart when the core is unavailable", async () => {
        // Arrange
        await renderPanel({ coreState: { state: "unavailable", message: "gave up" } })

        // Act
        buttonNamed("Restart core").click()
        await settle()

        // Assert
        expect(textOf("[data-testid='desktop-tools-core']")).toContain("The CodeCharta core is not running.")
        expect(element().querySelector("[data-testid='desktop-tool-git']")).toBeNull()
        expect(bridge.calls.some(call => call.name === "restartCore")).toBe(true)
    })

    it("should show a spinner while the core starts", async () => {
        // Act
        await renderPanel({ coreState: { state: "starting", message: null } })

        // Assert
        expect(textOf("[data-testid='desktop-tools-core']")).toBe("Starting the CodeCharta core…")
        expect(element().querySelector("[data-testid='desktop-tools-core'] .loading-spinner")).not.toBeNull()
        expect(buttonNamed("Restart core")).toBeUndefined()
    })

    it("should show placeholder rows until the first report arrives", async () => {
        // Act
        await renderPanel({}, fake => jest.spyOn(fake, "request").mockReturnValue(new Promise(() => {})))

        // Assert
        expect(element().querySelectorAll(".skeleton")).toHaveLength(5)
        expect(element().querySelector("[data-testid='desktop-tool-git']")).toBeNull()
    })

    it("should say why the tools could not be checked", async () => {
        // Act
        await renderPanel({ failures: { "tools.doctor": { code: "INTERNAL", message: "the check broke", details: {} } } })

        // Assert
        expect(textOf("[data-testid='desktop-tools-failure'] span")).toBe("The tools could not be checked: the check broke")
    })

    it("should show the progress of a new check and keep the old rows", async () => {
        // Arrange
        await renderPanel()

        // Act
        buttonNamed("Check again").click()
        fixture.detectChanges()
        const operationId = (
            bridge.calls.filter(call => call.name === "request" && call.args[0] === "tools.doctor")[1].args[2] as {
                operationId: string
            }
        ).operationId
        const textBeforeProgress = textOf("[data-testid='desktop-tools-summary']")
        bridge.emit("core.progress", { requestId: operationId, message: "", done: 3, total: 5 })
        fixture.detectChanges()

        // Assert
        expect(textBeforeProgress).toBe("Checking…")
        expect(textOf("[data-testid='desktop-tools-summary']")).toBe("Checking 3 of 5…")
        expect(buttonNamed("Check again").disabled).toBe(true)
        expect(element().querySelector(".fa-rotate.fa-spin")).not.toBeNull()
        expect(row("git")).not.toBeNull()
    })

    it("should offer to try again after a failed check", async () => {
        // Arrange
        await renderPanel({ failures: { "tools.doctor": { code: "INTERNAL", message: "the check broke", details: {} } } })
        bridge.respondWith("tools.doctor", aToolsReport())

        // Act
        buttonNamed("Try again").click()
        await settle()

        // Assert
        expect(element().querySelector("[data-testid='desktop-tools-failure']")).toBeNull()
        expect(row("git")).not.toBeNull()
    })

    describe("revealed from an Open desktop tools link", () => {
        const scrollIntoView = jest.fn()

        beforeEach(() => {
            scrollIntoView.mockClear()
            Element.prototype.scrollIntoView = scrollIntoView
        })

        afterEach(() => {
            delete (Element.prototype as Partial<Element>).scrollIntoView
        })

        function chooseButtonOf(tool: string) {
            return buttonNamed("Choose…", row(tool))
        }

        it("should scroll the section into view at once and focus the failing tool's Choose button", async () => {
            // Arrange
            await renderPanel()

            // Act
            fixture.componentInstance.reveal("java")
            await settle()

            // Assert
            expect(scrollIntoView).toHaveBeenCalledWith({ block: "start" })
            expect(scrollIntoView.mock.contexts[0]).toBe(element().querySelector("section"))
            expect(document.activeElement).toBe(chooseButtonOf("java"))
        })

        it("should focus Check again when no tool failed", async () => {
            // Arrange
            await renderPanel()

            // Act
            fixture.componentInstance.reveal()
            await settle()

            // Assert
            expect(document.activeElement).toBe(buttonNamed("Check again"))
        })

        it("should focus the tool's Choose button once the report arrives", async () => {
            // Arrange
            let answerDoctor: (result: CoreResult<ToolsReport>) => void = () => {}
            await renderPanel({}, fake => {
                const request = fake.request.bind(fake)
                jest.spyOn(fake, "request").mockImplementation((method, ...rest) =>
                    method === "tools.doctor"
                        ? new Promise(resolve => (answerDoctor = resolve as typeof answerDoctor))
                        : request(method, ...rest)
                )
            })
            fixture.componentInstance.reveal("git")
            await settle()
            const focusedBeforeReport = document.activeElement

            // Act
            answerDoctor({ ok: true, value: aToolsReport() })
            await settle()

            // Assert
            expect(focusedBeforeReport).not.toBe(chooseButtonOf("git"))
            expect(document.activeElement).toBe(chooseButtonOf("git"))
        })

        it("should focus only once, not on every later check", async () => {
            // Arrange
            await renderPanel()
            fixture.componentInstance.reveal("java")
            await settle()
            buttonNamed("Check again").focus()

            // Act
            buttonNamed("Check again").click()
            await settle()

            // Assert
            expect(document.activeElement).toBe(buttonNamed("Check again"))
        })
    })
})
