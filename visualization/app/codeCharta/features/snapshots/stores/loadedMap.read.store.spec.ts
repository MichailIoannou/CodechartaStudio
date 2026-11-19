import { TestBed } from "@angular/core/testing"
import { MemoizedSelector } from "@ngrx/store"
import { MockStore, provideMockStore } from "@ngrx/store/testing"
import type { CcState, CodeMapNode } from "../../../model/codeCharta.model"
import { pathToNodeSelector } from "../../../renderer/renderModel/renderModel.facade"
import { LoadedMapReadStore } from "./loadedMap.read.store"

describe("LoadedMapReadStore", () => {
    it("should give the nodes of the map shown now by path", () => {
        // Arrange
        const nodes = new Map([["/root/src/invoice.ts", { name: "invoice.ts" } as CodeMapNode]])
        TestBed.configureTestingModule({ providers: [provideMockStore()] })
        TestBed.inject(MockStore).overrideSelector(pathToNodeSelector as MemoizedSelector<CcState, Map<string, CodeMapNode>>, nodes)

        // Act
        const pathToNode = TestBed.inject(LoadedMapReadStore).pathToNode()

        // Assert
        expect(pathToNode).toBe(nodes)
    })
})
