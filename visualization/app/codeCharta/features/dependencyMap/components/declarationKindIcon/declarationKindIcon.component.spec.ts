import { TestBed } from "@angular/core/testing"
import { setActiveTheme } from "../../../../util/theme/activeTheme"
import { themeById } from "../../../../util/theme/themes"
import { DeclarationKindIconComponent } from "./declarationKindIcon.component"

describe("DeclarationKindIconComponent", () => {
    afterEach(() => setActiveTheme(themeById("cc-dark")))

    function render(kind: string) {
        const fixture = TestBed.createComponent(DeclarationKindIconComponent)
        fixture.componentRef.setInput("kind", kind)
        fixture.detectChanges()
        return fixture
    }

    it("should draw the letter of the kind on the tint of the active theme", () => {
        // Arrange
        setActiveTheme(themeById("cc-dark"))

        // Act
        const fixture = render("class")

        // Assert
        const host = fixture.nativeElement as HTMLElement
        expect(host.textContent.trim()).toBe("C")
        expect(host.style.backgroundColor).toBe("rgb(42, 58, 82)")
        expect(host.style.color).toBe("rgb(215, 221, 228)")
    })

    it("should recolor the icon when the theme changes", () => {
        // Arrange
        setActiveTheme(themeById("cc-dark"))
        const fixture = render("class")

        // Act
        setActiveTheme(themeById("cc-light"))
        fixture.detectChanges()

        // Assert
        const host = fixture.nativeElement as HTMLElement
        expect(host.style.backgroundColor).toBe("rgb(219, 231, 245)")
        expect(host.style.color).toBe("rgb(55, 65, 81)")
    })
})
