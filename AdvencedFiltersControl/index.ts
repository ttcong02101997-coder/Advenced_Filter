import AdvancedFilter, { IAdvancedFilterProps } from "./AdvancedFilter";
import { IInputs, IOutputs } from "./generated/ManifestTypes";
import * as React from "react";
import { buildFetchXml, createGroup, FilterGroupModel, parseFetchXml } from "./Components/filterModel";

export class AdvencedFilter implements ComponentFramework.ReactControl<IInputs, IOutputs> {
    private notifyOutputChanged: () => void = () => undefined;
    private entityName: string = '';
    private fieldProperty: string = '';
    private lastInputFieldProperty: string = '';
    private filterModel: FilterGroupModel = createGroup(0);
    private outputTimer?: number;

    private handleFilterModelChange = (model: FilterGroupModel): void => {
        this.filterModel = model;
    };

    private handleApply = (): void => {
        const fetchXml = buildFetchXml(this.entityName, this.filterModel);
        if (this.fieldProperty === fetchXml) return;
        if (this.outputTimer !== undefined) window.clearTimeout(this.outputTimer);
        this.outputTimer = window.setTimeout(() => {
            this.outputTimer = undefined;
            this.notifyOutputChanged();
        }, 0);
        this.fieldProperty = fetchXml;
    };

    /**
     * Empty constructor.
     */
    constructor() {
        // Empty
    }

    /**
     * Used to initialize the control instance. Controls can kick off remote server calls and other initialization actions here.
     * Data-set values are not initialized here, use updateView.
     * @param context The entire property bag available to control via Context Object; It contains values as set up by the customizer mapped to property names defined in the manifest, as well as utility functions.
     * @param notifyOutputChanged A callback method to alert the framework that the control has new outputs ready to be retrieved asynchronously.
     * @param state A piece of data that persists in one session for a single user. Can be set at any point in a controls life cycle by calling 'setControlState' in the Mode interface.
     */
    public init(
        context: ComponentFramework.Context<IInputs>,
        notifyOutputChanged: () => void,
        state: ComponentFramework.Dictionary
    ): void {
        this.notifyOutputChanged = notifyOutputChanged;
    }

    /**
     * Called when any value in the property bag has changed. This includes field values, data-sets, global values such as container height and width, offline status, control metadata values such as label, visible, etc.
     * @param context The entire property bag available to control via Context Object; It contains values as set up by the customizer mapped to names defined in the manifest, as well as utility functions
     * @returns ReactElement root react element for the control
     */
    public updateView(context: ComponentFramework.Context<IInputs>): React.ReactElement {
        const entityName = context.parameters.entityName.raw ?? '';
        const incomingFetchXml = context.parameters.fieldProperty.raw ?? '';
        const entityChanged = this.entityName !== entityName;
        const inputChanged = this.lastInputFieldProperty !== incomingFetchXml;

        if (entityChanged || inputChanged) {
            this.entityName = entityName;
            this.lastInputFieldProperty = incomingFetchXml;

            if (incomingFetchXml !== this.fieldProperty || entityChanged) {
                const parsedModel = parseFetchXml(incomingFetchXml, entityName);
                this.filterModel = parsedModel ?? createGroup(0);
                this.fieldProperty = parsedModel
                    ? incomingFetchXml
                    : buildFetchXml(entityName, this.filterModel);
            }
        }

        const props: IAdvancedFilterProps = {
            entityName,
            fieldProperty: incomingFetchXml,
            filterModel: this.filterModel,
            onFilterModelChange: this.handleFilterModelChange,
            onApply: this.handleApply,
            context
        };
        return React.createElement(
            AdvancedFilter, props
        );
    }

    /**
     * It is called by the framework prior to a control receiving new data.
     * @returns an object based on nomenclature defined in manifest, expecting object[s] for property marked as "bound" or "output"
     */
    public getOutputs(): IOutputs {
        return {
            fieldProperty: this.fieldProperty
        };
    }

    /**
     * Called when the control is to be removed from the DOM tree. Controls should use this call for cleanup.
     * i.e. cancelling any pending remote calls, removing listeners, etc.
     */
    public destroy(): void {
        if (this.outputTimer !== undefined) window.clearTimeout(this.outputTimer);
    }
}
