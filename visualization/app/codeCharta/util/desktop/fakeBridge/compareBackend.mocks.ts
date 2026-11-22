import type { CompareIntent } from "../../../model/coreApi/CompareIntent"
import type { FolderRef } from "../../../model/coreApi/FolderRef"
import type { RefInput } from "../../../model/coreApi/RefInput"
import type { SideInput } from "../../../model/coreApi/SideInput"
import type { FakeBackend, FakeBridgeKit, FakeComparedSide, FakeRequestParams } from "./fakeBridgeKit"

/* istanbul ignore next */
export function fakeCompareBackend(kit: FakeBridgeKit): FakeBackend {
    const { succeed, refuse } = kit
    const { repositoryOf, commitsOf, commitAtRevision, reachedFrom, comparedSide, revisionOfTyped, sideOfInput, preflightOf } =
        kit.compareSides

    function comparedFolder(intent: CompareIntent): FolderRef {
        return intent.kind === "explicit" ? intent.base.folder : intent.folder
    }

    function typedRevisionOf(folderId: string, rev: RefInput) {
        return rev.kind === "rev" ? revisionOfTyped(folderId, rev.name) : null
    }

    function branchTarget(folderId: string, branch: string, target: string | null) {
        if (target) {
            return target
        }
        const current = repositoryOf(folderId)?.refs?.localBranches.find(candidate => candidate.isCurrent)
        return current && current.refName !== branch ? current.refName : "refs/heads/main"
    }

    function positionOf(folderId: string, revision: string) {
        const sha = commitAtRevision(folderId, revision)
        return commitsOf(folderId).findIndex(commit => commit.sha === sha)
    }

    function withParentRevisions(folderId: string, commit: string) {
        const parent = commitsOf(folderId)[positionOf(folderId, commit)]?.parents[0]
        return parent ? [parent, commit] : null
    }

    function comparedRevisions(intent: CompareIntent, shownCommit: string | null): (string | null)[] | null {
        const folderId = comparedFolder(intent).folderId
        switch (intent.kind) {
            case "commits":
                return positionOf(folderId, intent.b) > positionOf(folderId, intent.a) ? [intent.b, intent.a] : [intent.a, intent.b]
            case "withParent":
                return withParentRevisions(folderId, intent.commit)
            case "withCurrent":
                return [intent.commit, shownCommit ?? "HEAD"]
            case "branch":
                return [branchTarget(folderId, intent.branch, intent.target), intent.branch]
            case "explicit":
                return [typedRevisionOf(folderId, intent.base.rev), typedRevisionOf(folderId, intent.head.rev)]
            case "changeRequest":
                return [`refs/heads/${intent.baseRefName}`, intent.headCommit]
        }
    }

    function mergeBaseOf(folderId: string, tip: string, head: string) {
        const fromTip = reachedFrom(folderId, commitAtRevision(folderId, tip))
        const fromHead = reachedFrom(folderId, commitAtRevision(folderId, head))
        return commitsOf(folderId).find(commit => fromHead.has(commit.sha) && fromTip.has(commit.sha))?.sha ?? null
    }

    function usesMergeBase(intent: CompareIntent, base: string) {
        const isNamedRef = base.startsWith("refs/")
        const isChangeRequest = intent.kind === "changeRequest"
        return (
            isChangeRequest || ((intent.kind === "branch" || intent.kind === "explicit") && intent.baseMode === "mergeBase" && isNamedRef)
        )
    }

    function originOf(intent: CompareIntent, baseRevision: string) {
        if (intent.kind === "changeRequest") {
            return "pullRequest"
        }
        return intent.kind === "branch" || (intent.kind === "explicit" && baseRevision.startsWith("refs/")) ? "branches" : "commits"
    }

    function comparison(intent: CompareIntent, baseRevision: string, headRevision: string) {
        const folder = comparedFolder(intent)
        const mergeBase = usesMergeBase(intent, baseRevision) ? mergeBaseOf(folder.folderId, baseRevision, headRevision) : null
        const isTipTheMergeBase = mergeBase === commitAtRevision(folder.folderId, baseRevision)
        const base = comparedSide(folder, mergeBase && !isTipTheMergeBase ? mergeBase : baseRevision)
        const head = comparedSide(folder, headRevision)
        if (intent.kind === "changeRequest") {
            head.requested.label = { kind: "pullRequest", name: `#${intent.number}` }
        }
        return {
            status: { kind: base.requested.commit === head.requested.commit ? "sameCommit" : "ready" },
            origin: originOf(intent, baseRevision),
            baseMode: mergeBase ? "mergeBase" : "tip",
            base,
            head,
            baseTip: mergeBase ? comparedSide(folder, baseRevision).requested : null,
            preflight: preflightOf([base, head])
        }
    }

    function isSideBySide(intent: CompareIntent) {
        return (
            intent.kind === "explicit" &&
            (intent.base.folder.folderId !== intent.head.folder.folderId ||
                intent.base.rev.kind !== "rev" ||
                intent.head.rev.kind !== "rev")
        )
    }

    /** Two folders, or a snapshot without a commit: each side on its own, tip vs tip. */
    function resolveSideBySide(base: SideInput, head: SideInput) {
        const sides = [sideOfInput(base), sideOfInput(head)]
        if (sides.some(side => side === null)) {
            return refuse("UNKNOWN_REVISION", "The revision is not in the repository.")
        }
        return succeed({
            status: { kind: "ready" },
            origin: base.folder.folderId === head.folder.folderId ? "commits" : "folders",
            baseMode: "tip",
            base: sides[0],
            head: sides[1],
            baseTip: null,
            preflight: preflightOf(sides as FakeComparedSide[])
        })
    }

    function resolveComparison(params: FakeRequestParams) {
        const intent = params.intent as CompareIntent
        if (intent.kind === "explicit" && isSideBySide(intent)) {
            return resolveSideBySide(intent.base, intent.head)
        }
        const revisions = comparedRevisions(intent, params.shownCommit ?? null)
        if (!revisions) {
            return refuse("UNKNOWN_REVISION", "The commit has no parent to compare with.")
        }
        if (intent.kind === "changeRequest" && revisions[1] === null) {
            return refuse("HEAD_NOT_LOCAL", `The head of #${intent.number} is not in this clone.`)
        }
        if (revisions.some(revision => revision === null)) {
            return refuse("UNKNOWN_REVISION", "The revision is not in the repository.")
        }
        const [baseRevision, headRevision] = revisions as string[]
        return succeed(comparison(intent, baseRevision, headRevision))
    }

    return {
        "compare.resolve": resolveComparison
    }
}
