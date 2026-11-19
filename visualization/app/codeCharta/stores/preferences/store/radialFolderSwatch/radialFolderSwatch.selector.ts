import { createSelector } from "@ngrx/store"
import { mapColorsSelector } from "../../../mapState/mapState.read.facade"
import { radialFolderStyleSelector } from "../radialFolderStyle/radialFolderStyle.selector"
import { radialFolderTintSelector } from "../radialFolderTint/radialFolderTint.selector"

export const radialFolderSwatchInputsSelector = createSelector(
    mapColorsSelector,
    radialFolderStyleSelector,
    radialFolderTintSelector,
    (mapColors, style, tint) => ({ mapColors, style, tint })
)
