import { ChangeDetectionStrategy, Component } from "@angular/core"
import { AxisCardComponent } from "../../../shared/facade"
import { injectIsCompactBar } from "../../util/injectIsCompactBar"
import { COMPACT_SLOT_CLASSES } from "../cellIcon/barCellKind"
import { CellIconComponent } from "../cellIcon/cellIcon.component"
import { ColorSettingsPopoverComponent } from "../colorSettingsPopover/colorSettingsPopover.component"
import { CompactBarButtonComponent } from "../compactBarButton/compactBarButton.component"

@Component({
    selector: "cc-delta-color-segment",
    templateUrl: "./deltaColorSegment.component.html",
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: "contents" },
    imports: [AxisCardComponent, CellIconComponent, ColorSettingsPopoverComponent, CompactBarButtonComponent]
})
export class DeltaColorSegmentComponent {
    readonly settingsPopoverId = "metric-settings-popover-color-delta"
    readonly settingsAnchorName = "metric-segment-color-settings"

    protected readonly isCompact = injectIsCompactBar()
    protected readonly compactSlot = COMPACT_SLOT_CLASSES.color
}
