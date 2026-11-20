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

@Component({
    selector: "cc-labels-scenarios-segment",
    templateUrl: "./labelsScenariosSegment.component.html",
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: `group relative flex min-w-0 flex-col items-stretch ${BAR_CELL_CLASSES}`, "[class]": "openClasses()" },
    imports: [
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
    private readonly isLabelSettingsOpen = injectIsAnyPopoverOpen(() => [this.labelSettingsPopoverId])
    protected readonly openClasses = computed(() => openBarCellClasses(this.isLabelSettingsOpen()))

    readonly listDialog = viewChild.required<ScenarioListDialogComponent>("listDialog")
    readonly saveDialog = viewChild.required<SaveScenarioDialogComponent>("saveDialog")

    readonly applyTarget = signal<{ scenario: Scenario; metricData: MetricData } | null>(null)

    readonly scenarios = toSignal(this.scenariosService.scenarios$, { initialValue: [] as Scenario[] })

    readonly scenariosCountLabel = computed(() => {
        const count = this.scenarios().length
        return `${count} ${count === 1 ? "scenario" : "scenarios"} available`
    })

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
