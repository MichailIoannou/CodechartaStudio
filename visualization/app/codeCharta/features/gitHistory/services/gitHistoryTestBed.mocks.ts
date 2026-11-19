import { computed, signal, WritableSignal } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import type { Project } from "../../../model/coreApi/Project"
import { createFakeDesktopBridge, FakeDesktopBridge, FakeDesktopSeed } from "../../../util/desktop/desktopBridge.mocks"
import { DESKTOP_BRIDGE } from "../../../util/desktop/desktopBridge.token"
import { WORKING_FOLDER_SOURCE } from "../ports/workingFolderSource.port"

export interface GitHistoryTestBed {
    bridge: FakeDesktopBridge
    activeProject: WritableSignal<Project | null>
}

/** The fake bridge plus the given project as the source of the working folder (its view's working folder). */
export function provideGitHistory(seed: FakeDesktopSeed, project: Project | null): GitHistoryTestBed {
    const bridge = createFakeDesktopBridge(seed)
    const activeProject = signal<Project | null>(project)
    const workingFolder = computed(() => {
        const current = activeProject()
        return current?.folders.find(folder => folder.id === current.view.workingFolderId) ?? null
    })
    TestBed.configureTestingModule({
        providers: [
            { provide: DESKTOP_BRIDGE, useValue: bridge },
            { provide: WORKING_FOLDER_SOURCE, useValue: { activeProject, workingFolder } }
        ]
    })
    return { bridge, activeProject }
}

export async function settleGit(): Promise<void> {
    for (let round = 0; round < 4; round++) {
        TestBed.tick()
        await new Promise(resolve => setTimeout(resolve))
    }
}
