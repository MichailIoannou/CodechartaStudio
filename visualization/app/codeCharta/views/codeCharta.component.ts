import { ChangeDetectionStrategy, Component, OnInit, signal } from "@angular/core"
import { RouterOutlet } from "@angular/router"
import { ChangelogDialogComponent } from "../features/changelog/facade"
import { CredentialPromptDialogComponent, GitDialogsComponent } from "../features/gitHistory/facade"
import { NavBarComponent } from "../features/navBar/facade"
import { FileDropOverlayComponent, ProjectsBootService } from "../features/projects/facade"
import { BootLoadingIndicatorComponent, ErrorDialogComponent, ToastComponent } from "../features/shared/facade"
import { SnapshotNoticeComponent } from "../features/snapshots/facade"

@Component({
    selector: "cc-code-charta",
    templateUrl: "./codeCharta.component.html",
    imports: [
        NavBarComponent,
        ChangelogDialogComponent,
        ErrorDialogComponent,
        ToastComponent,
        RouterOutlet,
        BootLoadingIndicatorComponent,
        FileDropOverlayComponent,
        SnapshotNoticeComponent,
        CredentialPromptDialogComponent,
        GitDialogsComponent
    ],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class CodeChartaComponent implements OnInit {
    isInitialized = signal(false)

    constructor(private readonly projectsBoot: ProjectsBootService) {}

    ngOnInit(): void {
        this.projectsBoot
            .boot()
            .catch(() => undefined)
            .finally(() => {
                this.isInitialized.set(true)
            })
    }
}
