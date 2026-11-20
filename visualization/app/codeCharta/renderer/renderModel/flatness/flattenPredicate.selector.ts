import { createSelector } from "@ngrx/store"
import { CodeMapNode } from "../../../model/codeCharta.model"
import {
    changedFilesFilterSelector,
    flattenMatcherSelector,
    flattenMetricRulesSelector
} from "../../../stores/sharedView/sharedView.read.facade"
import { isLeaf } from "../../../util/codeMapHelper"
import { createMetricRuleMatcher } from "../../../util/metricRule/metricRuleMatcher"
import { createChangedFilesMatcher } from "../../../util/nodeRules/changedFilesMatcher"
import { nodeMetricDataSelector } from "../nodeMetricData/nodeMetricData.selector"

export type FlattenPredicate = (node: CodeMapNode) => boolean

/**
 * Whether the map draws a node short and grey. Unlike exclusion this is answered while the map is
 * laid out rather than while it is decorated, because flattening changes how a subtree looks and
 * never which nodes the map holds — so it must not rebuild the decorated tree.
 */
export const flattenPredicateSelector = createSelector(
    flattenMatcherSelector,
    flattenMetricRulesSelector,
    nodeMetricDataSelector,
    changedFilesFilterSelector,
    (flattenMatcher, flattenMetricRules, nodeMetricData, changedFilesFilter): FlattenPredicate => {
        const metricsOnMap = new Set(nodeMetricData.map(({ name }) => name))
        const metricRuleMatcher = createMetricRuleMatcher(flattenMetricRules, metricsOnMap)
        const isUnchanged = createChangedFilesMatcher(changedFilesFilter)
        return node =>
            flattenMatcher.isFlattened(node.path) || (isLeaf(node) && (metricRuleMatcher.matches(node.attributes) || isUnchanged(node)))
    }
)
