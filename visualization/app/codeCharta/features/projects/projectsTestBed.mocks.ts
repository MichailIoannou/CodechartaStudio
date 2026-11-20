import type { Provider } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { Router } from "@angular/router"
import { Subject } from "rxjs"
import { LoadFilesUseCase, ProjectSnapshotToLoad } from "../../load/load.facade"
import { createFakeDesktopBridge, FakeDesktopBridge, FakeDesktopSeed } from "../../util/desktop/desktopBridge.mocks"
import { DESKTOP_BRIDGE } from "../../util/desktop/desktopBridge.token"
import { ToastService } from "../shared/facade"
import { ProjectsService } from "./services/projects.service"

export interface ProjectsTestBed {
    bridge: FakeDesktopBridge
    projects: ProjectsService
    loadFilesUseCase: { loadProjectSnapshots: jest.Mock; unloadAllFiles: jest.Mock; showSampleFiles: jest.Mock }
    toastService: { show: jest.Mock }
    router: { navigateByUrl: jest.Mock; events: Subject<unknown>; url: string }
    requestsOf(method: string): unknown[]
}

export async function setUpProjects(
    seed: FakeDesktopSeed,
    { initialise = true, providers = [] as Provider[] } = {}
): Promise<ProjectsTestBed> {
    const bridge = createFakeDesktopBridge(seed)
    const loadFilesUseCase = {
        loadProjectSnapshots: jest.fn().mockImplementation((toLoad: ProjectSnapshotToLoad[]) =>
            Promise.resolve({
                loaded: toLoad.map(({ origin }) => ({ origin, checksum: "c0ffee", rootName: "root" })),
                identicalContent: [],
                unreadable: []
            })
        ),
        unloadAllFiles: jest.fn(),
        showSampleFiles: jest.fn()
    }
    const toastService = { show: jest.fn() }
    const router = { navigateByUrl: jest.fn().mockResolvedValue(true), events: new Subject<unknown>(), url: "/" }
    TestBed.configureTestingModule({
        providers: [
            { provide: DESKTOP_BRIDGE, useValue: bridge },
            { provide: LoadFilesUseCase, useValue: loadFilesUseCase },
            { provide: ToastService, useValue: toastService },
            { provide: Router, useValue: router },
            ...providers
        ]
    })
    const projects = TestBed.inject(ProjectsService)
    if (initialise) {
        await projects.initialise()
    }
    const requestsOf = (method: string) =>
        bridge.calls.filter(call => call.name === "request" && call.args[0] === method).map(call => call.args[1])
    return { bridge, projects, loadFilesUseCase, toastService, router, requestsOf }
}

export async function settle(): Promise<void> {
    for (let round = 0; round < 3; round++) {
        await new Promise(resolve => setTimeout(resolve))
        TestBed.tick()
    }
}
