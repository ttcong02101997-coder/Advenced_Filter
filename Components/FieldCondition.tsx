import { Button, Dropdown, Input, Menu, MenuItem, MenuList, MenuPopover, MenuTrigger, Option, Select } from '@fluentui/react-components'
import * as React from 'react'
import { IInputs } from '../generated/ManifestTypes'
import { ConditionFilter } from './filterModel'
import { FilterField } from './metadata'

interface FieldConditionProps {
    context: ComponentFramework.Context<IInputs>
    condition: ConditionFilter
    fields: FilterField[]
    onChange: (condition: ConditionFilter) => void
    onRemove: () => void
}

interface ConditionOperator {
    value: string
    label: string
}

const textOperators: ConditionOperator[] = [
    { value: 'eq', label: 'Equals' },
    { value: 'neq', label: 'Does not equal' },
    { value: 'contains', label: 'Contains' },
    { value: 'not-contains', label: 'Does not contain' },
    { value: 'begins-with', label: 'Begins with' },
    { value: 'ends-with', label: 'Ends with' }
]

const nullOperators: ConditionOperator[] = [
    { value: 'null', label: 'Is null' },
    { value: 'not-null', label: 'Is not null' }
]

const comparisonOperators: ConditionOperator[] = [
    { value: 'eq', label: 'Equals' },
    { value: 'neq', label: 'Does not equal' },
    { value: 'gt', label: 'Greater than' },
    { value: 'ge', label: 'Greater than or equal' },
    { value: 'lt', label: 'Less than' },
    { value: 'le', label: 'Less than or equal' }
]

