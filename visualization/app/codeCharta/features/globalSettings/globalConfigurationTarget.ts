import type { ToolId } from "../../model/coreApi/ToolId"

/** A place inside the Global Configuration dialog that a link elsewhere opens it at. */
export interface GlobalConfigurationTarget {
    section: "desktopTools"
    /** The failing tool whose row gets the focus. */
    tool?: ToolId
}
