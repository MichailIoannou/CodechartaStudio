import { ChangeDetectionStrategy, Component } from "@angular/core"
import { AxisCardComponent } from "../../../shared/facade"
import { CellIconComponent } from "../cellIcon/cellIcon.component"
import { ColorSettingsPopoverComponent } from "../colorSettingsPopover/colorSettingsPopover.component"

@Component({
    selector: "cc-delta-color-segment",
    templateUrl: "./deltaColorSegment.component.html",
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: "contents" },
    imports: [AxisCardComponent, CellIconComponent, ColorSettingsPopoverComponent]
})
export class DeltaColorSegmentComponent {
    readonly settingsPopoverId = "metric-settings-popover-color-delta"
    readonly settingsAnchorName = "metric-segment-color-settings"
}
