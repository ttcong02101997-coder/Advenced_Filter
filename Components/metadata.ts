
import { IInputs } from '../generated/ManifestTypes'

type PcfContext = ComponentFramework.Context<IInputs>

export interface FilterField {
    logicalName: string
    displayName: string
    type: string
    targets: string[]
    dateFormat?: string
    options: Array<{ value: string; label: string }>
}

export interface RelatedEntityOption {
    id: string
    logicalName: string
    displayName: string
    sourceAttribute: string
    targetAttribute: string
    relationshipType: 'many-to-one' | 'one-to-many'
}

interface RawAttributeMetadata {
    LogicalName?: string
    AttributeType?: string
    AttributeTypeName?: { Value?: string }
    DisplayName?: {
        UserLocalizedLabel?: { Label?: string }
        LocalizedLabels?: Array<{ Label?: string }>
    }
    Targets?: string[]
    Format?: string
    Options?: RawOptionMetadata[]
    options?: RawOptionMetadata[]
    OptionSet?: RawOptionSetMetadata
    GlobalOptionSet?: RawOptionSetMetadata
}

interface RawOptionMetadata {
    Value?: number | string
    value?: number | string
    Label?: {
        UserLocalizedLabel?: { Label?: string }
        LocalizedLabels?: Array<{ Label?: string }>
    }
    label?: string
}

interface RawOptionSetMetadata {
    Options?: RawOptionMetadata[]
    options?: RawOptionMetadata[]
}

interface RawRelationshipMetadata {
    SchemaName?: string
    ReferencedEntity?: string
    ReferencedAttribute?: string
    ReferencingEntity?: string
    ReferencingAttribute?: string
}

interface RawEntityRelationships {
    OneToManyRelationships?: RawRelationshipMetadata[]
}

interface RawEntityMetadata {
    attributeNames?: string[]
    metadata?: Record<string, RawAttributeMetadata>
    displayName?: string
    entityPluralName?: string
    primaryIdAttribute?: string
    PrimaryIdAttribute?: string
}

function getFields(attributes: RawAttributeMetadata[]): FilterField[] {
    return attributes
        .map((attribute) => {
            const logicalName = attribute.LogicalName ?? ''
            const displayName = attribute.DisplayName?.UserLocalizedLabel?.Label
                ?? attribute.DisplayName?.LocalizedLabels?.[0]?.Label
                ?? logicalName
            const optionMetadata = attribute.OptionSet?.Options
                ?? attribute.OptionSet?.options
                ?? attribute.GlobalOptionSet?.Options
                ?? attribute.GlobalOptionSet?.options
                ?? attribute.Options
                ?? attribute.options
                ?? []
            const options = optionMetadata
                .filter((option): option is RawOptionMetadata & { Value?: number | string; value?: number | string } => (
                    typeof option.Value === 'number'
                    || typeof option.Value === 'string'
                    || typeof option.value === 'number'
                    || typeof option.value === 'string'
                ))
                .map((option) => ({
                    value: String(option.Value ?? option.value),
                    label: option.Label?.UserLocalizedLabel?.Label
                        ?? option.Label?.LocalizedLabels?.[0]?.Label
                        ?? option.label
                        ?? String(option.Value ?? option.value)
                }))

            return {
                logicalName,
                displayName,
                type: attribute.AttributeTypeName?.Value ?? attribute.AttributeType ?? 'String',
                targets: attribute.Targets ?? [],
                dateFormat: attribute.Format,
                options
            }
        })
        .filter((field) => Boolean(field.logicalName) && !field.logicalName.toLowerCase().endsWith('name'))
        .sort((left, right) => left.displayName.localeCompare(right.displayName))
}

export async function loadEntityFields(entityName: string): Promise<FilterField[]> {
    return getFields(await getAllAttributes(entityName))
}

