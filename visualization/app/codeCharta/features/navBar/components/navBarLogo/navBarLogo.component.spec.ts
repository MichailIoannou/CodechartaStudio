import { render, screen } from "@testing-library/angular"
import { NavBarLogoComponent } from "./navBarLogo.component"

describe("NavBarLogoComponent", () => {
    it("should keep the logo at a fixed size however narrow the nav bar gets", async () => {
        // Arrange & Act
        const { container } = await render(NavBarLogoComponent)

        // Assert
        expect(container.classList).toContain("shrink-0")
        expect(screen.getByRole("link").classList).toContain("shrink-0")
        expect(screen.getByAltText("CodeCharta").className).toBe("h-8 w-11 max-w-none")
    })
})