function FieldCondition({ context, condition, fields, onChange, onRemove }: FieldConditionProps) {
    const fieldKey = condition.fieldName.trim().toLowerCase()
    const selectedField = fields.find((field) => field.logicalName.toLowerCase() === fieldKey)
        ?? fields.find((field) => field.displayName.trim().toLowerCase() === fieldKey)
    const fieldType = selectedField?.type.toLowerCase().replace(/type$/, '') ?? ''
    const isNumber = ['integer', 'bigint', 'decimal', 'double', 'money'].includes(fieldType)
    const isDate = fieldType === 'datetime'
    const isDateOnly = isDate && selectedField?.dateFormat?.toLowerCase() === 'dateonly'
    const isBoolean = fieldType === 'boolean'
    const isChoice = ['picklist', 'state', 'status', 'multiselectpicklist', 'optionset'].includes(fieldType)
    const isLookup = ['lookup', 'owner', 'customer'].includes(fieldType)
    const selectedBooleanValue = isBoolean && condition.value === '1'
        ? 'true'
        : isBoolean && condition.value === '0'
            ? 'false'
            : condition.value
    const typedOperators = isNumber || isDate
        ? comparisonOperators
        : isBoolean || isChoice || isLookup
            ? comparisonOperators.slice(0, 2)
            : textOperators
    const operators = [...typedOperators, ...nullOperators]
    const isValueLessOperator = condition.operator === 'null' || condition.operator === 'not-null'

    const updateCondition = (patch: Partial<ConditionFilter>) => {
        onChange({
            ...condition,
            ...patch,
            fieldName: selectedField?.logicalName ?? condition.fieldName
        })
    }

    const selectField = (fieldName: string) => {
        const field = fields.find((item) => item.logicalName === fieldName)
            ?? fields.find((item) => item.displayName === fieldName)
        onChange({
            ...condition,
            fieldName: field?.logicalName ?? fieldName,
            operator: 'eq',
            value: '',
            valueLabel: ''
        })
    }

    const selectLookupValue = async () => {
        const targets = selectedField?.targets ?? []
        if (!targets.length) return

        try {
            const [record] = await context.utils.lookupObjects({
                allowMultiSelect: false,
                defaultEntityType: targets[0],
                entityTypes: targets
            })
            if (!record) return
            updateCondition({ value: record.id, valueLabel: record.name ?? record.id })
        } catch {
            updateCondition({ value: '', valueLabel: '' })
        }
    }

    React.useEffect(() => {
        const targets = selectedField?.targets ?? []
        if (!isLookup || !condition.value || condition.valueLabel || !targets.length) return

        let isCurrent = true
        const resolveLookupLabel = async () => {
            const id = condition.value.replace(/[{}]/g, '')
            for (const target of targets) {
                try {
                    const metadata = await context.utils.getEntityMetadata(target) as {
                        PrimaryNameAttribute?: string
                        primaryNameAttribute?: string
                    }
                    const primaryNameAttribute = metadata.PrimaryNameAttribute ?? metadata.primaryNameAttribute
                    if (!primaryNameAttribute) continue

                    const record = await context.webAPI.retrieveRecord(
                        target,
                        id,
                        `?$select=${encodeURIComponent(primaryNameAttribute)}`
                    ) as Record<string, unknown>
                    const label = record[primaryNameAttribute]
                    if (typeof label === 'string' && label && isCurrent) {
                        updateCondition({ valueLabel: label })
                        return
                    }
                } catch {
                    continue
                }
            }
        }

        void resolveLookupLabel()
        return () => { isCurrent = false }
    }, [condition.fieldName, condition.value, condition.valueLabel, context, isLookup, selectedField?.targets])

    return (
        <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr)) 32px",
            alignItems: "center",
            gap: 8,
            padding: "10px",
            margin: 0,
            backgroundColor: "#ffffff",
            border: "1px solid #e5e7eb",
            borderRadius: 4
        }}>
            <Select
                value={selectedField?.logicalName ?? ''}
                onChange={(event) => selectField(event.currentTarget.value)}
                style={{ width: "100%", minWidth: 0 }}
                aria-label="Field"
            >
                <option value="" disabled>Select a field</option>
                {fields.map((field) => (
                    <option key={field.logicalName} value={field.logicalName}>{field.displayName}</option>
                ))}
            </Select>

            <Dropdown
                value={operators.find((item) => item.value === condition.operator)?.label ?? operators[0].label}
                selectedOptions={[condition.operator]}
                onOptionSelect={(_: React.SyntheticEvent, data: { optionValue?: string }) => {
                    const operator = data.optionValue ?? 'eq'
                    updateCondition({ operator, value: operator === 'null' || operator === 'not-null' ? '' : condition.value })
                }}
                style={{ width: "100%", minWidth: 0 }}
                aria-label="Operator"
            >
                {operators.map((item) => (
                    <Option key={item.value} value={item.value}>{item.label}</Option>
                ))}
            </Dropdown>

            {isValueLessOperator ? (
                <div aria-label="No value required" />
            ) : isLookup && Boolean(selectedField?.targets.length) ? (
                <Button
                    appearance="outline"
                    onClick={() => { void selectLookupValue() }}
                    style={{ width: "100%", minWidth: 0, overflow: "hidden" }}
                    aria-label="Lookup value"
                    title={condition.valueLabel || condition.value || 'Select a record'}
                >
                    {condition.valueLabel || condition.value || 'Select a record'}
                </Button>
            ) : isBoolean || isChoice ? (
                <Select
                    value={selectedBooleanValue}
                    onChange={(event) => updateCondition({ value: event.currentTarget.value, valueLabel: '' })}
                    style={{ width: "100%", minWidth: 0 }}
                    aria-label="Value"
                >
                    <option value="" disabled>Select a value</option>
                    {isBoolean ? (
                        <>
                            <option value="true">Yes</option>
                            <option value="false">No</option>
                        </>
                    ) : (
                        <>
                            {condition.value && !selectedField?.options.some((option) => option.value === condition.value) && (
                                <option value={condition.value}>{condition.value}</option>
                            )}
                            {selectedField?.options.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                        </>
                    )}
                </Select>
            ) : (
                <Input
                    type={isNumber ? 'number' : isDateOnly ? 'date' : isDate ? 'datetime-local' : 'text'}
                    placeholder={isChoice ? 'Enter option value' : isLookup ? 'Enter record ID' : 'Enter a value'}
                    value={condition.value}
                    onChange={(_: React.ChangeEvent<HTMLInputElement>, data: { value: string }) => updateCondition({ value: data.value })}
                    style={{ width: "100%", minWidth: 0 }}
                    aria-label="Value"
                />
            )}

            <Menu>
                <MenuTrigger disableButtonEnhancement>
                    <Button
                        appearance="subtle"
                        size="small"
                        aria-label="Condition actions"
                        title="Condition actions"
                        style={{ minWidth: 32, width: 32, height: 32, padding: 0, color: "#605e5c" }}
                    >
                        ...
                    </Button>
                </MenuTrigger>
                <MenuPopover>
                    <MenuList>
                        <MenuItem onClick={onRemove}>Remove condition</MenuItem>
                    </MenuList>
                </MenuPopover>
            </Menu>
        </div>
    )
}

export default FieldCondition