export async function loadEntityFilterMetadata(
    context: PcfContext,
    entityName: string
): Promise<{ fields: FilterField[]; relatedEntities: RelatedEntityOption[] }> {
    const attributes = await getAllAttributes(entityName)
    const fields = getFields(attributes)
    const lookupRelationships = attributes.flatMap((attribute) => (
        (attribute.Targets ?? []).map((logicalName) => ({
            logicalName,
            sourceAttribute: attribute.LogicalName ?? ''
        }))
    )).filter((relationship) => relationship.sourceAttribute)
    const oneToManyRelationships = await getOneToManyRelationships(entityName)
    const oneToMany = oneToManyRelationships
        .filter((relationship) => (
            relationship.ReferencedEntity?.toLowerCase() === entityName.toLowerCase()
            && relationship.ReferencingEntity
            && relationship.ReferencedAttribute
            && relationship.ReferencingAttribute
        ))
        .map((relationship) => ({
            id: `1n:${relationship.SchemaName ?? relationship.ReferencingEntity}:${relationship.ReferencingAttribute}`,
            logicalName: relationship.ReferencingEntity as string,
            sourceAttribute: relationship.ReferencedAttribute as string,
            targetAttribute: relationship.ReferencingAttribute as string,
            relationshipName: relationship.SchemaName ?? relationship.ReferencingEntity as string,
            relationshipType: 'one-to-many' as const
        }))
    const manyToOne = lookupRelationships.map((relationship) => ({
        logicalName: relationship.logicalName,
        sourceAttribute: relationship.sourceAttribute,
        targetAttribute: '',
        id: `n1:${relationship.sourceAttribute}:${relationship.logicalName}`,
        relationshipName: relationship.sourceAttribute,
        relationshipType: 'many-to-one' as const
    }))
    const relationships = [...manyToOne, ...oneToMany]
    const relatedEntities = await Promise.all(relationships.map(async (relationship) => {
        try {
            const relatedMetadata = await context.utils.getEntityMetadata(relationship.logicalName) as RawEntityMetadata
            return {
                id: relationship.id,
                logicalName: relationship.logicalName,
                displayName: `${relatedMetadata.entityPluralName ?? relatedMetadata.displayName ?? relationship.logicalName} (${relationship.relationshipName})`,
                sourceAttribute: relationship.sourceAttribute,
                relationshipType: relationship.relationshipType,
                targetAttribute: relationship.targetAttribute
                    || relatedMetadata.primaryIdAttribute
                    || relatedMetadata.PrimaryIdAttribute
                    || `${relationship.logicalName}id`
            }
        } catch {
            return {
                id: relationship.id,
                logicalName: relationship.logicalName,
                displayName: `${relationship.logicalName} (${relationship.relationshipName})`,
                sourceAttribute: relationship.sourceAttribute,
                relationshipType: relationship.relationshipType,
                targetAttribute: relationship.targetAttribute || `${relationship.logicalName}id`
            }
        }
    }))

    return { fields, relatedEntities }
}

async function getAllAttributes(
    entityName: string
): Promise<RawAttributeMetadata[]> {
    const clientUrl = window.location.origin;
    const escapedEntityName = entityName.replace(/'/g, "''")

    const url =
        `${clientUrl}/api/data/v9.2/EntityDefinitions` +
        `(LogicalName='${escapedEntityName}')?$expand=Attributes`;

    const response = await fetch(url, {
        method: "GET",
        headers: {
            "Accept": "application/json",
            "OData-Version": "4.0",
            "OData-MaxVersion": "4.0"
        }
    });

    if (!response.ok) {
        throw new Error(
            `Failed to get metadata: ${response.status} ${response.statusText}`
        );
    }

    const metadata = await response.json();

    const attributes: RawAttributeMetadata[] = metadata.Attributes ?? []
    await Promise.all([
        loadChoiceOptions(entityName, attributes),
        loadLookupTargets(entityName, attributes)
    ])
    return attributes
}

async function loadLookupTargets(
    entityName: string,
    attributes: RawAttributeMetadata[]
): Promise<void> {
    const metadataTypeByAttributeType: Record<string, string> = {
        lookup: 'LookupAttributeMetadata',
        lookuptype: 'LookupAttributeMetadata',
        owner: 'OwnerAttributeMetadata',
        ownertype: 'OwnerAttributeMetadata',
        customer: 'CustomerAttributeMetadata',
        customertype: 'CustomerAttributeMetadata'
    }
    const metadataTypes = new Set(attributes.flatMap((attribute) => {
        const attributeType = attribute.AttributeTypeName?.Value ?? attribute.AttributeType ?? ''
        const metadataType = metadataTypeByAttributeType[attributeType.toLowerCase()]
        return metadataType ? [metadataType] : []
    }))

    if (!metadataTypes.size) return

    const clientUrl = window.location.origin
    const escapedEntityName = entityName.replace(/'/g, "''")
    const results = await Promise.all(Array.from(metadataTypes, async (metadataType) => {
        const url = `${clientUrl}/api/data/v9.2/EntityDefinitions(LogicalName='${escapedEntityName}')/Attributes/Microsoft.Dynamics.CRM.${metadataType}?$select=LogicalName,Targets`
        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    Accept: 'application/json',
                    'OData-Version': '4.0',
                    'OData-MaxVersion': '4.0'
                }
            })
            if (!response.ok) return []
            const metadata = await response.json() as { value?: RawAttributeMetadata[] }
            return metadata.value ?? []
        } catch {
            return []
        }
    }))
    const targetsByLogicalName = new Map(results.flat().map((attribute) => [
        attribute.LogicalName?.toLowerCase() ?? '',
        attribute.Targets ?? []
    ]))

    for (const attribute of attributes) {
        const targets = targetsByLogicalName.get(attribute.LogicalName?.toLowerCase() ?? '')
        if (targets?.length) attribute.Targets = targets
    }
}

