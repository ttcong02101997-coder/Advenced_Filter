export interface ConditionFilter {
    kind: 'row'
    id: number
    fieldName: string
    operator: string
    value: string
    valueLabel: string
}

export interface FilterGroupModel {
    kind: 'group'
    id: number
    operator: 'and' | 'or'
    items: FilterNode[]
}

export interface RelatedFilterModel {
    kind: 'related'
    id: number
    relationshipId: string
    entityName: string
    sourceAttribute: string
    targetAttribute: string
    operator: 'contains' | 'not-contains'
    group: FilterGroupModel
}

export type FilterNode = ConditionFilter | FilterGroupModel | RelatedFilterModel

export function createCondition(id: number): ConditionFilter {
    return { kind: 'row', id, fieldName: '', operator: 'eq', value: '', valueLabel: '' }
}

export function createGroup(id: number): FilterGroupModel {
    return { kind: 'group', id, operator: 'and', items: [createCondition(0)] }
}

export function createRelatedFilter(id: number): RelatedFilterModel {
    return {
        kind: 'related',
        id,
        relationshipId: '',
        entityName: '',
        sourceAttribute: '',
        targetAttribute: '',
        operator: 'contains',
        group: createGroup(0)
    }
}

export function hasMissingConditionValue(group: FilterGroupModel): boolean {
    return group.items.some((item) => {
        if (item.kind === 'row') {
            return Boolean(item.fieldName.trim())
                && item.operator !== 'null'
                && item.operator !== 'not-null'
                && !item.value.trim()
        }

        return hasMissingConditionValue(item.kind === 'related' ? item.group : item)
    })
}

function escapeXml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;')
}

