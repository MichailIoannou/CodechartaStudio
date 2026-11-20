const SHORTENED_PREFIXES = ["refs/heads/", "refs/remotes/", "refs/tags/"]

/** The name git shows for a ref: `main`, `origin/main`, `v1.0`. */
export function refShortName(refName: string): string {
    const prefix = SHORTENED_PREFIXES.find(candidate => refName.startsWith(candidate))
    return prefix ? refName.slice(prefix.length) : refName
}
