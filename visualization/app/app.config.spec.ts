import { HashLocationStrategy, LocationStrategy } from "@angular/common"
import { TestBed } from "@angular/core/testing"
import { ProjectOverviewComponent } from "app/codeCharta/features/projects/facade"
import { projectRoutePath } from "app/codeCharta/routing/projectRoute"
import { routeLinks, routePaths } from "app/codeCharta/routing/routePaths"
import { showSpinnerBeforeBuildingView } from "app/codeCharta/routing/showSpinnerBeforeBuildingView.guard"
import { createFakeDesktopBridge } from "app/codeCharta/util/desktop/desktopBridge.mocks"
import { DESKTOP_BRIDGE } from "app/codeCharta/util/desktop/desktopBridge.token"
import { DomainViewComponent } from "app/codeCharta/views/domainView/domainView.component"
import { MetricsViewComponent } from "app/codeCharta/views/metricsView/metricsView.component"
import { routerProviders, routes } from "./app.config"

describe("app routes", () => {
    it("should render the metrics view at the default path", () => {
        // Arrange & Act
        const defaultRoute = routes.find(route => route.path === routePaths.metrics)

        // Assert
        expect(defaultRoute?.component).toBe(MetricsViewComponent)
    })

    it("should lazy load the domain view at the domain path", async () => {
        // Arrange & Act
        const domainRoute = routes.find(route => route.path === routePaths.domain)

        // Assert
        expect(domainRoute?.component).toBeUndefined()
        expect(await domainRoute?.loadComponent?.()).toBe(DomainViewComponent)
    })

    it("should show the spinner before building any of the views", () => {
        // Arrange & Act
        const viewRoutes = routes.filter(route => route.path !== projectRoutePath)

        // Assert
        expect(viewRoutes.map(route => route.canActivate)).toEqual(viewRoutes.map(() => [showSpinnerBeforeBuildingView]))
    })

    it("should lazy load the project overview only in the desktop app", async () => {
        // Arrange
        const projectRoute = routes.find(route => route.path === projectRoutePath)
        const matchesWith = (bridge: unknown) => {
            TestBed.resetTestingModule()
            TestBed.configureTestingModule({ providers: [{ provide: DESKTOP_BRIDGE, useValue: bridge }] })
            const canMatch = projectRoute?.canMatch?.[0] as () => boolean
            return TestBed.runInInjectionContext(canMatch)
        }

        // Act
        const component = await projectRoute?.loadComponent?.()

        // Assert
        expect(component).toBe(ProjectOverviewComponent)
        expect(matchesWith(null)).toBe(false)
        expect(matchesWith(createFakeDesktopBridge())).toBe(true)
    })

    it("should keep the routed path in the fragment so file and static-host entry URLs resolve", () => {
        // Arrange
        TestBed.configureTestingModule({ providers: [...routerProviders] })

        // Act
        const locationStrategy = TestBed.inject(LocationStrategy)

        // Assert
        expect(locationStrategy).toBeInstanceOf(HashLocationStrategy)
        expect(new URL(locationStrategy.prepareExternalUrl(routeLinks.domain)).hash).toBe("#/domain")
    })
})
