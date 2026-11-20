import { Injectable, signal } from "@angular/core"

export type ToastSeverity = "info" | "success" | "warning" | "error"

export interface ToastAction {
    readonly label: string
    readonly run: () => void
}

export interface ToastOptions {
    /** The full technical message, shown on "Details". */
    readonly details?: string
    readonly action?: ToastAction
    /** Shell commands the user must run, each shown as a copy block. */
    readonly commands?: readonly string[]
}

export interface ToastMessage extends ToastOptions {
    readonly id: number
    readonly text: string
    readonly severity: ToastSeverity
}

@Injectable({ providedIn: "root" })
export class ToastService {
    private static readonly AUTO_DISMISS_MS = 5000

    private nextId = 0
    private readonly activeMessages = signal<ToastMessage[]>([])

    readonly messages = this.activeMessages.asReadonly()

    /** Errors stay until dismissed; every other message closes by itself. */
    show(text: string, severity: ToastSeverity = "info", options: ToastOptions = {}): number {
        const id = this.nextId++
        this.activeMessages.update(messages => [...messages, { id, text, severity, ...options }])
        if (severity !== "error") {
            setTimeout(() => this.dismiss(id), ToastService.AUTO_DISMISS_MS)
        }
        return id
    }

    dismiss(id: number): void {
        this.activeMessages.update(messages => messages.filter(message => message.id !== id))
    }
}
