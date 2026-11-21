import { ChangeDetectionStrategy, Component, computed, inject } from "@angular/core"
import { toSignal } from "@angular/core/rxjs-interop"
import { RadialFolderStyle, RadialFolderValue } from "../../../../model/codeCharta.model"
import { MapStateReadWindow } from "../../../../stores/mapState/mapState.read.facade"
import { PreferencesReadWindow } from "../../../../stores/preferences/preferences.read.facade"
import { describeRadialFolderValue, folderSwatchBackground } from "../../../../util/radialFolderValues"
import { AxisCardComponent } from "../../../shared/facade"
import { MetricsBarWriteStore } from "../../stores/metricsBar.write.store"
import { FolderStylePopoverComponent } from "../folderStylePopover/folderStylePopover.component"
import { FolderValuePopoverComponent } from "../folderValuePopover/folderValuePopover.component"

const PERCENT = 100

@Component({
    selector: "cc-folders-segment",
    templateUrl: "./foldersSegment.component.html",
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: "contents" },
    imports: [AxisCardComponent, FolderStylePopoverComponent, FolderValuePopoverComponent]
})
export class FoldersSegmentComponent {
    readonly valuePopoverId = "metric-select-popover-folders"
    readonly valueAnchorName = "metric-segment-folders"
    readonly stylePopoverId = "metric-settings-popover-folders"
    readonly styleAnchorName = "metric-segment-folders-cog"

    private readonly preferencesReadWindow = inject(PreferencesReadWindow)
    private readonly mapStateReadWindow = inject(MapStateReadWindow)
    private readonly metricsBarWriteStore = inject(MetricsBarWriteStore)

    readonly folderValue = toSignal(this.preferencesReadWindow.radialFolderValue$, { requireSync: true })
    readonly isNeutral = toSignal(this.preferencesReadWindow.isRadialFolderNeutral$, { requireSync: true })
    private readonly tint = toSignal(this.preferencesReadWindow.radialFolderTint$, { requireSync: true })
    readonly colorMetric = toSignal(this.mapStateReadWindow.colorMetric$, { requireSync: true })
    private readonly swatchInputs = toSignal(this.preferencesReadWindow.radialFolderSwatchInputs$, { requireSync: true })

    readonly swatch = computed(() => {
        const { mapColors, style, tint } = this.swatchInputs()
        return folderSwatchBackground(mapColors, style, tint)
    })
    readonly tintedSwatch = computed(() => {
        const { mapColors, tint } = this.swatchInputs()
        return folderSwatchBackground(mapColors, RadialFolderStyle.Tinted, tint)
    })

    readonly tintPercent = computed(() => Math.round(this.tint() * PERCENT))
    readonly valueLabel = computed(() => describeRadialFolderValue(this.folderValue()).label)
    readonly styleLabel = computed(() => (this.isNeutral() ? "neutral" : `tinted ${this.tintPercent()} %`))

    selectValue(value: RadialFolderValue) {
        this.metricsBarWriteStore.setRadialFolderValue(value)
        if (this.isNeutral()) {
            this.metricsBarWriteStore.setRadialFolderStyle(RadialFolderStyle.Tinted)
        }
    }

    selectStyle(style: RadialFolderStyle) {
        this.metricsBarWriteStore.setRadialFolderStyle(style)
    }

    setTintPercent(tintPercent: number) {
        this.metricsBarWriteStore.setRadialFolderTint(tintPercent / PERCENT)
    }
}
