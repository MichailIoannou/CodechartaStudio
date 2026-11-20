import type { ToolStatus } from "../../../model/coreApi/ToolStatus"
import type { HostingCheck, HostingProvider, KnownHosting } from "../model/compare.model"

/** Design C7: what the "Pull requests" segment shows, or that it is absent. */
export type PullRequestPanel =
    | { kind: "absent" }
    | { kind: "checking" }
    | { kind: "unknownHost"; host: string }
    | { kind: "notInstalled"; hosting: KnownHosting }
    | { kind: "cliProblem"; hosting: KnownHosting; line: string }
    | { kind: "numberEntry"; hosting: KnownHosting }

interface PanelInput {
    hasRemote: boolean
    check: HostingCheck
    /** The desktop tools' row of the provider's CLI; undefined while the tools were not checked yet. */
    cli: ToolStatus | null | undefined
}

const CLI_OF: Readonly<Record<HostingProvider, "gh" | "glab">> = { github: "gh", gitlab: "glab" }

export function cliOf(provider: HostingProvider): "gh" | "glab" {
    return CLI_OF[provider]
}

export function pullRequestPanelOf({ hasRemote, check, cli }: PanelInput): PullRequestPanel {
    if (!hasRemote || check.kind === "unsupported") {
        return { kind: "absent" }
    }
    if (check.kind === "checking") {
        return { kind: "checking" }
    }
    const { provider, host, repository, remote } = check.status
    if (host === null || remote === null) {
        return { kind: "absent" }
    }
    if (provider === null) {
        return { kind: "unknownHost", host }
    }
    return panelOfTheCli({ provider, host, repository, remote }, cli)
}

function panelOfTheCli(hosting: KnownHosting, cli: ToolStatus | null | undefined): PullRequestPanel {
    if (cli === undefined) {
        return { kind: "checking" }
    }
    if (cli === null || cli.state === "missing") {
        return { kind: "notInstalled", hosting }
    }
    return cli.state === "ok" ? { kind: "numberEntry", hosting } : { kind: "cliProblem", hosting, line: cli.problem ?? cli.state }
}
