import { RadialFolderStyle } from "../../../../model/codeCharta.model"
import { defaultState } from "../../../rootStore/state.manager"
import { isRadialFolderNeutralSelector } from "../radialFolderStyle/radialFolderStyle.selector"
import { radialFolderSwatchInputsSelector } from "./radialFolderSwatch.selector"

const MAP_COLORS = defaultState.mapState.mapColors

describe("radialFolderSwatchInputsSelector", () => {
    it("should hand over what the swatch is drawn from, so a theme change can redraw it", () => {
        // Act
        const inputs = radialFolderSwatchInputsSelector.projector(MAP_COLORS, RadialFolderStyle.Tinted, 0.5)

        // Assert
        expect(inputs).toEqual({ mapColors: MAP_COLORS, style: RadialFolderStyle.Tinted, tint: 0.5 })
    })
})

describe("isRadialFolderNeutralSelector", () => {
    it("should tell neutral folders from tinted ones", () => {
        // Act
        const results = [RadialFolderStyle.Neutral, RadialFolderStyle.Tinted].map(style => isRadialFolderNeutralSelector.projector(style))

        // Assert
        expect(results).toEqual([true, false])
    })
})
