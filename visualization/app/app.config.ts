import { LocationStrategy } from "@angular/common"
import { provideHttpClient, withInterceptorsFromDi, withXhr } from "@angular/common/http"
import { APP_INITIALIZER, ApplicationConfig, inject } from "@angular/core"
import { provideRouter, RouteReuseStrategy, Routes } from "@angular/router"
import { provideEffects } from "@ngrx/effects"
import { provideStore } from "@ngrx/store"
import { ChangelogFacade } from "app/codeCharta/features/changelog/facade"
import { codeMapEffects } from "app/codeCharta/features/codeMap/effects/codeMap.effects"
import { fileExtensionBarEffects } from "app/codeCharta/features/fileExtensionBar/effects/fileExtensionBar.effects"
import { WORKING_FOLDER_SOURCE } from "app/codeCharta/features/gitHistory/facade"
import { labelSettingsEffects } from "app/codeCharta/features/labelSettings/effects/labelSettings.effects"
import { localSourceEffects } from "app/codeCharta/features/localSource/effects/localSource.effects"
import { mapExplorerEffects } from "app/codeCharta/features/mapExplorer/effects/mapExplorer.effects"
import { metricsBarEffects } from "app/codeCharta/features/metricsBar/effects/metricsBar.effects"
import { navBarEffects } from "app/codeCharta/features/navBar/effects/navBar.effects"
import { ProjectsFacade } from "app/codeCharta/features/projects/facade"
import { sharedEffects } from "app/codeCharta/features/shared/effects/shared.effects"
import { provideSnapshotsForGitHistory } from "app/codeCharta/features/snapshots/facade"
import { themeEffects } from "app/codeCharta/features/theme/effects/theme.effects"
import { loadEffects } from "app/codeCharta/load/effects/load.effects"
import { CloseDialogsOfLeftViewEffect } from "app/codeCharta/routing/closeDialogsOfLeftView.effect"
import { KeepAliveRouteReuseStrategy } from "app/codeCharta/routing/keepAliveRouteReuse.strategy"
import { projectRoutePath } from "app/codeCharta/routing/projectRoute"
import { QueryPreservingHashLocationStrategy } from "app/codeCharta/routing/queryPreservingHashLocation.strategy"
import { routePaths } from "app/codeCharta/routing/routePaths"
import { showSpinnerBeforeBuildingView } from "app/codeCharta/routing/showSpinnerBeforeBuildingView.guard"
import { appReducers, setStateMiddleware } from "app/codeCharta/stores/rootStore/store"
import { DesktopEnvironment } from "app/codeCharta/util/desktop/desktopEnvironment.service"
import { domainViewEffects } from "app/codeCharta/views/domainView/effects/domainView.effects"
import { MetricsViewComponent } from "app/codeCharta/views/metricsView/metricsView.component"

export const routes: Routes = [
    { path: routePaths.metrics, component: MetricsViewComponent, canActivate: [showSpinnerBeforeBuildingView] },
    // Lazy: the domain and dependency views are all that pull in echarts, which no metric-view user needs.
    {
        path: routePaths.domain,
        canActivate: [showSpinnerBeforeBuildingView],
        loadComponent: () => import("app/codeCharta/views/domainView/domainView.component").then(m => m.DomainViewComponent)
    },
    {
        path: routePaths.dependencies,
        canActivate: [showSpinnerBeforeBuildingView],
        loadComponent: () => import("app/codeCharta/views/dependencyView/dependencyView.component").then(m => m.DependencyViewComponent)
    },
    {
        path: routePaths.history,
        loadComponent: () => import("app/codeCharta/views/historyView/historyView.component").then(m => m.HistoryViewComponent)
    },
    {
        path: projectRoutePath,
        canMatch: [() => inject(DesktopEnvironment).isDesktop()],
        loadComponent: () => import("app/codeCharta/features/projects/facade").then(m => m.ProjectOverviewComponent)
    }
]

export const locationStrategyProvider = { provide: LocationStrategy, useClass: QueryPreservingHashLocationStrategy }

export const routerProviders = [provideRouter(routes), locationStrategyProvider] as const

export const appConfig: ApplicationConfig = {
    providers: [
        provideHttpClient(withXhr(), withInterceptorsFromDi()),

        provideStore(appReducers, { metaReducers: [setStateMiddleware] }),

        ...routerProviders,

        { provide: RouteReuseStrategy, useClass: KeepAliveRouteReuseStrategy },

        { provide: WORKING_FOLDER_SOURCE, useExisting: ProjectsFacade },
        ...provideSnapshotsForGitHistory(),

        provideEffects([
            ...codeMapEffects,
            ...metricsBarEffects,
            ...labelSettingsEffects,
            ...localSourceEffects,
            CloseDialogsOfLeftViewEffect,
            ...fileExtensionBarEffects,
            ...navBarEffects,
            ...sharedEffects,
            ...loadEffects,
            ...domainViewEffects,
            ...mapExplorerEffects,
            ...themeEffects
        ]),

        {
            provide: APP_INITIALIZER,
            useFactory: (changelogFacade: ChangelogFacade) => () => changelogFacade.synchronizeVersion(),
            deps: [ChangelogFacade],
            multi: true
        }
    ]
}
