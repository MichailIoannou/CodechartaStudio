import type { Provider } from "@angular/core"
import { FOLDER_ACTIONS } from "../../projects/facade"
import { removeFetchedRefsAction } from "./removeFetchedRefsAction"

/** Plugs the clean-up of fetched pull request heads into the project overview's folder menu. */
export function provideCompareForProjects(): Provider[] {
    return [{ provide: FOLDER_ACTIONS, multi: true, useFactory: removeFetchedRefsAction }]
}