async function loadChoiceOptions(
    entityName: string,
    attributes: RawAttributeMetadata[]
): Promise<void> {
    const metadataTypeByAttributeType: Record<string, string> = {
        picklist: 'PicklistAttributeMetadata',
        picklisttype: 'PicklistAttributeMetadata',
        state: 'StateAttributeMetadata',
        statetype: 'StateAttributeMetadata',
        status: 'StatusAttributeMetadata',
        statustype: 'StatusAttributeMetadata',
        multiselectpicklist: 'MultiSelectPicklistAttributeMetadata',
        multiselectpicklisttype: 'MultiSelectPicklistAttributeMetadata'
    }
    const metadataTypes = new Set(attributes.flatMap((attribute) => {
        const attributeType = attribute.AttributeTypeName?.Value ?? attribute.AttributeType ?? ''
        const metadataType = metadataTypeByAttributeType[attributeType.toLowerCase()]
        return metadataType ? [metadataType] : []
    }))

    if (!metadataTypes.size) return

    const clientUrl = window.location.origin
    const escapedEntityName = entityName.replace(/'/g, "''")
    const results = await Promise.all(Array.from(metadataTypes, async (metadataType) => {
        const url = `${clientUrl}/api/data/v9.2/EntityDefinitions(LogicalName='${escapedEntityName}')/Attributes/Microsoft.Dynamics.CRM.${metadataType}?$select=LogicalName&$expand=OptionSet`
        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    Accept: 'application/json',
                    'OData-Version': '4.0',
                    'OData-MaxVersion': '4.0'
                }
            })
            if (!response.ok) return []
            const metadata = await response.json() as { value?: RawAttributeMetadata[] }
            return metadata.value ?? []
        } catch {
            return []
        }
    }))
    const optionsByLogicalName = new Map(results.flat().map((attribute) => [
        attribute.LogicalName?.toLowerCase() ?? '',
        attribute.OptionSet ?? attribute.GlobalOptionSet
    ]))

    for (const attribute of attributes) {
        const optionSet = optionsByLogicalName.get(attribute.LogicalName?.toLowerCase() ?? '')
        if (optionSet) attribute.OptionSet = optionSet
    }
}

async function getOneToManyRelationships(entityName: string): Promise<RawRelationshipMetadata[]> {
    const clientUrl = window.location.origin
    const escapedEntityName = entityName.replace(/'/g, "''")
    const url = `${clientUrl}/api/data/v9.2/EntityDefinitions(LogicalName='${escapedEntityName}')?$expand=OneToManyRelationships($select=SchemaName,ReferencedEntity,ReferencedAttribute,ReferencingEntity,ReferencingAttribute)`

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                Accept: 'application/json',
                'OData-Version': '4.0',
                'OData-MaxVersion': '4.0'
            }
        })
        if (!response.ok) return []
        const metadata = await response.json() as RawEntityRelationships
        return metadata.OneToManyRelationships ?? []
    } catch {
        return []
    }
}