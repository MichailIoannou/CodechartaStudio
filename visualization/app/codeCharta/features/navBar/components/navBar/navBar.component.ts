import { ChangeDetectionStrategy, Component, computed, inject } from "@angular/core"
import { toSignal } from "@angular/core/rxjs-interop"
import { FileStoreReadWindow } from "../../../../stores/fileStore/fileStore.facade"
import { Export3DMapDialogComponent, Export3DMapDialogStore } from "../../../3dPrint/facade"
import { CompareFacade, CompareHostComponent, ComparisonChipComponent } from "../../../compare/facade"
import { ProjectSwitcherComponent, ProjectsFacade } from "../../../projects/facade"
import { HEIGHT_CSS_VARIABLE, PublishesHeightDirective } from "../../../shared/facade"
import {
    BatchAnalysisDialogComponent,
    BatchAnalysisDialogService,
    SnapshotsDialogComponent,
    SnapshotsDialogService
} from "../../../snapshots/facade"
import { WindowControlsComponent, WindowControlsService } from "../../../windowControls/facade"
import { WorkspaceStatusComponent } from "../../../workspaceStatus/facade"
import { DeltaSelectorComponent } from "../deltaSelector/deltaSelector.component"
import { MapSelectorComponent } from "../mapSelector/mapSelector.component"
import { NavBarFolderButtonComponent } from "../navBarFolderButton/navBarFolderButton.component"
import { NavBarLogoComponent } from "../navBarLogo/navBarLogo.component"
import { SettingsButtonComponent } from "../settingsButton/settingsButton.component"
import { ViewSwitcherComponent } from "../viewSwitcher/viewSwitcher.component"

/** Where Windows draws its caption buttons over the page, from the Window Controls Overlay. */
const CAPTION_BUTTONS_INSET = "calc(100vw - env(titlebar-area-x, 0px) - env(titlebar-area-width, 100vw))"
const DRAG_AREAS = ".navbar, .navbar-start, .navbar-center, .navbar-end, .cc-window-drag-area"

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
        SnapshotsDialogComponent,
        BatchAnalysisDialogComponent,
        ComparisonChipComponent,
        CompareHostComponent,
        WindowControlsComponent
    ],
    hostDirectives: [PublishesHeightDirective],
    providers: [{ provide: HEIGHT_CSS_VARIABLE, useValue: "--cc-bars-height" }],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class NavBarComponent {
    private readonly fileStoreReadWindow = inject(FileStoreReadWindow)
    private readonly export3DMapDialogStore = inject(Export3DMapDialogStore)
    private readonly projectsFacade = inject(ProjectsFacade)
    private readonly batchDialog = inject(BatchAnalysisDialogService)
    private readonly windowControls = inject(WindowControlsService)
    private readonly files = toSignal(this.fileStoreReadWindow.files$, { requireSync: true })

    isDeltaState = toSignal(this.fileStoreReadWindow.isDeltaState$, { requireSync: true })
    readonly isDesktop = this.projectsFacade.isDesktop
    readonly hasActiveProject = this.projectsFacade.hasActiveProject
    readonly hasFiles = computed(() => this.files().length > 0)
    readonly isComparing = inject(CompareFacade).isComparing
    readonly usesAppTitleBar = this.windowControls.usesAppTitleBar
    readonly drawsOwnButtons = this.windowControls.drawsOwnButtons
    readonly reservesTrafficLights = this.windowControls.reservesTrafficLights
    readonly reservesCaptionButtons = this.windowControls.reservesCaptionButtons
    readonly captionButtonsInset = CAPTION_BUTTONS_INSET

    /** Hosted here rather than in the print button, which the mode bar unmounts on mouse-out. */
    readonly isExportDialogOpen = this.export3DMapDialogStore.isDialogOpen
    readonly isSnapshotsDialogOpen = inject(SnapshotsDialogService).isOpen
    readonly isBatchDialogOpen = computed(() => this.batchDialog.current() !== null)

    openWindowMenu(event: MouseEvent) {
        const isOnDragArea = event.target instanceof Element && event.target.matches(DRAG_AREAS)
        if (!this.drawsOwnButtons() || !isOnDragArea) {
            return
        }
        event.preventDefault()
        this.windowControls.openMenu({ x: event.clientX, y: event.clientY })
    }

    closeExportDialog() {
        this.export3DMapDialogStore.closeDialog()
    }
}