function mapConditionOperator(operator: string, rawValue: string): { operator: string; value: string } {
    const escapedWildcardValue = rawValue.replace(/([%_\[])/g, '[$1]')
    const mappings: Record<string, string> = {
        eq: 'eq',
        neq: 'ne',
        gt: 'gt',
        ge: 'ge',
        lt: 'lt',
        le: 'le',
        contains: 'like',
        'not-contains': 'not-like',
        'begins-with': 'like',
        'ends-with': 'like'
    }

    let value = rawValue
    if (operator === 'contains' || operator === 'not-contains') value = `%${escapedWildcardValue}%`
    if (operator === 'begins-with') value = `${escapedWildcardValue}%`
    if (operator === 'ends-with') value = `%${escapedWildcardValue}`
    if (value === 'true') value = '1'
    if (value === 'false') value = '0'
    if (operator === 'eq' || operator === 'neq') value = value.replace(/[{}]/g, '')

    return { operator: mappings[operator] ?? 'eq', value }
}

function serializeCondition(condition: ConditionFilter): string {
    const valuelessOperator = condition.operator === 'null' || condition.operator === 'not-null'
    if (!condition.fieldName || (!valuelessOperator && condition.value === '')) return ''

    if (valuelessOperator) {
        return `<condition attribute="${escapeXml(condition.fieldName)}" operator="${condition.operator}" />`
    }

    const mapped = mapConditionOperator(condition.operator, condition.value)
    return `<condition attribute="${escapeXml(condition.fieldName)}" operator="${mapped.operator}" value="${escapeXml(mapped.value)}" />`
}

function serializeGroup(group: FilterGroupModel): string {
    const children = group.items.map(serializeNode).filter(Boolean).join('')
    return children ? `<filter type="${group.operator}">${children}</filter>` : ''
}

function serializeRelated(related: RelatedFilterModel): string {
    if (!related.entityName || !related.sourceAttribute || !related.targetAttribute) return ''

    const filter = serializeGroup(related.group)
        || `<filter type="and"><condition attribute="${escapeXml(related.targetAttribute)}" operator="not-null" /></filter>`

    const linkType = related.operator === 'contains' ? 'any' : 'not any'
    return `<link-entity name="${escapeXml(related.entityName)}" from="${escapeXml(related.targetAttribute)}" to="${escapeXml(related.sourceAttribute)}" link-type="${linkType}">${filter}</link-entity>`
}

function serializeNode(node: FilterNode): string {
    if (node.kind === 'row') return serializeCondition(node)
    if (node.kind === 'related') return serializeRelated(node)
    return serializeGroup(node)
}

export function buildFetchXml(entityName: string, root: FilterGroupModel): string {
    if (!entityName) return ''

    const directRelated = root.items.filter((item): item is RelatedFilterModel => item.kind === 'related')
    const promotedIds = new Set(directRelated.map((related) => related.id))
    const regularItems = root.items.filter((item) => !promotedIds.has(item.id))
    const regularFilter = serializeGroup({ ...root, items: regularItems })
    const relatedXml = directRelated.map(serializeRootRelated).join('')

    return `<fetch><entity name="${escapeXml(entityName)}">${regularFilter}${relatedXml}</entity></fetch>`
}

function serializeRootRelated(related: RelatedFilterModel): string {
    if (!related.entityName || !related.sourceAttribute || !related.targetAttribute) return ''

    const filter = serializeGroup(related.group)
    if (related.operator === 'contains') {
        return `<link-entity name="${escapeXml(related.entityName)}" from="${escapeXml(related.targetAttribute)}" to="${escapeXml(related.sourceAttribute)}" link-type="inner">${filter}</link-entity>`
    }

    const alias = `related_${related.id}_${escapeXml(related.entityName)}`
    return `<link-entity name="${escapeXml(related.entityName)}" from="${escapeXml(related.targetAttribute)}" to="${escapeXml(related.sourceAttribute)}" link-type="outer" alias="${alias}" />${filter}<filter type="and"><condition entityname="${alias}" attribute="${escapeXml(related.targetAttribute)}" operator="null" /></filter>`
}

function parseConditionElement(element: Element, id: number): ConditionFilter {
    const xmlOperator = element.getAttribute('operator') ?? 'eq'
    const xmlValue = element.getAttribute('value') ?? ''
    let operator = xmlOperator
    let value = xmlValue

    if (xmlOperator === 'ne') operator = 'neq'
    if (xmlOperator === 'like' || xmlOperator === 'not-like') {
        const isNegated = xmlOperator === 'not-like'
        const hasLeadingWildcard = value.startsWith('%')
        const hasTrailingWildcard = value.endsWith('%')
        if (hasLeadingWildcard && hasTrailingWildcard) {
            operator = isNegated ? 'not-contains' : 'contains'
            value = value.slice(1, -1)
        } else if (hasTrailingWildcard) {
            operator = isNegated ? 'not-like' : 'begins-with'
            value = value.slice(0, -1)
        } else if (hasLeadingWildcard) {
            operator = isNegated ? 'not-like' : 'ends-with'
            value = value.slice(1)
        }
    }

    return {
        kind: 'row',
        id,
        fieldName: element.getAttribute('attribute') ?? '',
        operator,
        value,
        valueLabel: ''
    }
}

function parseRelatedElement(
    element: Element,
    id: number,
    forcedOperator?: RelatedFilterModel['operator']
): RelatedFilterModel {
    const entityName = element.getAttribute('name') ?? ''
    const sourceAttribute = element.getAttribute('to') ?? ''
    const targetAttribute = element.getAttribute('from') ?? ''
    const linkType = element.getAttribute('link-type')
    const filterElement = Array.from(element.children).find((child) => child.tagName.toLowerCase() === 'filter')
    let nextChildId = 1
    const group = filterElement
        ? parseFilterElement(filterElement, 0, () => nextChildId++)
        : createGroup(0)

    return {
        kind: 'related',
        id,
        relationshipId: `${sourceAttribute}:${entityName}`,
        entityName,
        sourceAttribute,
        targetAttribute,
        operator: forcedOperator ?? (linkType === 'not any' ? 'not-contains' : 'contains'),
        group
    }
}

function parseFilterElement(
    element: Element,
    id: number,
    nextId: () => number
): FilterGroupModel {
    const group: FilterGroupModel = {
        kind: 'group',
        id,
        operator: element.getAttribute('type') === 'or' ? 'or' : 'and',
        items: []
    }

    for (const child of Array.from(element.children)) {
        const tagName = child.tagName.toLowerCase()
        if (tagName === 'condition') {
            group.items.push(parseConditionElement(child, nextId()))
        } else if (tagName === 'filter') {
            group.items.push(parseFilterElement(child, nextId(), nextId))
        } else if (tagName === 'link-entity') {
            group.items.push(parseRelatedElement(child, nextId()))
        }
    }

    if (!group.items.length) group.items.push(createCondition(0))
    return group
}

export function parseFetchXml(xml: string, expectedEntityName: string): FilterGroupModel | undefined {
    if (!xml.trim()) return undefined

    const document = new DOMParser().parseFromString(xml, 'application/xml')
    if (document.querySelector('parsererror')) return undefined

    const entity = document.querySelector('fetch > entity')
    if (!entity || entity.getAttribute('name')?.toLowerCase() !== expectedEntityName.toLowerCase()) return undefined

    let nextId = 1
    const allocateId = () => nextId++
    const root = createGroup(0)
    root.items = []
    let foundRootFilter = false
    const children = Array.from(entity.children)
    const consumedAliasFilters = new Set<Element>()

    for (let index = 0; index < children.length; index++) {
        const child = children[index]
        const tagName = child.tagName.toLowerCase()

        if (tagName === 'condition') {
            root.items.push(parseConditionElement(child, allocateId()))
        } else if (tagName === 'filter') {
            if (consumedAliasFilters.has(child)) continue
            const aliasCondition = child.querySelector('condition[entityname]')
            if (aliasCondition && aliasCondition.getAttribute('operator') === 'null') continue
            const parsedGroup = parseFilterElement(child, allocateId(), allocateId)
            if (!foundRootFilter) {
                root.operator = parsedGroup.operator
                root.items.push(...parsedGroup.items)
                foundRootFilter = true
            } else {
                root.items.push(parsedGroup)
            }
        } else if (tagName === 'link-entity') {
            const linkType = child.getAttribute('link-type')
            if (linkType === 'outer') {
                const alias = child.getAttribute('alias')
                const followingFilter = children[index + 1]
                const nullCondition = followingFilter?.tagName.toLowerCase() === 'filter'
                    ? Array.from(followingFilter.querySelectorAll('condition')).find((condition) => (
                        condition.getAttribute('entityname') === alias
                        && condition.getAttribute('operator') === 'null'
                    ))
                    : undefined
                if (nullCondition && alias) {
                    root.items.push(parseRelatedElement(child, allocateId(), 'not-contains'))
                    consumedAliasFilters.add(followingFilter)
                    index++
                    continue
                }
            }
            root.items.push(parseRelatedElement(child, allocateId()))
        }
    }

    if (!root.items.length) root.items.push(createCondition(0))
    return root
}