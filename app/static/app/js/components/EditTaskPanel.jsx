import '../css/EditTaskPanel.scss';
import React from 'react';
import ErrorMessage from './ErrorMessage';
import EditTaskForm from './EditTaskForm';
import PropTypes from 'prop-types';
import $ from 'jquery';
import { _ } from '../classes/gettext';
import update from 'immutability-helper';

class EditTaskPanel extends React.Component {
    static propTypes = {
        task: PropTypes.object.isRequired,
        onSave: PropTypes.func.isRequired,
        onCancel: PropTypes.func.isRequired
    };

    constructor(props){
        super(props);

        this.state = {
            editTaskFormLoaded: false,
            saving: false,
            error: '',
            currentTask: props.task,
            loading: false,
            currentStep: "settingsStep",
            items: [],
            taskInfo: {},
        };

        this.handleSave = this.handleSave.bind(this);
        this.handleFormTaskLoaded = this.handleFormTaskLoaded.bind(this);
        this.handleFormChanged = this.handleFormChanged.bind(this);
        this.getTaskInfo = this.getTaskInfo.bind(this);
        this.handleCancel = this.handleCancel.bind(this);

    }

    componentDidMount() {
        PluginsAPI.Dashboard.triggerAddNewTaskPanelItem({}, (item) => {
            if (!item) return;

            this.setState(prevState => ({
                items: [...prevState.items, item]
            }));
        });
    }

    handleFormTaskLoaded() {
        this.setState({ editTaskFormLoaded: true });
    }

    handleFormChanged() {
        if (!this.taskForm) return;
        this.setState({ taskInfo: this.getTaskInfo() });
    }

    getTaskInfo() {
        if (!this.taskForm) return {};
        return Object.assign(this.taskForm.getTaskInfo(), {
            resizeSize: this.state.resizeSize,
            resizeMode: this.state.resizeMode
        });
    }

    handleSave() {
        this.setState({ saving: true });

        if (!this.taskForm) {
            console.error("Erro: `taskForm` não foi inicializado corretamente.");
            this.setState({ saving: false, error: _("Erro interno ao salvar a tarefa.") });
            return;
        }

        let taskInfo = this.taskForm.getTaskInfo();

        taskInfo.processing_node = taskInfo.selectedNode.id;
        taskInfo.auto_processing_node = taskInfo.selectedNode.key === "auto";
        delete taskInfo.selectedNode;

        $.ajax({
            url: `/api/projects/${this.props.task.project}/tasks/${this.props.task.id}/`,
            contentType: 'application/json',
            data: JSON.stringify(taskInfo),
            dataType: 'json',
            type: 'PATCH'
        }).done((json) => {
            this.setState({ saving: false });
            this.props.onSave(json);
        }).fail(() => {
            this.setState({ saving: false, error: _("Não foi possível atualizar as informações da tarefa. Por favor, tente novamente.") });
        });
    }

    handleCancel() {
        this.props.onCancel();
    }

    render(){

        return (
            <div className="edit-task-panel">
                <ErrorMessage bind={[this, "error"]} />
                <div className="form-horizontal">
                    <div className='fixEditar'>
                        <EditTaskForm
                            onFormLoaded={this.handleFormTaskLoaded}
                            onFormChanged={this.handleFormChanged}
                            inReview={this.state.inReview}
                            currentStep={this.state.currentStep}
                            suggestedTaskName={this.props.suggestedTaskName}
                            ref={(domNode) => { if (domNode) this.taskForm = domNode; }}
                        />
                    </div>
                    <div className="actions">
                        <button type="submit" className="btn btn-cancel" onClick={this.handleCancel} disabled={this.state.saving}>{_("Cancelar")}</button>
                        <button type="submit" className="btn btn-save" onClick={this.handleSave} disabled={this.state.saving || !this.state.editTaskFormLoaded}>
                            {this.state.saving ? <span><i className="fa fa-circle-notch fa-spin"></i> {_("Salvando...")}</span>
                            :   <span><i className="fa fa-edit"></i> {_("Salvar")}</span>}
                        </button>
                    </div>
                </div>
            </div>
        );
    }
}

export default EditTaskPanel;
