import { ChangeDetectionStrategy, Component, computed, inject } from "@angular/core"
import { toSignal } from "@angular/core/rxjs-interop"
import { PreferencesReadWindow } from "../../../../stores/preferences/preferences.read.facade"
import { describeRadialFolderValue, folderSwatchBackground } from "../../../../util/radialFolderValues"

@Component({
    selector: "cc-legend-folders-row",
    templateUrl: "./legendFoldersRow.component.html",
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class LegendFoldersRowComponent {
    private readonly preferencesReadWindow = inject(PreferencesReadWindow)

    private readonly folderValue = toSignal(this.preferencesReadWindow.radialFolderValue$, { requireSync: true })
    private readonly isNeutral = toSignal(this.preferencesReadWindow.isRadialFolderNeutral$, { requireSync: true })

    private readonly swatchInputs = toSignal(this.preferencesReadWindow.radialFolderSwatchInputs$, { requireSync: true })

    readonly swatch = computed(() => {
        const { mapColors, style, tint } = this.swatchInputs()
        return folderSwatchBackground(mapColors, style, tint)
    })
    readonly label = computed(() =>
        this.isNeutral() ? "folders: neutral" : `folders: ${describeRadialFolderValue(this.folderValue()).legend}, tinted`
    )
}
