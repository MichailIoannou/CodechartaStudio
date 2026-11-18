;(function () {
    var MIRROR_KEY = "codeCharta.themeBoot"
    var ID_PATTERN = /^[a-z-]+$/
    var COLOR_PATTERN = /^#[0-9a-f]{6}$/i
    var PROPERTY_BY_COLOR = {
        background: "--cc-boot-background",
        content: "--cc-boot-content",
        track: "--cc-boot-track",
        accent: "--cc-boot-accent"
    }
    var DEFAULT_COLORS = { id: "cc-dark", background: "#1e2329", content: "#e6e9ee", track: "#3a424d", accent: "#8b9cff" }

    function isValid(colors) {
        if (!colors || typeof colors.id !== "string" || !ID_PATTERN.test(colors.id)) {
            return false
        }
        return Object.keys(PROPERTY_BY_COLOR).every(function (key) {
            return typeof colors[key] === "string" && COLOR_PATTERN.test(colors[key])
        })
    }

    function bootColors() {
        try {
            var mirror = JSON.parse(localStorage.getItem(MIRROR_KEY))
            var scheme = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
            if (mirror && isValid(mirror[scheme])) {
                return mirror[scheme]
            }
        } catch (error) {}
        return DEFAULT_COLORS
    }

    var colors = bootColors()
    var root = document.documentElement
    root.setAttribute("data-theme", colors.id)
    Object.keys(PROPERTY_BY_COLOR).forEach(function (key) {
        root.style.setProperty(PROPERTY_BY_COLOR[key], colors[key])
    })
})()
