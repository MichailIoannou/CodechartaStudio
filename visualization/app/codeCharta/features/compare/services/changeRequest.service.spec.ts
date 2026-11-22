import { TestBed } from "@angular/core/testing"
import { provideRouter } from "@angular/router"
import { StoreModule } from "@ngrx/store"
import { appReducers, setStateMiddleware } from "../../../stores/rootStore/store"
import { DesktopBridgeError } from "../../../util/desktop/desktopResult"
import type { ComparedChangeRequest } from "../model/compare.model"
import { ANALYSIS_GATEWAY, CORE_GATEWAY, HOSTING_GATEWAY, SNAPSHOT_GATEWAY } from "../ports/compareGateways"
import {
    FakeAnalysisGateway,
    FakeCoreGateway,
    FakeHostingGateway,
    FakeSnapshotGateway,
    FOLDER,
    HEAD_SHA
} from "../ports/compareGateways.mocks"
import { CompareStore } from "../stores/compare.store"
import { ChangeRequestService } from "./changeRequest.service"
import { CompareService } from "./compare.service"

const REQUEST: ComparedChangeRequest = {
    folder: FOLDER,
    provider: "github",
    number: 7,
    remote: "origin",
    baseRefName: "main",
    url: "https://github.com/mia/billing/pull/7"
}
const headNotLocal = () => new DesktopBridgeError({ code: "HEAD_NOT_LOCAL", message: "The head of #7 is not local.", details: {} })

describe("ChangeRequestService", () => {
    let core: FakeCoreGateway
    let hosting: FakeHostingGateway
    let compareStore: CompareStore
    let service: ChangeRequestService

    beforeEach(() => {
        core = new FakeCoreGateway()
        hosting = new FakeHostingGateway()
        TestBed.configureTestingModule({
            imports: [StoreModule.forRoot(appReducers, { metaReducers: [setStateMiddleware] })],
            providers: [
                provideRouter([]),
                { provide: SNAPSHOT_GATEWAY, useValue: new FakeSnapshotGateway() },
                { provide: CORE_GATEWAY, useValue: core },
                { provide: ANALYSIS_GATEWAY, useValue: new FakeAnalysisGateway() },
                { provide: HOSTING_GATEWAY, useValue: hosting }
            ]
        })
        compareStore = TestBed.inject(CompareStore)
        service = TestBed.inject(ChangeRequestService)
    })

    const flush = () => new Promise(resolve => setTimeout(resolve))

    it("should ask to fetch a head that is not local", async () => {
        // Arrange
        core.resolution = headNotLocal()
        const intent = { ...changeRequestIntentOf(REQUEST), headCommit: null }

        // Act
        await TestBed.inject(CompareService).start(intent, REQUEST)

        // Assert
        expect(compareStore.state().phase).toBe("headNotLocal")
        expect(compareStore.state().changeRequest).toEqual(REQUEST)
    })

    it("should fail as usual when a head is missing without a request to fetch it for", async () => {
        // Arrange
        core.resolution = headNotLocal()

        // Act
        await TestBed.inject(CompareService).start(changeRequestIntentOf(REQUEST))

        // Assert
        expect(compareStore.state().phase).toBe("failed")
    })

    it("should fetch the head when opened by number and re-resolve with the fetched commit", async () => {
        // Arrange
        const opening = service.openByNumber(REQUEST)
        const phaseWhileFetching = compareStore.state().phase

        // Act
        hosting.finishFetch(HEAD_SHA)
        await opening

        // Assert
        expect(phaseWhileFetching).toBe("fetchingHead")
        expect(hosting.fetches.map(fetch => fetch.params)).toEqual([{ folder: FOLDER, remote: "origin", provider: "github", number: 7 }])
        expect(core.intents).toEqual([{ ...changeRequestIntentOf(REQUEST), headCommit: HEAD_SHA }])
        expect(compareStore.state().changeRequest).toEqual(REQUEST)
    })

    it("should go back to the fetch offer when the fetch is cancelled", async () => {
        // Arrange
        const opening = service.openByNumber(REQUEST)

        // Act
        await service.cancelFetch()
        await opening

        // Assert
        expect(hosting.cancelled).toEqual([hosting.fetches[0].operationId])
        expect(compareStore.state().phase).toBe("headNotLocal")
        expect(core.intents).toEqual([])
    })

    it("should say when the remote has no such pull request", async () => {
        // Arrange
        const opening = service.openByNumber(REQUEST)

        // Act
        hosting.failFetch(new DesktopBridgeError({ code: "REF_NOT_ON_REMOTE", message: "no ref", details: {} }))
        await opening

        // Assert
        expect(compareStore.state().phase).toBe("failed")
        expect(compareStore.state().error?.message).toBe("'origin' has no pull request #7.")
    })

    it("should fetch again from the fetch offer", async () => {
        // Arrange
        compareStore.update({ phase: "headNotLocal", changeRequest: { ...REQUEST, provider: "gitlab" } })

        // Act
        const fetching = service.fetchHeadAndCompare()
        hosting.failFetch(new Error("network down"))
        await fetching
        await flush()

        // Assert
        expect(compareStore.state().error?.message).toBe("!7 could not be fetched: network down")
    })

    it("should list the branches a request can target and none when git fails", async () => {
        // Arrange
        const listed = await service.baseBranchesOf(FOLDER)
        jest.spyOn(core, "branchNames").mockRejectedValue(new Error("git failed"))

        // Act
        const afterFailure = await service.baseBranchesOf(FOLDER)

        // Assert
        expect(listed).toEqual(["main", "feature/x"])
        expect(afterFailure).toEqual([])
    })
})

function changeRequestIntentOf({ folder, provider, number, remote, baseRefName }: ComparedChangeRequest) {
    return {
        kind: "changeRequest" as const,
        folder,
        provider,
        number,
        remote,
        baseRefName,
        baseCommit: null,
        headCommit: null as string | null,
        mergeCommit: null
    }
}
