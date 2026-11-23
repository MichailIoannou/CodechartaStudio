import { ChangeDetectionStrategy, Component, computed, input } from "@angular/core"
import { MetricGlyphComponent } from "../../../shared/facade"
import { ScenarioGroupIcon } from "../../model/scenarioSettings.registry"

@Component({
    selector: "cc-scenario-group-icon",
    templateUrl: "./scenarioGroupIcon.component.html",
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: "inline-flex items-center justify-center" },
    imports: [MetricGlyphComponent]
})
export class ScenarioGroupIconComponent {
    readonly icon = input.required<ScenarioGroupIcon>()

    protected readonly glyph = computed(() => {
        const icon = this.icon()
        return "glyph" in icon ? icon.glyph : null
    })
    protected readonly fontAwesome = computed(() => {
        const icon = this.icon()
        return "fontAwesome" in icon ? icon.fontAwesome : null
    })
}
