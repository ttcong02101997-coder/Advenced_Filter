import * as React from 'react'
import { Button, Dialog, DialogActions, DialogContent, DialogSurface, DialogTitle, FluentProvider, webLightTheme } from '@fluentui/react-components';
import { IInputs } from './generated/ManifestTypes';
import GroupFilter from './Components/GroupFilter';
import { createGroup, FilterGroupModel, hasMissingConditionValue } from './Components/filterModel'

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
    const currentModelRef = React.useRef(filterModel)
    const [validationError, setValidationError] = React.useState('')
    const [confirmAction, setConfirmAction] = React.useState<'apply' | 'clear' | null>(null)

    React.useEffect(() => {
        currentModelRef.current = filterModel
        setCurrentModel(filterModel)
    }, [entityName, fieldProperty])

    const handleModelChange = (model: FilterGroupModel) => {
        currentModelRef.current = model
        setCurrentModel(model)
        onFilterModelChange(model)
        setValidationError('')
    }

    const executeConfirmedAction = () => {
        if (confirmAction === 'apply') {
            const model = currentModelRef.current
            if (hasMissingConditionValue(model)) {
                setValidationError('Enter a value for each selected field before applying the filter.')
                setConfirmAction(null)
                return
            }

            setValidationError('')
            onApply()
        }

        if (confirmAction === 'clear') {
            handleModelChange(createGroup(0))
            onApply()
        }

        setConfirmAction(null)
    }

    const handleApply = () => {
        setConfirmAction('apply')
    }

    const handleClear = () => {
        setConfirmAction('clear')
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
                    <div style={{ display: 'flex', gap: 8 }}>
                        <Button appearance="secondary" onClick={handleClear}>
                            Clear
                        </Button>
                        <Button appearance="primary" onClick={handleApply} disabled={!entityName}>
                            Apply
                        </Button>
                    </div>
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

                <Dialog
                    open={confirmAction !== null}
                    onOpenChange={(_, data) => {
                        if (!data.open) setConfirmAction(null)
                    }}
                >
                    <DialogSurface style={{
                        maxWidth: 420,
                        borderRadius: 12,
                        boxShadow: '0 20px 45px rgba(0, 0, 0, 0.18)',
                        border: '1px solid #e5e7eb'
                    }}>
                        <DialogTitle style={{ fontSize: 20, fontWeight: 600, color: '#1f2937' }}>
                            Xác nhận
                        </DialogTitle>
                        <DialogContent style={{ color: '#374151', lineHeight: 1.5 }}>
                            {confirmAction === 'apply'
                                ? 'Bạn có chắc muốn áp dụng bộ lọc này?'
                                : 'Bạn có chắc muốn xóa bộ lọc này?'}
                        </DialogContent>
                        <DialogActions>
                            <Button appearance="secondary" onClick={() => setConfirmAction(null)}>
                                Hủy
                            </Button>
                            <Button appearance="primary" onClick={executeConfirmedAction}>
                                {confirmAction === 'apply' ? 'Áp dụng' : 'Xóa'}
                            </Button>
                        </DialogActions>
                    </DialogSurface>
                </Dialog>
            </div>
        </FluentProvider>
    )
}

export default AdvancedFilter