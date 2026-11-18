import { defaultTheme } from "../../../preferences/preferences.read.facade"

// v37: preferences persisted before themes existed carry no theme; every user starts in the default (dark) one
export function migrateCcStateRecordToV37<T>(state: T): T {
    if (!state || typeof state !== "object") {
        return state
    }
    const record = state as Record<string, unknown>
    const preferences = record["preferences"]
    if (!preferences || typeof preferences !== "object" || "theme" in preferences) {
        return state
    }
    return { ...record, preferences: { ...preferences, theme: defaultTheme } } as T
}
