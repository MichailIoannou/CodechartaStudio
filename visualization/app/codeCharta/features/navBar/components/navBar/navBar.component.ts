import { ChangeDetectionStrategy, Component, computed, inject } from "@angular/core"
import { toSignal } from "@angular/core/rxjs-interop"
import { FileStoreReadWindow } from "../../../../stores/fileStore/fileStore.facade"
import { Export3DMapDialogComponent, Export3DMapDialogStore } from "../../../3dPrint/facade"
import { ProjectSwitcherComponent, ProjectsFacade } from "../../../projects/facade"
import { HEIGHT_CSS_VARIABLE, PublishesHeightDirective } from "../../../shared/facade"
import { SnapshotsDialogComponent, SnapshotsDialogService } from "../../../snapshots/facade"
import { WorkspaceStatusComponent } from "../../../workspaceStatus/facade"
import { DeltaSelectorComponent } from "../deltaSelector/deltaSelector.component"
import { MapSelectorComponent } from "../mapSelector/mapSelector.component"
import { NavBarFolderButtonComponent } from "../navBarFolderButton/navBarFolderButton.component"
import { NavBarLogoComponent } from "../navBarLogo/navBarLogo.component"
import { SettingsButtonComponent } from "../settingsButton/settingsButton.component"
import { ViewSwitcherComponent } from "../viewSwitcher/viewSwitcher.component"

@Component({
    selector: "cc-nav-bar",
    templateUrl: "./navBar.component.html",
    imports: [
        Export3DMapDialogComponent,
        NavBarLogoComponent,
        NavBarFolderButtonComponent,
        MapSelectorComponent,
        DeltaSelectorComponent,
        SettingsButtonComponent,
        ViewSwitcherComponent,
        ProjectSwitcherComponent,
        WorkspaceStatusComponent,
        SnapshotsDialogComponent
    ],
    hostDirectives: [PublishesHeightDirective],
    providers: [{ provide: HEIGHT_CSS_VARIABLE, useValue: "--cc-bars-height" }],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class NavBarComponent {
    private readonly fileStoreReadWindow = inject(FileStoreReadWindow)
    private readonly export3DMapDialogStore = inject(Export3DMapDialogStore)
    private readonly projectsFacade = inject(ProjectsFacade)
    private readonly files = toSignal(this.fileStoreReadWindow.files$, { requireSync: true })

    isDeltaState = toSignal(this.fileStoreReadWindow.isDeltaState$, { requireSync: true })
    readonly isDesktop = this.projectsFacade.isDesktop
    readonly hasActiveProject = this.projectsFacade.hasActiveProject
    readonly hasFiles = computed(() => this.files().length > 0)

    /** Hosted here rather than in the print button, which the mode bar unmounts on mouse-out. */
    readonly isExportDialogOpen = this.export3DMapDialogStore.isDialogOpen
    readonly isSnapshotsDialogOpen = inject(SnapshotsDialogService).isOpen

    closeExportDialog() {
        this.export3DMapDialogStore.closeDialog()
    }
}
