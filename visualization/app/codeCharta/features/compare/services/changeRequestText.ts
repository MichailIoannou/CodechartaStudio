import type { HostingProvider, KnownHosting } from "../model/compare.model"

interface ProviderWording {
    segment: string
    prefix: string
    notInstalled: string
    cliSite: string
    cliUrl: string
}

const WORDING: Readonly<Record<HostingProvider, ProviderWording>> = {
    github: {
        segment: "Pull requests",
        prefix: "#",
        notInstalled: "Install the GitHub CLI (gh) to list pull requests, or enter a number below.",
        cliSite: "cli.github.com",
        cliUrl: "https://cli.github.com"
    },
    gitlab: {
        segment: "Merge requests",
        prefix: "!",
        notInstalled: "Install the GitLab CLI (glab) to list merge requests, or enter a number below.",
        cliSite: "gitlab.com/gitlab-org/cli",
        cliUrl: "https://gitlab.com/gitlab-org/cli"
    }
}

const UNKNOWN_PROVIDER_SEGMENT = "Pull requests"

/** "Pull requests", or "Merge requests" for GitLab. */
export function segmentLabelOf(provider: HostingProvider | null): string {
    return provider ? WORDING[provider].segment : UNKNOWN_PROVIDER_SEGMENT
}

export function providerWordingOf(provider: HostingProvider): ProviderWording {
    return WORDING[provider]
}

/** "#123" on GitHub, "!123" on GitLab. */
export function changeRequestLabel(provider: HostingProvider, number: number): string {
    return `${WORDING[provider].prefix}${number}`
}

export function unknownHostText(host: string): string {
    return `This host is not recognised. Treat ${host} as:`
}

/** The request's page on the hosting site; null without a repository. */
export function changeRequestUrl({ provider, host, repository }: KnownHosting, number: number): string | null {
    if (repository === null) {
        return null
    }
    const path = provider === "github" ? `pull/${number}` : `-/merge_requests/${number}`
    return `https://${host}/${repository}/${path}`
}
