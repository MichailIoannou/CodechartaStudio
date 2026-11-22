import { ChangeDetectionStrategy, Component, ElementRef, inject, viewChild } from "@angular/core"
import { toSignal } from "@angular/core/rxjs-interop"
import { MapStateReadWindow } from "../../../../stores/mapState/mapState.read.facade"
import { PreferencesReadWindow } from "../../../../stores/preferences/preferences.read.facade"
import { DesktopEnvironment } from "../../../../util/desktop/desktopEnvironment.service"
import { DesktopToolsPanelComponent } from "../../../desktopTools/facade"
import { canOpenFoldersHere } from "../../../localSource/facade"
import { ThemePickerComponent } from "../../../theme/facade"
import { GlobalConfigurationTarget } from "../../globalConfigurationTarget"
import { GlobalSettingsWriteStore } from "../../stores/globalSettings.write.store"
import { ExternalLinksComponent } from "./externalLinks/externalLinks.component"
import { ResetFiltersButtonComponent } from "./resetFiltersButton/resetFiltersButton.component"
import { ResetMapButtonComponent } from "./resetMapButton/resetMapButton.component"
import { ResetSettingsButtonComponent } from "./resetSettingsButton/resetSettingsButton.component"
import { SettingToggleComponent } from "./settingToggle/settingToggle.component"
import { WindowTitleBarSettingComponent } from "./windowTitleBarSetting/windowTitleBarSetting.component"

@Component({
    selector: "cc-global-configuration-dialog",
    templateUrl: "./globalConfigurationDialog.component.html",
    imports: [
        ResetFiltersButtonComponent,
        ResetMapButtonComponent,
        ResetSettingsButtonComponent,
        SettingToggleComponent,
        ExternalLinksComponent,
        ThemePickerComponent,
        DesktopToolsPanelComponent,
        WindowTitleBarSettingComponent
    ],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class GlobalConfigurationDialogComponent {
    private readonly preferencesReadWindow = inject(PreferencesReadWindow)
    private readonly mapStateReadWindow = inject(MapStateReadWindow)
    private readonly globalSettingsWriteStore = inject(GlobalSettingsWriteStore)

    dialogElement = viewChild.required<ElementRef<HTMLDialogElement>>("dialog")
    private readonly desktopToolsPanel = viewChild(DesktopToolsPanelComponent)

    screenshotToClipboardEnabled = toSignal(this.preferencesReadWindow.screenshotToClipboardEnabled$, {
        requireSync: true
    })
    readonly canOpenLocalFolders = canOpenFoldersHere()
    readonly isDesktop = inject(DesktopEnvironment).isDesktop
    localSourceEnabled = toSignal(this.preferencesReadWindow.localSourceEnabled$, { requireSync: true })
    isWhiteBackground = toSignal(this.mapStateReadWindow.isWhiteBackground$, { requireSync: true })
    hideFlatBuildings = toSignal(this.mapStateReadWindow.hideFlatBuildings$, { requireSync: true })
    resetCameraIfNewFileIsLoaded = toSignal(this.preferencesReadWindow.resetCameraIfNewFileIsLoaded$, {
        requireSync: true
    })

    open(target?: GlobalConfigurationTarget) {
        this.dialogElement().nativeElement.showModal()
        if (target?.section === "desktopTools") {
            this.desktopToolsPanel()?.reveal(target.tool)
        }
    }

    close() {
        this.dialogElement().nativeElement.close()
    }

    handleResetCameraIfNewFileIsLoadedChanged(checked: boolean) {
        this.globalSettingsWriteStore.setResetCameraIfNewFileIsLoaded(checked)
    }

    handleHideFlatBuildingsChanged(checked: boolean) {
        this.globalSettingsWriteStore.setHideFlatBuildings(checked)
    }

    handleIsWhiteBackgroundChanged(checked: boolean) {
        this.globalSettingsWriteStore.setWhiteBackground(checked)
    }

    handleScreenshotToClipboardEnabledChanged(checked: boolean) {
        this.globalSettingsWriteStore.setScreenshotToClipboard(checked)
    }

    handleLocalSourceEnabledChanged(checked: boolean) {
        this.globalSettingsWriteStore.setLocalSourceEnabled(checked)
    }
}
