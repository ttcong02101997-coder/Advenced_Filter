import { Button, Dropdown, Menu, MenuItem, MenuList, MenuPopover, MenuTrigger, Option, Select } from '@fluentui/react-components'
import * as React from 'react'
import { IInputs } from '../generated/ManifestTypes'
import FieldCondition from './FieldCondition'
import { buildFetchXml, createCondition, createGroup, createRelatedFilter, FilterGroupModel, FilterNode, RelatedFilterModel } from './filterModel'
import { FilterField, loadEntityFields, loadEntityFilterMetadata, RelatedEntityOption } from './metadata'

interface FilterGroupProps {
    context: ComponentFramework.Context<IInputs>
    depth?: number
    entityName: string
    fields: FilterField[]
    isRoot?: boolean
    model: FilterGroupModel
    onChange: (model: FilterGroupModel) => void
    onRemove?: () => void
    relatedEntities: RelatedEntityOption[]
}

function FilterGroup({ context, depth = 0, entityName, fields, isRoot = false, model, onChange, onRemove, relatedEntities }: FilterGroupProps) {
    const nextItemId = React.useRef(1)
    const highestItemId = model.items.reduce((highest, item) => Math.max(highest, item.id), 0)
    if (nextItemId.current <= highestItemId) nextItemId.current = highestItemId + 1

    const addItem = (kind: 'row' | 'group' | 'related') => {
        const id = nextItemId.current
        nextItemId.current += 1
        const item = kind === 'row'
            ? createCondition(id)
            : kind === 'group'
                ? createGroup(id)
                : createRelatedFilter(id)
        onChange({ ...model, items: [...model.items, item] })
    }

    const removeItem = (id: number) => {
        onChange({ ...model, items: model.items.filter((item) => item.id !== id) })
    }

    const updateItem = (updatedItem: FilterNode) => {
        onChange({
            ...model,
            items: model.items.map((item) => item.id === updatedItem.id ? updatedItem : item)
        })
    }

    return (
        <div style={{
            margin: isRoot ? 0 : "10px 0",
            padding: isRoot ? 0 : 12,
            backgroundColor: isRoot ? "#ffffff" : "#f3f2f1",
            color: "#323130",
            fontFamily: '"Segoe UI", sans-serif'
        }}>
            <div style={{
                display: "grid",
                gridTemplateColumns: "88px repeat(3, minmax(0, 1fr)) 32px",
                alignItems: "center",
                gap: 8,
                padding: "4px 6px 10px",
                color: "#323130",
                fontSize: 13,
                fontWeight: 600
            }}>
                <Dropdown
                    value={model.operator.toUpperCase()}
                    selectedOptions={[model.operator]}
                    onOptionSelect={(_: React.SyntheticEvent, data: { optionValue?: string }) => (
                        onChange({ ...model, operator: data.optionValue === 'or' ? 'or' : 'and' })
                    )}
                    style={{ width: 88, minWidth: 0 }}
                    aria-label="Group operator"
                >
                    <Option value="and">AND</Option>
                    <Option value="or">OR</Option>
                </Dropdown>
                <span>Field</span>
                <span>Operator</span>
                <span>Value</span>
                {onRemove ? (
                    <Menu>
                        <MenuTrigger disableButtonEnhancement>
                            <Button appearance="subtle" size="small" aria-label="Group actions" title="Group actions" style={{ minWidth: 45 }}>
                                ...
                            </Button>
                        </MenuTrigger>
                        <MenuPopover>
                            <MenuList>
                                <MenuItem onClick={onRemove}>Remove group</MenuItem>
                            </MenuList>
                        </MenuPopover>
                    </Menu>
                ) : <span />}
            </div>

            <div style={{ padding: "0 6px" }}>
                {model.items.map((item, index) => (
                    <div key={item.id} style={{ position: "relative", paddingLeft: 20 }}>
                        <span aria-hidden="true" style={{
                            position: "absolute",
                            left: 8,
                            top: index === 0 ? "50%" : 0,
                            bottom: index === model.items.length - 1 ? "50%" : 0,
                            borderLeft: "1px solid #2563eb"
                        }} />
                        <span aria-hidden="true" style={{
                            position: "absolute",
                            left: 8,
                            top: "50%",
                            width: 12,
                            borderTop: "1px solid #2563eb"
                        }} />
                        {item.kind === 'row' ? (
                            <FieldCondition
                                context={context}
                                condition={item}
                                fields={fields}
                                onChange={updateItem}
                                onRemove={() => removeItem(item.id)}
                            />
                        ) : item.kind === 'group' ? (
                            <FilterGroup
                                context={context}
                                depth={depth + 1}
                                entityName={entityName}
                                fields={fields}
                                model={item}
                                onChange={updateItem}
                                onRemove={() => removeItem(item.id)}
                                relatedEntities={relatedEntities}
                            />
                        ) : (
                            <RelatedEntity
                                context={context}
                                model={item}
                                onChange={updateItem}
                                onRemove={() => removeItem(item.id)}
                                relatedEntities={relatedEntities}
                            />
                        )}
                    </div>
                ))}
            </div>

            <div style={{ padding: "8px 6px 4px" }}>
                <Menu>
                    <MenuTrigger disableButtonEnhancement>
                        <Button appearance="subtle" style={{ color: "#005a9e", fontWeight: 600 }}>
                            + Add
                        </Button>
                    </MenuTrigger>
                    <MenuPopover>
                        <MenuList>
                            <MenuItem onClick={() => addItem('row')}>Add row</MenuItem>
                            <MenuItem onClick={() => addItem('group')}>Add group</MenuItem>
                            <MenuItem disabled={!isRoot} onClick={() => addItem('related')}>Add related entity</MenuItem>
                        </MenuList>
                    </MenuPopover>
                </Menu>
            </div>
        </div>
    )
}

