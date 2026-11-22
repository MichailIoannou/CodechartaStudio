import { InstancedBufferAttribute, InstancedMesh, PerspectiveCamera, ShaderMaterial } from "three"
import { STATE, TEST_NODE_LEAF, TEST_NODE_ROOT, TEST_NODES } from "../../../mocks/dataMocks"
import { CcState, LayoutAlgorithm, Node } from "../../../model/codeCharta.model"
import { treeMapSize } from "../algorithm/treeMapLayout/treeMapHelper"
import { CodeMapBuilding } from "./codeMapBuilding"
import { CodeMapMesh } from "./codeMapMesh"
import { MAP_BASE_DEPTH } from "./mapBase"

describe("codeMapMesh", () => {
    const testNodes: Node[] = [TEST_NODE_ROOT] // no need for 2 files

    describe("canUpdateInPlace", () => {
        it("should allow an in-place update for the same buildings in the same order", () => {
            // Arrange
            const mesh = new CodeMapMesh([TEST_NODE_ROOT], STATE, false)

            // Act
            const canUpdate = mesh.canUpdateInPlace([{ ...TEST_NODE_ROOT }])

            // Assert
            expect(canUpdate).toBe(true)
        })

        it("should refuse an in-place update when a building was added", () => {
            // Arrange
            const mesh = new CodeMapMesh([TEST_NODE_ROOT], STATE, false)

            // Act
            const canUpdate = mesh.canUpdateInPlace([TEST_NODE_ROOT, { ...TEST_NODE_ROOT, path: "/root/other" } as Node])

            // Assert
            expect(canUpdate).toBe(false)
        })

        it("should refuse an in-place update when a building was replaced by another", () => {
            // Arrange
            const mesh = new CodeMapMesh([TEST_NODE_ROOT], STATE, false)

            // Act
            const canUpdate = mesh.canUpdateInPlace([{ ...TEST_NODE_ROOT, path: "/root/somewhere-else" } as Node])

            // Assert
            expect(canUpdate).toBe(false)
        })
    })

    describe("setNewDeltaColor", () => {
        let codeMapBuilding: CodeMapBuilding
        const {
            mapState: { mapColors }
        } = STATE

        const setFlattened = (isFlat: boolean) => {
            for (const node of testNodes) {
                node.flat = isFlat
            }
        }

        const rebuildMesh = () => {
            const codedMapMesh = new CodeMapMesh([TEST_NODE_ROOT], STATE, true)
            codeMapBuilding = codedMapMesh.getBuildingByPath(TEST_NODE_ROOT.path)
        }

        it("should not set flat color when not flat", () => {
            setFlattened(false)
            rebuildMesh()

            expect(testNodes[0].flat).toBeFalsy()
            expect(codeMapBuilding.deltaColor).not.toEqual(mapColors.flat)
        })

        it("should set flat color when flat", () => {
            setFlattened(true)
            rebuildMesh()

            expect(testNodes[0].flat).toBeTruthy()
            expect(codeMapBuilding.deltaColor).toEqual(mapColors.flat)
        })
    })

    describe("differential highlight", () => {
        it("should use the differential update path on second highlightBuilding call", () => {
            // Arrange
            const mesh = new CodeMapMesh([TEST_NODE_ROOT], STATE, false)
            const buildings = mesh.getMeshDescription().buildings
            const ids = new Set([buildings[0].id])
            mesh.highlightBuilding(ids, buildings[0], null, STATE, new Map())

            // Spy after the first call so only the second call is tracked
            const updateHighlightedSpy = jest.spyOn(mesh as any, "updateHighlightedBuildings")
            const updateAllSpy = jest.spyOn(mesh as any, "updateAllBuildings")

            // Act — second call with same state should take the differential path
            mesh.highlightBuilding(ids, buildings[0], null, STATE, new Map())

            // Assert — differential helper called, full-rebuild skipped
            expect(updateHighlightedSpy).toHaveBeenCalledTimes(1)
            expect(updateAllSpy).not.toHaveBeenCalled()
        })

        it("should paint everything anew in grey once a highlight greys the buildings outside it", () => {
            // Arrange
            const mesh = new CodeMapMesh([TEST_NODE_ROOT], STATE, false)
            const buildings = mesh.getMeshDescription().buildings
            const ids = new Set([buildings[0].id])
            mesh.highlightBuilding(ids, buildings[0], null, STATE, new Map())
            const updateAllSpy = jest.spyOn(mesh as any, "updateAllBuildings")

            // Act
            mesh.setGreysOutsideHighlight(true)
            mesh.highlightBuilding(ids, buildings[0], null, STATE, new Map())

            // Assert
            expect(updateAllSpy).toHaveBeenCalledTimes(1)
        })

        it("should reset _prevHighlightedIds when clearing unselected buildings", () => {
            // Arrange
            const mesh = new CodeMapMesh([TEST_NODE_ROOT], STATE, false)
            const buildings = mesh.getMeshDescription().buildings
            const ids = new Set([buildings[0].id])
            mesh.highlightBuilding(ids, buildings[0], null, STATE, new Map())

            // Act
            mesh.clearUnselectedBuildings(null)

            // Assert
            expect(mesh["_prevHighlightedIds"]).toBeNull()
        })

        it("should reset _prevIsPresentationMode when clearing unselected buildings", () => {
            // Arrange
            const mesh = new CodeMapMesh([TEST_NODE_ROOT], STATE, false)
            const buildings = mesh.getMeshDescription().buildings
            mesh.highlightBuilding(new Set([buildings[0].id]), buildings[0], null, STATE, new Map())

            // Act
            mesh.clearUnselectedBuildings(null)

            // Assert
            expect(mesh["_prevIsPresentationMode"]).toBeNull()
        })

        it("should force full re-render when isPresentationMode is toggled mid-hover", () => {
            // Arrange
            const mesh = new CodeMapMesh([TEST_NODE_ROOT], STATE, false)
            const buildings = mesh.getMeshDescription().buildings
            const ids = new Set([buildings[0].id])

            const stateNormal: CcState = { ...STATE, preferences: { ...STATE.preferences, isPresentationMode: false } }
            const statePresentation: CcState = { ...STATE, preferences: { ...STATE.preferences, isPresentationMode: true } }

            // First call with presentation mode off — establishes _prevHighlightedIds
            mesh.highlightBuilding(ids, buildings[0], null, stateNormal, new Map())
            expect(mesh["_prevHighlightedIds"]).not.toBeNull()

            // Act: toggle presentation mode on — should force full re-render path by clearing _prevHighlightedIds
            // Spy on updateAllBuildings to confirm it is called (full-render path)
            const updateAllSpy = jest.spyOn(mesh as any, "updateAllBuildings")
            mesh.highlightBuilding(ids, buildings[0], null, statePresentation, new Map())

            // Assert: _prevHighlightedIds was cleared before taking the full path
            expect(updateAllSpy).toHaveBeenCalledTimes(1)
            // After the call, _prevHighlightedIds is re-populated and mode is recorded
            expect(mesh["_prevHighlightedIds"]).toEqual(ids)
            expect(mesh["_prevIsPresentationMode"]).toBe(true)

            updateAllSpy.mockRestore()
        })

        it("should force full re-render when isPresentationMode is toggled off mid-hover", () => {
            // Arrange
            const mesh = new CodeMapMesh([TEST_NODE_ROOT], STATE, false)
            const buildings = mesh.getMeshDescription().buildings
            const ids = new Set([buildings[0].id])

            const statePresentation: CcState = { ...STATE, preferences: { ...STATE.preferences, isPresentationMode: true } }
            const stateNormal: CcState = { ...STATE, preferences: { ...STATE.preferences, isPresentationMode: false } }

            // First call in presentation mode
            mesh.highlightBuilding(ids, buildings[0], null, statePresentation, new Map())
            expect(mesh["_prevIsPresentationMode"]).toBe(true)

            // Act: toggle presentation mode off
            const updateAllSpy = jest.spyOn(mesh as any, "updateAllBuildings")
            mesh.highlightBuilding(ids, buildings[0], null, stateNormal, new Map())

            // Assert: full re-render path was taken even though prev exists
            expect(updateAllSpy).toHaveBeenCalledTimes(1)
            expect(mesh["_prevIsPresentationMode"]).toBe(false)

            updateAllSpy.mockRestore()
        })
    })

    describe("InstancedMesh", () => {
        it("should return an InstancedMesh from getThreeMesh", () => {
            // Arrange & Act
            const mesh = new CodeMapMesh([TEST_NODE_ROOT], STATE, false)

            // Assert
            expect(mesh.getThreeMesh()).toBeInstanceOf(InstancedMesh)
        })

        it("should compute vertex positions in full float precision so floors cannot cut through buildings", () => {
            // Arrange
            const mesh = new CodeMapMesh([TEST_NODE_ROOT], STATE, false)

            // Act
            const { precision } = mesh.getThreeMesh().material as ShaderMaterial

            // Assert
            expect(precision).toBe("highp")
        })

        it("should write 1 instance color entry per building instead of 24 vertices", () => {
            // Arrange
            const mesh = new CodeMapMesh([TEST_NODE_ROOT], STATE, false)
            const colorAttr = mesh.getThreeMesh().geometry.getAttribute("color") as InstancedBufferAttribute

            // Act — highlight changes color
            const buildings = mesh.getMeshDescription().buildings
            mesh.highlightBuilding(new Set([buildings[0].id]), buildings[0], null, STATE, new Map())

            // Assert — instance attribute has 1 entry per building (not 24)
            expect(colorAttr.count).toBe(1)
        })
    })

    describe("selectBuilding / clearSelection", () => {
        it("should apply the given color to a building on selectBuilding", () => {
            // Arrange
            const mesh = new CodeMapMesh([TEST_NODE_ROOT], STATE, false)
            const building = mesh.getMeshDescription().buildings[0]
            const color = "#aabbcc"

            // Act
            mesh.selectBuilding(building, color)

            // Assert
            expect(building.color).toBe(color)
            expect(building.deltaColor).toBe(color)
        })

        it("should reset color to default on clearSelection", () => {
            // Arrange
            const mesh = new CodeMapMesh([TEST_NODE_ROOT], STATE, false)
            const building = mesh.getMeshDescription().buildings[0]
            const originalColor = building.color
            mesh.selectBuilding(building, "#aabbcc")

            // Act
            mesh.clearSelection(building)

            // Assert
            expect(building.color).toBe(originalColor)
        })

        it("should keep the incremental highlight cache on selectBuilding instead of forcing a full repaint", () => {
            // Arrange
            const mesh = new CodeMapMesh([TEST_NODE_ROOT], STATE, false)
            const building = mesh.getMeshDescription().buildings[0]
            mesh.highlightBuilding(new Set([building.id]), building, null, STATE, new Map())
            expect(mesh["_prevHighlightedIds"]).not.toBeNull()

            // Act
            mesh.selectBuilding(building, "#aabbcc")

            // Assert
            expect(mesh["_prevHighlightedIds"]).not.toBeNull()
        })

        it("should keep the freshly selected building queued for upload after the same-frame highlight pass", () => {
            // Arrange — multi-building mesh; renders are debounced, so a whole selection runs before one upload
            const mesh = new CodeMapMesh(TEST_NODES, STATE, false)
            const buildings = mesh.getMeshDescription().buildings
            const selected = buildings[0]
            const other = buildings[buildings.length - 1]
            const colorAttribute = mesh.getThreeMesh().geometry.getAttribute("color") as InstancedBufferAttribute
            const NUMBER_OF_COLOR_FIELDS = 3
            // three.js clears updateRanges only after a real GPU upload (none here), so the array reflects
            // everything accumulated during this frame.
            colorAttribute.clearUpdateRanges()

            // Act — the ThreeSceneService.selectBuilding sequence within one debounced frame
            mesh.selectBuilding(selected, "#ff8b27")
            mesh.highlightBuilding(new Set([other.id]), other, selected, STATE, new Map())

            // Assert — the selected building's color element is still inside a pending update range
            const start = selected.id * NUMBER_OF_COLOR_FIELDS
            const isCovered = colorAttribute.updateRanges.some(range => start >= range.start && start < range.start + range.count)
            expect(isCovered).toBe(true)
        })

        it("should repaint the formerly selected building on the next highlight pass after the selection changes", () => {
            // Arrange
            const mesh = new CodeMapMesh([TEST_NODE_ROOT], STATE, false)
            const building = mesh.getMeshDescription().buildings[0]
            const colorAttr = mesh.getThreeMesh().geometry.getAttribute("color") as InstancedBufferAttribute
            mesh.highlightBuilding(new Set([building.id]), building, building, STATE, new Map())
            mesh.selectBuilding(building, "#aabbcc")
            mesh.highlightBuilding(new Set([building.id]), building, building, STATE, new Map())
            const selectedColor = [colorAttr.getX(building.id), colorAttr.getY(building.id), colorAttr.getZ(building.id)]

            // Act — deselect, then run a highlight pass without the selection
            mesh.clearSelection(building)
            mesh.highlightBuilding(new Set([building.id]), building, null, STATE, new Map())

            // Assert — the building no longer carries the selection color
            const repaintedColor = [colorAttr.getX(building.id), colorAttr.getY(building.id), colorAttr.getZ(building.id)]
            expect(repaintedColor).not.toEqual(selectedColor)
        })
    })

    describe("setScale", () => {
        it("should delegate to mapGeomDesc without throwing", () => {
            // Arrange
            const mesh = new CodeMapMesh([TEST_NODE_ROOT], STATE, false)

            // Act & Assert
            expect(() => mesh.setScale({ x: 2, y: 3, z: 1.5 })).not.toThrow()
        })
    })

    describe("getNodes", () => {
        it("should return the nodes passed to the constructor", () => {
            // Arrange
            const mesh = new CodeMapMesh([TEST_NODE_ROOT], STATE, false)

            // Act & Assert
            expect(mesh.getNodes()).toContain(TEST_NODE_ROOT)
        })
    })

    describe("dispose", () => {
        it("should not throw when disposing mesh and material", () => {
            // Arrange
            const mesh = new CodeMapMesh([TEST_NODE_ROOT], STATE, false)

            // Act & Assert
            expect(() => mesh.dispose()).not.toThrow()
        })
    })

    describe("toExportMesh", () => {
        it("should return a standard Mesh with expanded per-vertex data", () => {
            // Arrange
            const mesh = new CodeMapMesh([TEST_NODE_ROOT], STATE, false)

            // Act
            const exportMesh = mesh.toExportMesh()

            // Assert
            expect(exportMesh.geometry.getAttribute("position")).toBeDefined()
            expect(exportMesh.geometry.getAttribute("color")).toBeDefined()
            expect(exportMesh.geometry.index).toBeDefined()
            // 1 building = 24 vertices
            expect(exportMesh.geometry.getAttribute("position").count).toBe(24)
            // 1 building = 30 indices (5 visible faces × 6)
            expect(exportMesh.geometry.index.count).toBe(30)
        })

        it("should expand colors to 24 vertices per building", () => {
            // Arrange
            const mesh = new CodeMapMesh([TEST_NODE_ROOT], STATE, false)

            // Act
            const exportMesh = mesh.toExportMesh()
            const colorAttr = exportMesh.geometry.getAttribute("color")

            // Assert — all 24 vertices should have the same color
            const firstR = colorAttr.getX(0)
            const firstG = colorAttr.getY(0)
            const firstB = colorAttr.getZ(0)
            for (let i = 1; i < 24; i++) {
                expect(colorAttr.getX(i)).toBe(firstR)
                expect(colorAttr.getY(i)).toBe(firstG)
                expect(colorAttr.getZ(i)).toBe(firstB)
            }
        })
    })
    describe("map base", () => {
        const rootFloor: Node = { ...TEST_NODE_ROOT, isLeaf: false, depth: 0, x0: 0, y0: 0, z0: 0, width: 100, length: 100, height: 2 }
        const building: Node = { ...TEST_NODE_LEAF, x0: 10, y0: 10, z0: 2, width: 5, length: 5, height: 20 }
        const stateWithLayout = (layoutAlgorithm: LayoutAlgorithm): CcState => ({
            ...STATE,
            mapState: { ...STATE.mapState, layoutAlgorithm }
        })
        const mapOffset = treeMapSize
        const baseDepthOf = (mesh: CodeMapMesh) => (mesh.getThreeMesh().material as ShaderMaterial).uniforms.mapBaseDepth.value

        it("should let the root floor reach below the ground by the base depth in the treemap layout", () => {
            // Arrange & Act
            const mesh = new CodeMapMesh([rootFloor, building], stateWithLayout(LayoutAlgorithm.SquarifiedTreeMap), false)

            // Assert
            expect(baseDepthOf(mesh)).toBe(MAP_BASE_DEPTH)
        })

        it("should keep the street layouts on the ground, where streets and houses stand as well", () => {
            // Arrange & Act
            const streetMesh = new CodeMapMesh([rootFloor, building], stateWithLayout(LayoutAlgorithm.StreetMap), false)
            const hybridMesh = new CodeMapMesh([rootFloor, building], stateWithLayout(LayoutAlgorithm.TreeMapStreet), false)

            // Assert
            expect(baseDepthOf(streetMesh)).toBe(0)
            expect(baseDepthOf(hybridMesh)).toBe(0)
        })

        it("should follow a layout switch that reuses the buffers", () => {
            // Arrange
            const mesh = new CodeMapMesh([rootFloor, building], stateWithLayout(LayoutAlgorithm.SquarifiedTreeMap), false)

            // Act
            mesh.updateBuildings([rootFloor, building], stateWithLayout(LayoutAlgorithm.StreetMap), false)

            // Assert
            expect(baseDepthOf(mesh)).toBe(0)
            expect(mesh.getThreeMesh().boundingBox.min.y).toBe(0)
        })

        it("should include the base in its bounding box so fitting the camera keeps the base in view", () => {
            // Arrange & Act
            const mesh = new CodeMapMesh([rootFloor, building], stateWithLayout(LayoutAlgorithm.SquarifiedTreeMap), false)

            // Assert
            expect(mesh.getThreeMesh().boundingBox.min.y).toBe(-MAP_BASE_DEPTH)
            expect(mesh.getThreeMesh().boundingBox.max.y).toBe(22)
        })

        it("should pick the root floor when the pointer is on the base below the ground", () => {
            // Arrange
            const mesh = new CodeMapMesh([rootFloor, building], stateWithLayout(LayoutAlgorithm.SquarifiedTreeMap), false)
            mesh.setScale({ x: 1, y: 1, z: 1 })
            const camera = new PerspectiveCamera(45, 1, 1, 10_000)
            camera.position.set(-mapOffset + 50, -MAP_BASE_DEPTH / 2, 1000)
            camera.lookAt(-mapOffset + 50, -MAP_BASE_DEPTH / 2, 0)
            camera.updateMatrixWorld()

            // Act
            const picked = mesh.checkMouseRayMeshIntersection({ x: 0, y: 0 }, camera)

            // Assert
            expect(picked?.node.path).toBe(rootFloor.path)
        })

        it("should leave the exported geometry without the base, since a 3D print adds a base plate of its own", () => {
            // Arrange
            const mesh = new CodeMapMesh([rootFloor, building], stateWithLayout(LayoutAlgorithm.SquarifiedTreeMap), false)

            // Act
            const positions = mesh.toExportMesh().geometry.getAttribute("position")

            // Assert
            const lowestY = Math.min(...Array.from({ length: positions.count }, (_, index) => positions.getY(index)))
            expect(lowestY).toBe(0)
        })
    })
})
