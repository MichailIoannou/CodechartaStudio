import { fireEvent, render, screen } from "@testing-library/angular"
import { CopyCommandComponent } from "./copyCommand.component"

const COMMAND = 'git config --global user.name "Your Name"'

describe("CopyCommandComponent", () => {
    let writeText: jest.Mock

    beforeEach(() => {
        writeText = jest.fn().mockResolvedValue(undefined)
        Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } })
        jest.useFakeTimers()
    })

    afterEach(() => {
        jest.useRealTimers()
    })

    async function copyThe(command: string) {
        const rendered = await render(CopyCommandComponent, { inputs: { command } })
        fireEvent.click(screen.getByRole("button", { name: "Copy command" }))
        await Promise.resolve()
        rendered.detectChanges()
        return rendered
    }

    function copyIconClasses(): string[] {
        return [...(screen.getByRole("button", { name: "Copy command" }).querySelector("i")?.classList ?? [])].sort()
    }

    it("should show the whole command, wrapped rather than cut off, in a monospace block with a copy button", async () => {
        // Arrange & Act
        await render(CopyCommandComponent, { inputs: { command: COMMAND } })

        // Assert
        const code = screen.getByText(COMMAND)
        expect(code.className).toContain("whitespace-pre-wrap")
        expect(code.className).toContain("break-all")
        expect(code.className).not.toContain("truncate")
        expect(code.closest("[data-testid='copy-command']")?.className).toContain("font-mono")
        expect(copyIconClasses()).toEqual(["fa-copy", "fa-regular"])
    })

    it("should copy the command and show a check mark", async () => {
        // Arrange & Act
        await copyThe(COMMAND)

        // Assert
        expect(writeText).toHaveBeenCalledWith(COMMAND)
        expect(copyIconClasses()).toEqual(["fa-check", "fa-solid"])
    })

    it("should show the copy icon again after two seconds", async () => {
        // Arrange
        const rendered = await copyThe(COMMAND)

        // Act
        jest.advanceTimersByTime(2000)
        rendered.detectChanges()

        // Assert
        expect(copyIconClasses()).toEqual(["fa-copy", "fa-regular"])
    })
})
