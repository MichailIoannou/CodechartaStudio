import { Injectable, inject } from "@angular/core"
import type { BridgeMethod, BridgeParams, BridgeResult } from "../../../util/desktop/desktopBridge"
import { DesktopEnvironment } from "../../../util/desktop/desktopEnvironment.service"
import { valueOrThrow } from "../../../util/desktop/desktopResult"
import type { CompareIntent, FolderRef, ResolvedComparison } from "../model/compare.model"

const HEAD = "HEAD"
const FULL_REF_PREFIX = "refs/"
const FULL_SHA = /^[0-9a-f]{40}([0-9a-f]{24})?$/i
const SHA_PREFIX = /^[0-9a-f]{4,63}$/i

/** `compare.resolve` and the ref lookups behind the compare dialog, through the desktop bridge. */
@Injectable({ providedIn: "root" })
export class CoreGatewayAdapter {
    private readonly environment = inject(DesktopEnvironment)

    resolve(intent: CompareIntent, shownCommit: string | null): Promise<ResolvedComparison> {
        return this.request("compare.resolve", { intent, shownCommit })
    }

    async toRevision(folder: FolderRef, input: string): Promise<string | null> {
        if (input === HEAD || input.startsWith(FULL_REF_PREFIX) || FULL_SHA.test(input)) {
            return input
        }
        const refs = await this.request("git.branches", { repo: folder })
        const named = [...refs.localBranches, ...refs.remoteBranches, ...refs.tags].find(ref => ref.name === input)
        if (named) {
            return named.refName
        }
        if (!SHA_PREFIX.test(input)) {
            return null
        }
        const { commit } = await this.request("projects.resolveCommit", { ...folder, hash: input })
        return commit?.commit ?? null
    }

    private async request<Method extends BridgeMethod>(method: Method, params: BridgeParams<Method>): Promise<BridgeResult<Method>> {
        return valueOrThrow(await this.environment.requireBridge().request(method, params))
    }
}
