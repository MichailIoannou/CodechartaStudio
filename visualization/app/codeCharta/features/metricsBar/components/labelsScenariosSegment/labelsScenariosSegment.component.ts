import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal, viewChild } from "@angular/core"
import { toSignal } from "@angular/core/rxjs-interop"
import { MetricData } from "../../../../model/codeCharta.model"
import { LabelSettingsPanelComponent } from "../../../labelSettings/facade"
import {
    ApplyScenarioDialogComponent,
    SaveScenarioDialogComponent,
    Scenario,
    ScenarioListDialogComponent,
    ScenariosService
} from "../../../scenarios/facade"
import {
    BAR_CELL_CLASSES,
    injectIsAnyPopoverOpen,
    injectIsRadialLayout,
    openBarCellClasses,
    SettingsPopoverShellComponent
} from "../../../shared/facade"
import { cellTooltip } from "../../util/cellTooltip"
import { injectIsCompactBar } from "../../util/injectIsCompactBar"
import { CELL_SETTINGS_TITLES, COMPACT_SLOT_CLASSES } from "../cellIcon/barCellKind"
import { CellIconComponent } from "../cellIcon/cellIcon.component"
import { CompactBarButtonComponent } from "../compactBarButton/compactBarButton.component"
import { ScenariosMenuComponent } from "../scenariosMenu/scenariosMenu.component"

const FULL_HOST_CLASSES = `group relative flex min-w-0 flex-col items-stretch ${BAR_CELL_CLASSES}`
const COMPACT_HOST_CLASSES = "grid shrink-0 grid-rows-2 grid-flow-col gap-0.5"

@Component({
    selector: "cc-labels-scenarios-segment",
    templateUrl: "./labelsScenariosSegment.component.html",
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { "[class]": "hostClasses()" },
    imports: [
        CellIconComponent,
        CompactBarButtonComponent,
        ScenariosMenuComponent,
        LabelSettingsPanelComponent,
        ScenarioListDialogComponent,
        SaveScenarioDialogComponent,
        ApplyScenarioDialogComponent,
        SettingsPopoverShellComponent
    ]
})
export class LabelsScenariosSegmentComponent implements OnInit {
    private readonly scenariosService = inject(ScenariosService)
    readonly isRadialLayout = injectIsRadialLayout()
    readonly labelSettingsPopoverId = "metric-settings-popover-labels"
    readonly scenariosMenuPopoverId = "metric-segment-scenarios-menu"
    readonly labelSettingsTitle = CELL_SETTINGS_TITLES.labels
    readonly settingsButtonClasses = "btn btn-ghost btn-xs btn-square shrink-0 rounded-lg text-base-content/70 hover:text-base-content"
    private readonly isPopoverOpen = injectIsAnyPopoverOpen(() => [this.labelSettingsPopoverId, this.scenariosMenuPopoverId])
    protected readonly isCompact = injectIsCompactBar()
    protected readonly hostClasses = computed(() =>
        this.isCompact() ? COMPACT_HOST_CLASSES : `${FULL_HOST_CLASSES} ${openBarCellClasses(this.isPopoverOpen())}`
    )
    protected readonly labelsSlot = COMPACT_SLOT_CLASSES.labels
    protected readonly scenariosSlot = COMPACT_SLOT_CLASSES.scenarios
    protected readonly labelsTooltip = cellTooltip("Labels", "label settings")

    readonly listDialog = viewChild.required<ScenarioListDialogComponent>("listDialog")
    readonly saveDialog = viewChild.required<SaveScenarioDialogComponent>("saveDialog")

    readonly applyTarget = signal<{ scenario: Scenario; metricData: MetricData } | null>(null)

    readonly scenarios = toSignal(this.scenariosService.scenarios$, { initialValue: [] as Scenario[] })

    readonly scenariosCountLabel = computed(() => {
        const count = this.scenarios().length
        return `${count} ${count === 1 ? "scenario" : "scenarios"} available`
    })
    protected readonly scenariosTooltip = computed(() => cellTooltip("Scenarios", `${this.scenarios().length} available`))

    async ngOnInit(): Promise<void> {
        await this.scenariosService.loadScenarios()
    }

    openScenarioList() {
        this.listDialog().open()
    }

    openSaveDialog() {
        this.saveDialog().open()
    }

    handleApplyRequested(event: { scenario: Scenario; metricData: MetricData }) {
        this.applyTarget.set(event)
    }

    handleApplyClosed() {
        this.applyTarget.set(null)
    }
}
