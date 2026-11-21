import { MeshLambertMaterial } from "three"
import { activeRenderPalette } from "../../util/theme/activeTheme"

const themedCubeMaterial = () => new MeshLambertMaterial({ color: activeRenderPalette().viewCube.face })

export const getBaseMaterialEdge = themedCubeMaterial
export const getBaseMaterialFace = themedCubeMaterial
export const getBaseMaterialVertices = themedCubeMaterial
