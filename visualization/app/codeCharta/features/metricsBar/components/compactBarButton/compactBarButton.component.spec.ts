import { render, screen } from "@testing-library/angular"
import { CompactBarButtonComponent } from "./compactBarButton.component"

describe("CompactBarButtonComponent", () => {
    async function renderButton(inputs: Record<string, unknown> = {}) {
        return render(CompactBarButtonComponent, {
            inputs: { tooltip: "Area · rloc · Σ 1,420", popoverId: "area-chooser", ...inputs }
        })
    }

    function toggle(popoverId: string, newState: "open" | "closed") {
        const event = new Event("toggle")
        Object.defineProperty(event, "newState", { value: newState })
        document.getElementById(popoverId).dispatchEvent(event)
    }

    it("should name itself by its tooltip and show it above on hover and focus", async () => {
        // Act
        await renderButton()

        // Assert
        const button = screen.getByRole("button", { name: "Area · rloc · Σ 1,420" })
        expect(button.dataset.tip).toBe("Area · rloc · Σ 1,420")
        expect(button.classList).toContain("tooltip")
        expect(button.classList).toContain("tooltip-top")
        expect(button.classList).toContain("size-7")
    })

    it("should open the popover its card opens, anchored to itself under every name", async () => {
        // Act
        await renderButton({ anchorNames: ["metric-segment-area", "metric-segment-area-cog"] })

        // Assert
        const button = screen.getByRole("button")
        expect(button.getAttribute("popovertarget")).toBe("area-chooser")
        expect(button.style.getPropertyValue("anchor-name")).toBe("--metric-segment-area, --metric-segment-area-cog")
        expect(button.dataset.anchorName).toBe("metric-segment-area metric-segment-area-cog")
    })

    it("should look pressed and hide its tooltip while one of its popovers is open", async () => {
        // Arrange
        const { fixture } = await render(
            `<cc-compact-bar-button tooltip="Area" popoverId="area-chooser" [popoverIds]="['area-settings']" />
            <div id="area-chooser" popover></div><div id="area-settings" popover></div>`,
            { imports: [CompactBarButtonComponent] }
        )

        // Act
        toggle("area-settings", "open")
        fixture.detectChanges()

        // Assert
        const button = screen.getByRole("button", { name: "Area" })
        expect(button.classList).toContain("btn-active")
        expect(button.classList).toContain("ring-1")
        expect(button.classList).not.toContain("tooltip")
        expect(button.hasAttribute("data-tip")).toBe(false)
    })

    it("should span both rows when tall", async () => {
        // Act
        await renderButton({ isTall: true })

        // Assert
        const button = screen.getByRole("button")
        expect(button.classList).toContain("h-full")
        expect(button.classList).toContain("w-7")
        expect(button.classList).not.toContain("size-7")
    })

    it("should dim its icon for a dimmed card", async () => {
        // Act
        await renderButton({ isDimmed: true, testId: "compact-edges" })

        // Assert
        expect(screen.getByTestId("compact-edges").classList).toContain("text-base-content/40")
    })
})
