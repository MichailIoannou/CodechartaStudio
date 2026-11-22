const SHORT_SHA_LENGTH = 7
const SECONDS_PER_MINUTE = 60
const MS_PER_SECOND = 1000
const TIME_UNITS: readonly { seconds: number; singular: string; plural: string }[] = [
    { seconds: 31_536_000, singular: "year", plural: "years" },
    { seconds: 2_592_000, singular: "month", plural: "months" },
    { seconds: 604_800, singular: "week", plural: "weeks" },
    { seconds: 86_400, singular: "day", plural: "days" },
    { seconds: 3600, singular: "hour", plural: "hours" },
    { seconds: SECONDS_PER_MINUTE, singular: "min", plural: "min" }
]

export function counted(count: number, singular: string, plural = `${singular}s`): string {
    return `${count} ${count === 1 ? singular : plural}`
}

export function shortSha(sha: string): string {
    return sha.slice(0, SHORT_SHA_LENGTH)
}

export function relativeTime(epochSeconds: number, nowMs: number): string {
    const elapsed = Math.max(0, Math.floor(nowMs / MS_PER_SECOND - epochSeconds))
    const unit = TIME_UNITS.find(candidate => elapsed >= candidate.seconds)
    return unit ? `${counted(Math.floor(elapsed / unit.seconds), unit.singular, unit.plural)} ago` : "just now"
}
