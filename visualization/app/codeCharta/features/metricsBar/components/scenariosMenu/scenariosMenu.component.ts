import { ChangeDetectionStrategy, Component, input, output } from "@angular/core"
import { SettingsPopoverShellComponent } from "../../../shared/facade"

@Component({
    selector: "cc-scenarios-menu",
    templateUrl: "./scenariosMenu.component.html",
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: "contents" },
    imports: [SettingsPopoverShellComponent]
})
export class ScenariosMenuComponent {
    readonly popoverId = input.required<string>()
    readonly anchorName = input.required<string>()
    readonly scenarioCount = input.required<number>()
    readonly openScenarioList = output()
    readonly saveScenario = output()
}
