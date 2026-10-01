import * as React from 'react'
import { IInputs } from './generated/ManifestTypes';
import { Button, FluentProvider, webLightTheme } from '@fluentui/react-components';
import GroupFilter from './Components/GroupFilter';
import { FilterGroupModel, hasMissingConditionValue } from './Components/filterModel'

export interface IAdvancedFilterProps {
    entityName: string;
    fieldProperty: string;
    filterModel: FilterGroupModel;
    onFilterModelChange: (model: FilterGroupModel) => void;
    onApply: () => void;
    context: ComponentFramework.Context<IInputs>;
}

function AdvancedFilter({ entityName, fieldProperty, filterModel, onFilterModelChange, onApply, context }: IAdvancedFilterProps) {
    const [currentModel, setCurrentModel] = React.useState(filterModel)
    const [validationError, setValidationError] = React.useState('')

    React.useEffect(() => {
        setCurrentModel(filterModel)
    }, [entityName, fieldProperty])

    const handleModelChange = (model: FilterGroupModel) => {
        setCurrentModel(model)
        onFilterModelChange(model)
        setValidationError('')
    }

    const handleApply = () => {
        if (hasMissingConditionValue(currentModel)) {
            setValidationError('Enter a value for each selected field before applying the filter.')
            return
        }

        setValidationError('')
        onApply()
    }

    return (
        <FluentProvider theme={webLightTheme}>
            <div style={{
                minHeight: '100%',
                boxSizing: 'border-box',
                padding: 16,
                backgroundColor: '#f7f8fa',
                border: '1px solid #e1e5eb',
                borderRadius: 8,
                color: '#1f2937'
            }}>
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 16,
                    marginBottom: 16,
                    paddingBottom: 12,
                    borderBottom: '1px solid #e1e5eb'
                }}>
                    <div style={{ minWidth: 0 }}>
                    </div>
                    <Button appearance="primary" onClick={handleApply} disabled={!entityName}>
                        Apply
                    </Button>
                </div>
                {validationError && (
                    <div role="alert" style={{ color: '#a4262c', padding: '0 6px 12px' }}>
                        {validationError}
                    </div>
                )}
                <GroupFilter
                    entityName={entityName}
                    model={currentModel}
                    onModelChange={handleModelChange}
                    context={context}
                />
            </div>
        </FluentProvider>
    )
}

export default AdvancedFilter