interface RelatedEntityProps {
    context: ComponentFramework.Context<IInputs>
    model: RelatedFilterModel
    onChange: (model: RelatedFilterModel) => void
    onRemove: () => void
    relatedEntities: RelatedEntityOption[]
}

function RelatedEntity({ context, model, onChange, onRemove, relatedEntities }: RelatedEntityProps) {
    const [fields, setFields] = React.useState<FilterField[]>([])
    const selectedEntity = relatedEntities.find((entity) => entity.id === model.relationshipId)
        ?? relatedEntities.find((entity) => (
            entity.logicalName.toLowerCase() === model.entityName.toLowerCase()
            && entity.sourceAttribute.toLowerCase() === model.sourceAttribute.toLowerCase()
            && entity.targetAttribute.toLowerCase() === model.targetAttribute.toLowerCase()
        ))
    const canConfigureRelatedFilter = Boolean(
        selectedEntity && model.entityName && model.sourceAttribute && model.targetAttribute
    )

    React.useEffect(() => {
        let isCurrent = true
        if (!model.entityName) {
            setFields([])
            return () => { isCurrent = false }
        }

        setFields([])
        const fetchFields = async () => {
            try {
                const entityFields = await loadEntityFields(model.entityName)
                if (isCurrent) setFields(entityFields)
            } catch {
                if (isCurrent) setFields([])
            }
        }
        void fetchFields()

        return () => { isCurrent = false }
    }, [model.entityName])

    return (
        <div style={{
            margin: "10px 0",
            padding: 12,
            backgroundColor: "#f3f2f1",
            color: "#323130",
            fontFamily: '"Segoe UI", sans-serif'
        }}>
            <div style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr) 32px",
                alignItems: "center",
                gap: 8,
                padding: "4px 6px 8px",
                fontSize: 13,
                fontWeight: 600
            }}>
                <span>Related entity</span>
                <span>Operator</span>
                <Menu>
                    <MenuTrigger disableButtonEnhancement>
                        <Button appearance="subtle" size="small" aria-label="Related entity actions" title="Related entity actions" style={{ minWidth: 45 }}>
                            ...
                        </Button>
                    </MenuTrigger>
                    <MenuPopover>
                        <MenuList>
                            <MenuItem onClick={onRemove}>Remove related entity</MenuItem>
                        </MenuList>
                    </MenuPopover>
                </Menu>
            </div>

            <div style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr) 32px",
                alignItems: "center",
                gap: 8,
                padding: "0 6px 8px"
            }}>
                <Select
                    value={selectedEntity?.id ?? ''}
                    onChange={(event) => {
                        const nextEntity = relatedEntities.find((entity) => entity.id === event.currentTarget.value)
                        onChange({
                            ...model,
                            relationshipId: nextEntity?.id ?? '',
                            entityName: nextEntity?.logicalName ?? '',
                            sourceAttribute: nextEntity?.sourceAttribute ?? '',
                            targetAttribute: nextEntity?.targetAttribute ?? '',
                            group: createGroup(0)
                        })
                    }}
                    disabled={!relatedEntities.length}
                    style={{ width: "100%", minWidth: 0 }}
                    aria-label="Related entity"
                >
                    <option value="" disabled>Select related entity</option>
                    <optgroup label="N-1 (Many-to-one)">
                        {relatedEntities.filter((entity) => entity.relationshipType === 'many-to-one').map((entity) => (
                            <option key={entity.id} value={entity.id}>{entity.displayName}</option>
                        ))}
                    </optgroup>
                    <optgroup label="1-N (One-to-many)">
                        {relatedEntities.filter((entity) => entity.relationshipType === 'one-to-many').map((entity) => (
                            <option key={entity.id} value={entity.id}>{entity.displayName}</option>
                        ))}
                    </optgroup>
                </Select>
                <Dropdown
                    value={model.operator === 'contains' ? 'Contains data' : 'Does not contain data'}
                    selectedOptions={[model.operator]}
                    onOptionSelect={(_: React.SyntheticEvent, data: { optionValue?: string }) => {
                        const operator = data.optionValue === 'not-contains' ? 'not-contains' : 'contains'
                        onChange({
                            ...model,
                            operator,
                            group: operator === 'not-contains' ? createGroup(0) : model.group
                        })
                    }}
                    disabled={!canConfigureRelatedFilter}
                    style={{ width: "100%", minWidth: 0 }}
                    aria-label="Related entity operator"
                >
                    <Option value="contains">Contains data</Option>
                    <Option value="not-contains">Does not contain data</Option>
                </Dropdown>
                <span />
            </div>

            {canConfigureRelatedFilter && model.operator === 'contains' && (
                <FilterGroup
                    key={model.relationshipId || 'no-related-entity'}
                    context={context}
                    depth={1}
                    entityName={model.entityName}
                    fields={fields}
                    model={model.group}
                    onChange={(group) => onChange({ ...model, group })}
                    relatedEntities={[]}
                />
            )}
        </div>
    )
}

