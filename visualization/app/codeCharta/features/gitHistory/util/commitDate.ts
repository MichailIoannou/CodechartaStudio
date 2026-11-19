const DEFAULT_LOCALE = "en-GB"
const MS_PER_SECOND = 1000

const DATE_TIME: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }
const DAY: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }
const TIME: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" }

export interface CommitDateOptions {
    locale?: string
    /** The viewer's zone when absent. */
    timeZone?: string
}

/** Building a format is far slower than using one, and a scrolling list formats dozens of dates per frame. */
const formats = new Map<string, Intl.DateTimeFormat>()

/** "3 Nov 2026, 14:03": the absolute date of a commit, for titles and details. */
export function commitDateTime(epochSeconds: number, { locale = DEFAULT_LOCALE, timeZone }: CommitDateOptions = {}): string {
    return formatOf(locale, timeZone, DATE_TIME).format(new Date(epochSeconds * MS_PER_SECOND))
}

/** "3 Nov 14:10": day and time without the year, for short titles. */
export function shortCommitDateTime(epochSeconds: number, { locale = DEFAULT_LOCALE, timeZone }: CommitDateOptions = {}): string {
    const date = new Date(epochSeconds * MS_PER_SECOND)
    return `${formatOf(locale, timeZone, DAY).format(date)} ${formatOf(locale, timeZone, TIME).format(date)}`
}

function formatOf(locale: string, timeZone: string | undefined, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
    const key = `${locale}|${timeZone ?? ""}|${JSON.stringify(options)}`
    let format = formats.get(key)
    if (!format) {
        format = new Intl.DateTimeFormat(locale, { ...options, timeZone })
        formats.set(key, format)
    }
    return format
}
