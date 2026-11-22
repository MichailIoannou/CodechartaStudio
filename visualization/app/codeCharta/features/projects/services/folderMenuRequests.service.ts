import { Injectable, signal } from "@angular/core"

/** Counts the requests of other views to open the project menu for choosing the working folder. */
@Injectable({ providedIn: "root" })
export class FolderMenuRequestsService {
    private readonly requests = signal(0)

    readonly latest = this.requests.asReadonly()

    request(): void {
        this.requests.update(count => count + 1)
    }
}
