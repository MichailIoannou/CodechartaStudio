import type { GitRefs } from "../../../model/coreApi/GitRefs"

type RefLabelKind = "currentBranch" | "detachedHead" | "localBranch" | "remoteBranch" | "tag"

export interface RefLabel {
    kind: RefLabelKind
    /** What the badge says: `main`, `origin/main`, `v1.0`, `HEAD`. */
    name: string
    /** The full ref for the title; `HEAD` for a detached head. */
    refName: string
}

const DETACHED_HEAD_NAME = "HEAD"

/** The labels drawn after each commit's subject, by commit SHA, the current branch first and tags last. */
export function refLabelsByCommit(refs: GitRefs): ReadonlyMap<string, readonly RefLabel[]> {
    const labels = new Map<string, RefLabel[]>()
    const add = (commit: string, label: RefLabel) => labels.set(commit, [...(labels.get(commit) ?? []), label])
    const current = refs.localBranches.filter(branch => branch.isCurrent)
    const others = refs.localBranches.filter(branch => !branch.isCurrent)
    for (const branch of current) {
        add(branch.commit, { kind: "currentBranch", name: branch.name, refName: branch.refName })
    }
    if (refs.head.kind === "detached") {
        add(refs.head.commit, { kind: "detachedHead", name: DETACHED_HEAD_NAME, refName: DETACHED_HEAD_NAME })
    }
    for (const branch of others) {
        add(branch.commit, { kind: "localBranch", name: branch.name, refName: branch.refName })
    }
    for (const branch of refs.remoteBranches) {
        add(branch.commit, { kind: "remoteBranch", name: branch.name, refName: branch.refName })
    }
    for (const tag of refs.tags) {
        add(tag.commit, { kind: "tag", name: tag.name, refName: tag.refName })
    }
    return labels
}
