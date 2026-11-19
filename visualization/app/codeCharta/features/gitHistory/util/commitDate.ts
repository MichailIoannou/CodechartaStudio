const DEFAULT_LOCALE = "en-GB"
const MS_PER_SECOND = 1000

export interface CommitDateOptions {
    locale?: string
    /** The viewer's zone when absent. */
    timeZone?: string
}

/** "3 Nov 2026, 14:03": the absolute date of a commit, for titles and details. */
export function commitDateTime(epochSeconds: number, { locale = DEFAULT_LOCALE, timeZone }: CommitDateOptions = {}): string {
    const format = new Intl.DateTimeFormat(locale, {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone
    })
    return format.format(new Date(epochSeconds * MS_PER_SECOND))
}

/** "3 Nov 14:10": day and time without the year, for short titles. */
export function shortCommitDateTime(epochSeconds: number, { locale = DEFAULT_LOCALE, timeZone }: CommitDateOptions = {}): string {
    const date = new Date(epochSeconds * MS_PER_SECOND)
    const day = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone }).format(date)
    const time = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", timeZone }).format(date)
    return `${day} ${time}`
}
