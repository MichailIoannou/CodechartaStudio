import { render, screen } from "@testing-library/angular"
import userEvent from "@testing-library/user-event"
import { ToastService } from "../../services/toast.service"
import { ToastComponent } from "./toast.component"

describe("ToastComponent", () => {
    async function renderComponent(toastService: Partial<ToastService>) {
        return render(ToastComponent, {
            providers: [{ provide: ToastService, useValue: toastService }]
        })
    }

    it("should render each active message from the service", async () => {
        // Arrange & Act
        await renderComponent({
            messages: (() => [{ id: 0, text: "no domain data", severity: "info" as const }]) as ToastService["messages"]
        })

        // Assert
        expect(screen.getByText("no domain data")).toBeTruthy()
    })

    it("should show projected persistent items before the messages", async () => {
        // Arrange & Act
        await render(`<cc-toast><p>persistent</p></cc-toast>`, {
            imports: [ToastComponent],
            providers: [
                {
                    provide: ToastService,
                    useValue: { messages: () => [{ id: 0, text: "ordinary", severity: "info" as const }] }
                }
            ]
        })

        // Assert
        const texts = Array.from(screen.getByRole("status").children).map(child => child.textContent?.trim())
        expect(texts[0]).toBe("persistent")
        expect(texts[1]).toContain("ordinary")
    })

    it("should announce messages through an aria-live status region", async () => {
        // Arrange & Act
        await renderComponent({
            messages: (() => [{ id: 0, text: "announced", severity: "info" as const }]) as ToastService["messages"]
        })

        // Assert
        const statusRegion = screen.getByRole("status")
        expect(statusRegion.getAttribute("aria-live")).toBe("polite")
    })

    it("should dismiss the message through the service when the close button is clicked", async () => {
        // Arrange
        const dismiss = jest.fn()
        await renderComponent({
            messages: (() => [{ id: 7, text: "closeable", severity: "info" as const }]) as ToastService["messages"],
            dismiss
        })

        // Act
        await userEvent.click(screen.getByLabelText("Dismiss notification"))

        // Assert
        expect(dismiss).toHaveBeenCalledWith(7)
    })

    it("should show the details of a message only after Details is clicked", async () => {
        // Arrange
        await renderComponent({
            messages: (() => [
                { id: 1, text: "Git failed", severity: "error" as const, details: "fatal: unable to access" }
            ]) as unknown as ToastService["messages"]
        })
        const hiddenBefore = screen.queryByTestId("toast-details")

        // Act
        await userEvent.click(screen.getByRole("button", { name: "Details" }))

        // Assert
        expect(hiddenBefore).toBe(null)
        expect(screen.getByTestId("toast-details").textContent).toBe("fatal: unable to access")
    })

    it("should run the follow-up action and close the message", async () => {
        // Arrange
        const run = jest.fn()
        const dismiss = jest.fn()
        await renderComponent({
            messages: (() => [
                { id: 2, text: "Pull first", severity: "error" as const, action: { label: "Pull", run } }
            ]) as unknown as ToastService["messages"],
            dismiss
        })

        // Act
        await userEvent.click(screen.getByRole("button", { name: "Pull" }))

        // Assert
        expect(run).toHaveBeenCalledTimes(1)
        expect(dismiss).toHaveBeenCalledWith(2)
    })

    it("should fold the details again on a second click", async () => {
        // Arrange
        await renderComponent({
            messages: (() => [
                { id: 3, text: "Git failed", severity: "error" as const, details: "fatal" }
            ]) as unknown as ToastService["messages"],
            dismiss: jest.fn()
        })
        const details = screen.getByRole("button", { name: "Details" })

        // Act
        await userEvent.click(details)
        await userEvent.click(details)

        // Assert
        expect(screen.queryByTestId("toast-details")).toBe(null)
        expect(details.getAttribute("aria-expanded")).toBe("false")
    })

    it("should show each command as an always visible copy block", async () => {
        // Arrange
        const commands = ['git config --global user.name "Your Name"', 'git config --global user.email "you@example.com"']

        // Act
        await renderComponent({
            messages: (() => [
                { id: 4, text: "Git does not know who you are.", severity: "error" as const, commands, details: "fatal" }
            ]) as unknown as ToastService["messages"]
        })

        // Assert
        expect(screen.getAllByTestId("copy-command").map(block => block.textContent?.trim())).toEqual(commands)
        expect(screen.getAllByRole("button", { name: "Copy command" })).toHaveLength(2)
        expect(screen.queryByTestId("toast-details")).toBe(null)
    })

    it("should stack the messages at the top right just below the nav bar", async () => {
        // Act
        await renderComponent({ messages: (() => []) as ToastService["messages"] })

        // Assert
        const stack = screen.getByRole("status")
        expect(stack.classList).toContain("toast-end")
        expect(stack.classList).toContain("top-[var(--cc-bars-height,49px)]")
    })
})
