import {
    afterRenderEffect,
    ChangeDetectionStrategy,
    Component,
    computed,
    ElementRef,
    inject,
    OnInit,
    signal,
    viewChild
} from "@angular/core"
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
    fontsLoadedSignal,
    injectIsAnyPopoverOpen,
    injectIsRadialLayout,
    maxContentWidth,
    openBarCellClasses,
    SettingsPopoverShellComponent,
    shortestCellWidth
} from "../../../shared/facade"
import { cellTooltip } from "../../util/cellTooltip"
import { injectIsCompactBar } from "../../util/injectIsCompactBar"
import { CELL_SETTINGS_TITLES, COMPACT_SLOT_CLASSES } from "../cellIcon/barCellKind"
import { CellIconComponent } from "../cellIcon/cellIcon.component"
import { CompactBarButtonComponent } from "../compactBarButton/compactBarButton.component"
import { ScenariosMenuComponent } from "../scenariosMenu/scenariosMenu.component"

const FULL_HOST_CLASSES = "group relative flex flex-col items-stretch justify-center rounded-xl px-3 transition-colors hover:bg-base-200"
const COMPACT_HOST_CLASSES = "grid shrink-0 grid-rows-2 grid-flow-col gap-x-0.5 gap-y-1.5 self-center"

@Component({
    selector: "cc-labels-scenarios-segment",
    templateUrl: "./labelsScenariosSegment.component.html",
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { "[class]": "hostClasses()", "[style.min-width.px]": "isCompact() ? null : shortestWidth()" },
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
    protected readonly shortestWidth = signal<number | null>(null)
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

    constructor() {
        const host: HTMLElement = inject(ElementRef).nativeElement
        const areFontsLoaded = fontsLoadedSignal()
        afterRenderEffect(() => {
            this.isRadialLayout()
            areFontsLoaded()
            if (!this.isCompact()) {
                this.shortestWidth.set(shortestLabelRowsWidth(host))
            }
        })
    }

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

/** The full cell keeps its label rows whole; only the scenario count shortens. */
function shortestLabelRowsWidth(cell: HTMLElement): number {
    return shortestCellWidth(cell, Array.from(cell.querySelectorAll<HTMLElement>("[data-label-row]"), maxContentWidth))
}
