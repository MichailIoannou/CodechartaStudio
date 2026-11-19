import { Injectable, inject } from "@angular/core"
import type { FolderRef } from "../../../model/coreApi/FolderRef"
import type { GitLogParams } from "../../../model/coreApi/GitLogParams"
import type { RepositoryChanged } from "../../../model/coreApi/RepositoryChanged"
import type { BridgeMethod, BridgeParams, BridgeResult } from "../../../util/desktop/desktopBridge"
import { DESKTOP_BRIDGE } from "../../../util/desktop/desktopBridge.token"
import { GitResult, gitErrorFromThrown, gitErrorOf } from "../model/gitError"

type GitMethod = Extract<BridgeMethod, `git.${string}`>

const WITHOUT_BRIDGE = "Git is only available in the desktop app."

/** The only caller of the desktop bridge for `git.*`. */
@Injectable({ providedIn: "root" })
export class GitApiService {
    private readonly bridge = inject(DESKTOP_BRIDGE)

    repositoryInfo(repo: FolderRef) {
        return this.call("git.repositoryInfo", { repo })
    }

    status(repo: FolderRef) {
        return this.call("git.status", { repo })
    }

    branches(repo: FolderRef) {
        return this.call("git.branches", { repo })
    }

    refsFingerprint(repo: FolderRef) {
        return this.call("git.refsFingerprint", { repo })
    }

    log(params: GitLogParams) {
        return this.call("git.log", params)
    }

    commitDetails(repo: FolderRef, sha: string) {
        return this.call("git.commitDetails", { repo, sha })
    }

    onRepositoryChanged(handler: (change: RepositoryChanged) => void): () => void {
        return this.bridge?.subscribe("repository.changed", handler) ?? (() => undefined)
    }

    private async call<Method extends GitMethod>(method: Method, params: BridgeParams<Method>): Promise<GitResult<BridgeResult<Method>>> {
        if (!this.bridge) {
            return { ok: false, error: gitErrorFromThrown(new Error(WITHOUT_BRIDGE)) }
        }
        try {
            const answer = await this.bridge.request(method, params)
            return "error" in answer ? { ok: false, error: gitErrorOf(answer.error) } : answer
        } catch (thrown) {
            return { ok: false, error: gitErrorFromThrown(thrown) }
        }
    }
}