interface GroupFilterProps {
    context: ComponentFramework.Context<IInputs>
    entityName: string
    model: FilterGroupModel
    onModelChange: (model: FilterGroupModel) => void
}

function GroupFilter({ context, entityName, model, onModelChange }: GroupFilterProps) {
    const [fields, setFields] = React.useState<FilterField[]>([])
    const [relatedEntities, setRelatedEntities] = React.useState<RelatedEntityOption[]>([])
    const [metadataError, setMetadataError] = React.useState(false)
    const contextRef = React.useRef(context)
    contextRef.current = context

    React.useEffect(() => {
        let isCurrent = true
        setFields([])
        setRelatedEntities([])
        setMetadataError(false)

        if (!entityName) {
            setMetadataError(true)
            return () => { isCurrent = false }
        }

        const fetchMetadata = async () => {
            try {
                const metadata = await loadEntityFilterMetadata(contextRef.current, entityName)
                if (!isCurrent) return
                setFields(metadata.fields)
                setRelatedEntities(metadata.relatedEntities)
            } catch {
                if (isCurrent) setMetadataError(true)
            }
        }
        void fetchMetadata()

        return () => { isCurrent = false }
    }, [entityName])

    return (
        <div>
            {metadataError && (
                <div role="alert" style={{ color: "#a4262c", padding: "8px 6px" }}>
                    Unable to load metadata for {entityName || "the selected table"}.
                </div>
            )}
            <FilterGroup
                key={entityName}
                context={context}
                entityName={entityName}
                fields={fields}
                relatedEntities={relatedEntities}
                model={model}
                onChange={onModelChange}
                isRoot
            />
        </div>
    )
}

export default GroupFilter