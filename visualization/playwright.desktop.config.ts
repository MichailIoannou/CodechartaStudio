import { defineConfig } from "@playwright/test"

export default defineConfig({
    testDir: "./electron",
    testMatch: "**/*.e2e.ts",
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    workers: 1,
    reporter: "list",
    timeout: 90_000,
    use: {
        trace: "retain-on-failure",
        screenshot: "only-on-failure"
    }
})
