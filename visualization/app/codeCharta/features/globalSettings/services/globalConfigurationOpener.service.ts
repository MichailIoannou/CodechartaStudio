import { Injectable } from "@angular/core"
import { GlobalConfigurationTarget } from "../globalConfigurationTarget"

type OpenDialog = (target?: GlobalConfigurationTarget) => void

/** Opens the one Global Configuration dialog, which the Settings button owns, from anywhere in the app. */
@Injectable({ providedIn: "root" })
export class GlobalConfigurationOpener {
    private openDialog: OpenDialog | null = null

    serve(openDialog: OpenDialog): () => void {
        this.openDialog = openDialog
        return () => {
            if (this.openDialog === openDialog) {
                this.openDialog = null
            }
        }
    }

    openGlobalConfiguration(target?: GlobalConfigurationTarget): void {
        this.openDialog?.(target)
    }
}
