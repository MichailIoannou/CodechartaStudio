import { ChangeDetectionStrategy, Component, computed, input } from "@angular/core"
import type { PreflightProblem } from "../../../../model/coreApi/PreflightProblem"

export const LONG_PATHS_COMMAND = "git config --global core.longpaths true"

@Component({
    selector: "cc-preflight-problems",
    templateUrl: "./preflightProblems.component.html",
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class PreflightProblemsComponent {
    readonly problems = input.required<PreflightProblem[]>()

    readonly isBlocking = computed(() => this.problems().some(problem => problem.severity === "error"))
    readonly longPathsCommand = LONG_PATHS_COMMAND
}
