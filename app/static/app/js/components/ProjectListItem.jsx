import '../css/ProjectListItem.scss';
import React from 'react';
import update from 'immutability-helper';
import TaskList from './TaskList';
import statusCodes from '../classes/StatusCodes';
import NewTaskPanel from './NewTaskPanel';
import ImportTaskPanel from './ImportTaskPanel';
import UploadProgressBar from './UploadProgressBar';
import ErrorMessage from './ErrorMessage';
import EditProjectDialog from './EditProjectDialog';
import SortPanel from './SortPanel';
import Dropzone from '../vendor/dropzone';
import csrf from '../django/csrf';
import HistoryNav from '../classes/HistoryNav';
import PropTypes from 'prop-types';
import ResizeModes from '../classes/ResizeModes';
import Tags from '../classes/Tags';
import exifr from '../vendor/exifr';
import { _, interpolate } from '../classes/gettext';
import $ from 'jquery';
import JSZip from 'jszip';
import { fileTypeFromBuffer } from 'file-type';









class ProjectListItem extends React.Component {
  static propTypes = {
    history: PropTypes.object.isRequired,
    data: PropTypes.object.isRequired, // project json
    onDelete: PropTypes.func,
    onTaskMoved: PropTypes.func,
    onProjectDuplicated: PropTypes.func
  }

  constructor(props) {
    super(props);

    this.historyNav = new HistoryNav(props.history);

    this.state = {
      showTaskList: this.historyNav.isValueInQSList("project_task_open", props.data.id),
      upload: this.getDefaultUploadState(),
      error: "",
      data: props.data,
      refreshing: false,
      importing: false,
      buttons: [],
      sortKey: "-created_at",
      filterTags: [],
      selectedTags: [],
      filterText: "",
      showMap: false,
    };

    this.sortItems = [{
      key: "created_at",
      label: _("Created on")
    }, {
      key: "name",
      label: _("Name")
    }, {
      key: "tags",
      label: _("Tags")
    }];

    this.toggleTaskList = this.toggleTaskList.bind(this);
    this.closeUploadError = this.closeUploadError.bind(this);
    this.cancelUpload = this.cancelUpload.bind(this);
    this.handleCancel = this.handleCancel.bind(this);
    this.handleTaskSaved = this.handleTaskSaved.bind(this);
    this.viewMap = this.viewMap.bind(this);
    this.handleDelete = this.handleDelete.bind(this);
    this.handleEditProject = this.handleEditProject.bind(this);
    this.updateProject = this.updateProject.bind(this);
    this.taskDeleted = this.taskDeleted.bind(this);
    this.taskMoved = this.taskMoved.bind(this);
    this.hasPermission = this.hasPermission.bind(this);
  }

  refresh() {
    // Update project information based on server
    this.setState({ refreshing: true });

    this.refreshRequest =
      $.getJSON(`/api/projects/${this.state.data.id}/`)
        .done((json) => {
          this.setState({ data: json });
        })
        .fail((_, __, e) => {
          this.setState({ error: e.message });
        })
        .always(() => {
          this.setState({ refreshing: false });
        });

    // Lida com a exibição do mapa sempre que há uma atualização nas tasks
    this.handleShowMapProject();
  }

  componentWillUnmount() {
    if (this.deleteProjectRequest) this.deleteProjectRequest.abort();
    if (this.refreshRequest) this.refreshRequest.abort();
    if (this.taskInterval) clearInterval(this.taskInterval);
  }

  componentDidUpdate(prevProps, prevState) {
    if (prevState.filterText !== this.state.filterText ||
      prevState.selectedTags.length !== this.state.selectedTags.length) {
      if (this.taskList) this.taskList.applyFilter(this.state.filterText, this.state.selectedTags);
    }
  }


  /**
 * Obtém a lista de tarefas de um projeto específico a partir da API.
 * 
 * Esta função realiza uma requisição para o endpoint da API, utilizando o ID do projeto
 * e o critério de ordenação fornecido. 
 * 
 * @returns {Promise<Array>} Uma promessa que resolve para um array de objetos de tarefas.
 *                           Retorna um array vazio se houver algum erro durante a requisição.
 */
  async getTasksForAPI() {

    try {
      // Faz uma requisição GET para a API para obter a lista de tarefas.
      const response = await $.getJSON(`/api/projects/${this.state.data.id}/tasks/?ordering=${this.state.sortKey}`);

      // Retorna os dados das tarefas obtidas.
      return response;
    } catch (error) {
      // Loga o erro no console em caso de falha na requisição.
      console.error("Erro ao carregar tasks:", error);

      // Retorna um array vazio para garantir que o chamador não quebre.
      return [];
    }
  }


  /**
   * Verifica se existe alguma tarefa com os status especificados.
   * 
   * @param {Array<string>} statusList - Lista de status a serem verificados.
   * @returns {Promise<boolean>} Uma promessa que resolve para `true` se alguma tarefa possui o status desejado.
   */
  async checkTaskStatus(statusList) {
    try {
      // Obtém a lista de tarefas da API
      const tasks = await this.getTasksForAPI();

      // Verifica se alguma tarefa possui um status presente na lista statusList
      return tasks.some(task => statusList.includes(task.status));

    } catch (error) {
      // Em caso de erro, loga o erro no console e retorna false
      console.error("Erro ao verificar status das tarefas:", error);
      return false;
    }
  }


  /**
 * Inicia um monitoramento periódico do status das tarefas.
 * 
 * Esta função verifica a cada 1 segundo se há tarefas em execução ou com status nulo (Estado nulo sinaliza task recem adicionada).
 * Quando não há mais tarefas em execução, o monitoramento é interrompido e o estado
 * do componente é atualizado para exibir o mapa.
  */
  monitorTaskStatus() {

    // Verifica se já existe um intervalo ativo e o limpa para evitar duplicação.
    if (this.taskInterval) clearInterval(this.taskInterval);

    // Configura um intervalo para monitorar o status das tarefas.
    this.taskInterval = setInterval(async () => {
      try {
        // Verifica se há alguma tarefa com status RUNNING ou null.
        const isTaskRunning = await this.checkTaskStatus([statusCodes.RUNNING, null]);

        // Se nenhuma tarefa estiver em execução, interrompe o monitoramento
        if (!isTaskRunning) {
          clearInterval(this.taskInterval);
          this.handleShowMapProject();
        }
      } catch (error) {
        // Loga o erro caso ocorra um problema na verificação de status e garante que o intervalo seja interrompido em caso de erro.
        console.error("Erro durante o monitoramento de tarefas:", error);
        clearInterval(this.taskInterval);
      }
    }, 1000);
  }

  /**
 * Controla a exibição do mapa com base no status das tarefas.
 * 
 * Esta função verifica o status das tarefas relacionadas ao projeto e decide
 * se o mapa deve ser exibido ou ocultado. Caso existam tarefas em execução, 
 * inicia um monitoramento periódico para acompanhar mudanças de status.
 */
  async handleShowMapProject() {
    try {
      // Verifica se há tarefas COMPLETED.
      const hasCompletedTask = await this.checkTaskStatus([statusCodes.COMPLETED]);

      if (hasCompletedTask) {
        // Exibe o mapa caso uma tarefa tenha sido concluída
        this.setState({ showMap: true });
        return;
      }

      // Verifica se há tarefas RUNNING ou com status nulo (novas tarefas).
      const hasRunningTasks = await this.checkTaskStatus([statusCodes.RUNNING, null]);

      if (hasRunningTasks) {
        // Oculta o mapa enquanto as tarefas estão sendo processadas.
        this.setState({ showMap: false });

        // Inicia o monitoramento periódico para acompanhar o status das tarefas.
        this.monitorTaskStatus();
      } else {

        //Oculta o mapa se nenhuma tarefa está em execução ou concluída.
        this.setState({ showMap: false });
      }
    } catch (error) {
      // Loga qualquer erro que ocorra durante a execução.
      console.error("Erro em handleShowMapProject:", error);
    }
  }

  getDefaultUploadState() {
    return {
      uploading: false,
      editing: false,
      error: "",
      progress: 0,
      files: [],
      totalCount: 0,
      uploadedCount: 0,
      totalBytes: 0,
      totalBytesSent: 0,
      lastUpdated: 0
    };
  }

  resetUploadState() {
    this.setUploadState(this.getDefaultUploadState());
  }

  setUploadState(props) {
    this.setState(update(this.state, {
      upload: {
        $merge: props
      }
    }));
  }

  hasPermission(perm) {
    return this.state.data.permissions.indexOf(perm) !== -1;
  }

  handleUploadfolders = (e) => {
    // use the UPLOAD FOLDERS BUTTON to send items inside the folder to the dropzone
    e.persist();
    const files = e.target.files;
    const fileArray = Array.from(files);

    // console.log(fileArray);

    const allowedExtensions = ['.png', '.jpg', '.jpeg', '.tif'];

    // Filtrar arquivos válidos
    const validFiles = fileArray.filter((file) => {
      const fileName = file.name.toLowerCase();
      return allowedExtensions.some((ext) => fileName.endsWith(ext));
    });


    const rejectedFiles = fileArray.filter((file) => !validFiles.includes(file));

    if (rejectedFiles.length > 0) {
      const rejectedFileNames = rejectedFiles.map((file) => file.name).join(', ');
      alert(`Os seguintes arquivos não foram aceitos: ${rejectedFileNames}`);
    }

    // console.log("Arquivos válidos:", validFiles);

    validFiles.forEach((file) => {
      this.dz.addFile(file);
    });

    this.dz.emit('addedfiles', validFiles);
    e.target.value = "";
  }

  handleUploadFiles = async (e) => {
    // use the UPLOAD FILES BUTTON to send files to the dropzone
    e.persist();
    const files = e.target.files;
    const filesArray = Array.from(files);

    let FilesToDrozoneArray = [];
    let rejectedFiles = [];

    const allowedExtensions = ['.png', '.jpg', '.jpeg', '.tif'];

    for (const file of filesArray) {
      if (file.name.endsWith(".zip")) {
        const unzipFiles = await this.unzipZipFile(file);

        // console.log(unzipFiles)

        const validUnzipFiles = unzipFiles.filter((f) =>
          allowedExtensions.some((ext) => f.name.toLowerCase().endsWith(ext))
        );
        const rejectedUnzipFiles = unzipFiles.filter((f) =>
          !allowedExtensions.some((ext) => f.name.toLowerCase().endsWith(ext))
        );

        // Adicionar arquivos válidos e rejeitados às respectivas listas
        FilesToDrozoneArray = [...FilesToDrozoneArray, ...validUnzipFiles];
        rejectedFiles = [...rejectedFiles, ...rejectedUnzipFiles];
      }

      else if (file.name.endsWith(".rar")) {
        // codigo para descompactar arquivos .rar
      }

      else {
        FilesToDrozoneArray = [...FilesToDrozoneArray, file];
      }
    }

    // Exibir alerta se houver arquivos rejeitados
    if (rejectedFiles.length > 0) {
      const rejectedFileNames = rejectedFiles.map((file) => file.name).join(', ');
      alert(`Os seguintes arquivos não foram aceitos do zip: ${rejectedFileNames}`);
    }

    FilesToDrozoneArray.forEach((file) => {
      this.dz.addFile(file);
    })
    const fileListToDropzone = FilesToDrozoneArray.reduce((obj, file, index) => {
      obj[index] = file;
      return obj;
    }, {});
    fileListToDropzone.length = FilesToDrozoneArray.length;

    this.dz.emit('addedfiles', fileListToDropzone);
    e.target.value = "";
  }

  unzipZipFile = async (file) => {
    // function to unzip zip
    const zip = new JSZip();
    const content = await zip.loadAsync(file);
    const filesArray = [];

    const promises = content.file(/.*/).map(async (zipEntry) => {
      if (!zipEntry.dir) {

        const fileData = await zipEntry.async("blob");

        const buffer = await fileData.arrayBuffer();
        const fileType = await fileTypeFromBuffer(Buffer.from(buffer));
        const mimeType = fileType ? fileType.mime : '';

        const fileObj = new File([fileData], zipEntry.name, { type: mimeType });
        filesArray.push(fileObj);
      }
    });

    await Promise.all(promises);
    console.log("Arquivos ZIP descompactados: ", filesArray);
    return filesArray;
  }


  componentDidMount() {

    this.handleShowMapProject();

    Dropzone.autoDiscover = false;

    if (this.hasPermission("add")) {
      this.dz = new Dropzone(this.dropzone, {
        paramName: "images",
        url: 'TO_BE_CHANGED',
        parallelUploads: 6,
        uploadMultiple: false,
        acceptedFiles: ".png,.jpg,.jpeg,.zip,.tif",
        autoProcessQueue: false,
        createImageThumbnails: false,
        clickable: false,
        maxFilesize: 131072, // 128G
        chunkSize: 2147483647,
        timeout: 2147483647,

        headers: {
          [csrf.header]: csrf.token
        }
      });

      this.dz.on("addedfiles", files => {
        console.log("addedfiles executado: ", files);

        let totalBytes = 0;
        for (let i = 0; i < files.length; i++) {
          totalBytes += files[i].size;
          files[i].deltaBytesSent = 0;
          files[i].trackedBytesSent = 0;
          files[i].retries = 0;
        }

        this.setUploadState({
          editing: true,
          totalCount: this.state.upload.totalCount + files.length,
          files,
          totalBytes: this.state.upload.totalBytes + totalBytes
        });
      })
        .on("uploadprogress", (file, progress, bytesSent) => {
          const now = new Date().getTime();

          if (bytesSent > file.size) bytesSent = file.size;

          if (progress === 100 || now - this.state.upload.lastUpdated > 500) {
            const deltaBytesSent = bytesSent - file.deltaBytesSent;
            file.trackedBytesSent += deltaBytesSent;

            const totalBytesSent = this.state.upload.totalBytesSent + deltaBytesSent;
            const progress = totalBytesSent / this.state.upload.totalBytes * 100;

            this.setUploadState({
              progress,
              totalBytesSent,
              lastUpdated: now
            });

            file.deltaBytesSent = bytesSent;
          }
        })
        .on("complete", (file) => {
          // Retry
          const retry = () => {
            const MAX_RETRIES = 10;

            if (file.retries < MAX_RETRIES) {
              // Update progress
              const totalBytesSent = this.state.upload.totalBytesSent - file.trackedBytesSent;
              const progress = totalBytesSent / this.state.upload.totalBytes * 100;

              this.setUploadState({
                progress,
                totalBytesSent,
              });

              file.status = Dropzone.QUEUED;
              file.deltaBytesSent = 0;
              file.trackedBytesSent = 0;
              file.retries++;
              setTimeout(() => {
                this.dz.processQueue();
              }, 5000 * file.retries);
            } else {
              throw new Error(interpolate(_('Cannot upload %(filename)s, exceeded max retries (%(max_retries)s)'), { filename: file.name, max_retries: MAX_RETRIES }));
            }
          };

          try {
            if (file.status === "error") {
              if ((file.size / 1024) > this.dz.options.maxFilesize) {
                // Delete from upload queue
                this.setUploadState({
                  totalCount: this.state.upload.totalCount - 1,
                  totalBytes: this.state.upload.totalBytes - file.size
                });
                throw new Error(interpolate(_('Cannot upload %(filename)s, file is too large! Default MaxFileSize is %(maxFileSize)s MB!'), { filename: file.name, maxFileSize: this.dz.options.maxFilesize }));
              }
              retry();
            } else {
              // Check response
              let response = JSON.parse(file.xhr.response);
              if (response.success) {
                // Update progress by removing the tracked progress and 
                // use the file size as the true number of bytes
                let totalBytesSent = this.state.upload.totalBytesSent + file.size;
                if (file.trackedBytesSent) totalBytesSent -= file.trackedBytesSent;

                const progress = totalBytesSent / this.state.upload.totalBytes * 100;

                this.setUploadState({
                  progress,
                  totalBytesSent,
                  uploadedCount: this.state.upload.uploadedCount + 1
                });

                this.dz.processQueue();
              } else {
                retry();
              }
            }
          } catch (e) {
            if (this.manuallyCanceled) {
              // Manually canceled, ignore error
              this.setUploadState({ uploading: false });
            } else {
              this.setUploadState({ error: `${e.message}`, uploading: false });
            }

            if (this.dz.files.length) this.dz.cancelUpload();
          }
        })
        .on("queuecomplete", () => {
          const remainingFilesCount = this.state.upload.totalCount - this.state.upload.uploadedCount;
          if (remainingFilesCount === 0 && this.state.upload.uploadedCount > 0) {
            // All files have uploaded!
            this.setUploadState({ uploading: false });

            $.ajax({
              url: `/api/projects/${this.state.data.id}/tasks/${this.dz._taskInfo.id}/commit/`,
              contentType: 'application/json',
              dataType: 'json',
              type: 'POST'
            }).done((task) => {
              if (task && task.id) {
                this.newTaskAdded();
              } else {
                this.setUploadState({ error: interpolate(_('Não é possível criar uma nova tarefa. Resposta inválida do servidor: %(error)s'), { error: JSON.stringify(task) }) });
              }
            }).fail(() => {
              this.setUploadState({ error: _("Não é possível criar uma nova tarefa. Por favor, tente novamente mais tarde.") });
            });
          } else if (this.dz.getQueuedFiles() === 0) {
            // Done but didn't upload all?
            this.setUploadState({
              totalCount: this.state.upload.totalCount - remainingFilesCount,
              uploading: false,
              error: interpolate(_('%(count)s arquivos não podem ser carregados. Lembrando que apenas imagens (.jpg, .tif, .png) e arquivos GCP (.txt) podem ser carregados. Tente novamente.'), { count: remainingFilesCount })
            });
          }
        })
        .on("reset", () => {
          this.resetUploadState();
        })
        .on("dragenter", () => {
          if (!this.state.upload.editing) {
            this.resetUploadState();
          }
        });
    }

    PluginsAPI.Dashboard.triggerAddNewTaskButton({ projectId: this.state.data.id, onNewTaskAdded: this.newTaskAdded }, (button) => {
      if (!button) return;

      this.setState(update(this.state, {
        buttons: { $push: [button] }
      }));
    });
  }

  newTaskAdded = () => {
    this.setState({ importing: false });

    if (this.state.showTaskList) {
      this.taskList.refresh();
    } else {
      this.setState({ showTaskList: true });
    }
    this.resetUploadState();
    this.refresh();
  }

  setRef(prop) {
    return (domNode) => {
      if (domNode != null) this[prop] = domNode;
    }
  }

  toggleTaskList() {
    const showTaskList = !this.state.showTaskList;

    this.historyNav.toggleQSListItem("project_task_open", this.state.data.id, showTaskList);

    this.setState({
      showTaskList: showTaskList
    });
  }

  closeUploadError() {
    this.setUploadState({ error: "" });
  }

  cancelUpload() {
    this.dz.removeAllFiles(true);
  }

  handleCancel() {
    this.manuallyCanceled = true;
    this.cancelUpload();
    if (this.dz._taskInfo && this.dz._taskInfo.id !== undefined) {
      $.ajax({
        url: `/api/projects/${this.state.data.id}/tasks/${this.dz._taskInfo.id}/remove/`,
        contentType: 'application/json',
        dataType: 'json',
        type: 'POST'
      });
    }
    setTimeout(() => {
      this.manuallyCanceled = false;
    }, 500);
  }

  taskDeleted() {
    this.refresh();
  }

  taskMoved(task) {
    this.refresh();
    if (this.props.onTaskMoved) this.props.onTaskMoved(task);
  }

  handleDelete() {
    return $.ajax({
      url: `/api/projects/${this.state.data.id}/`,
      type: 'DELETE'
    }).done(() => {
      if (this.props.onDelete) this.props.onDelete(this.state.data.id);
    });
  }

  handleTaskSaved(taskInfo) {
    this.dz._taskInfo = taskInfo; // Allow us to access the task info from dz

    this.setUploadState({ uploading: true, editing: false });

    // Create task
    const formData = {
      name: taskInfo.name,
      options: taskInfo.options,
      processing_node: taskInfo.selectedNode.id,
      auto_processing_node: taskInfo.selectedNode.key == "auto",
      partial: true
    };

    if (taskInfo.resizeMode === ResizeModes.YES) {
      formData.resize_to = taskInfo.resizeSize;
    }

    $.ajax({
      url: `/api/projects/${this.state.data.id}/tasks/`,
      contentType: 'application/json',
      data: JSON.stringify(formData),
      dataType: 'json',
      type: 'POST'
    }).done((task) => {
      if (task && task.id) {
        this.dz._taskInfo.id = task.id;
        this.dz.options.url = `/api/projects/${this.state.data.id}/tasks/${task.id}/upload/`;
        this.dz.processQueue();
      } else {
        this.setState({ error: interpolate(_('Não é possível criar uma nova tarefa. Resposta inválida do servidor: %(error)s'), { error: JSON.stringify(task) }) });
        this.handleTaskCanceled();
      }
    }).fail(() => {
      this.setState({ error: _("Não é possível criar uma nova tarefa. Por favor, tente novamente mais tarde.") });
      this.handleTaskCanceled();
    });
  }

  handleTaskCanceled = () => {
    this.dz.removeAllFiles(true);
    this.resetUploadState();
  }

  handleUpload = () => {
    // Not a second click for adding more files?
    if (!this.state.upload.editing) {
      this.handleTaskCanceled();
    }
  }

  handleEditProject() {
    this.editProjectDialog.show();
  }

  handleHideProject = (deleteWarning, deleteAction) => {
    return () => {
      if (window.confirm(deleteWarning)) {
        this.setState({ error: "", refreshing: true });
        deleteAction()
          .fail(e => {
            this.setState({ error: e.message || (e.responseJSON || {}).detail || e.responseText || _("Não foi possível excluir o item") });
          }).always(() => {
            this.setState({ refreshing: false });
          });
      }
    }
  }

  updateProject(project) {
    return $.ajax({
      url: `/api/projects/${this.state.data.id}/edit/`,
      contentType: 'application/json',
      data: JSON.stringify({
        name: project.name,
        description: project.descr,
        tags: project.tags,
        permissions: project.permissions
      }),
      dataType: 'json',
      type: 'POST'
    }).done(() => {
      this.refresh();
    });
  }

  viewMap() {
    location.href = `/map/project/${this.state.data.id}/`;
  }

  handleImportTask = () => {
    this.setState({ importing: true });
  }

  handleCancelImportTask = () => {
    this.setState({ importing: false });
  }

  handleTaskTitleHint = () => {
    return new Promise((resolve, reject) => {
      if (this.state.upload.files.length > 0) {

        // Find first image in list
        let f = null;
        for (let i = 0; i < this.state.upload.files.length; i++) {
          if (this.state.upload.files[i].type.indexOf("image") === 0) {
            f = this.state.upload.files[i];
            break;
          }
        }
        if (!f) {
          reject();
          return;
        }

        // Parse EXIF
        const options = {
          ifd0: false,
          exif: [0x9003],
          gps: [0x0001, 0x0002, 0x0003, 0x0004],
          interop: false,
          ifd1: false // thumbnail
        };
        exifr.parse(f, options).then(gps => {
          if (!gps.latitude || !gps.longitude) {
            reject();
            return;
          }

          let dateTime = gps["36867"];

          // Try to parse the date from EXIF to JS
          const parts = dateTime.split(" ");
          if (parts.length == 2) {
            let [d, t] = parts;
            d = d.replace(/:/g, "-");
            const tm = Date.parse(`${d} ${t}`);
            if (!isNaN(tm)) {
              dateTime = new Date(tm).toLocaleDateString();
            }
          }

          // Fallback to file modified date if 
          // no exif info is available
          if (!dateTime) dateTime = f.lastModifiedDate.toLocaleDateString();

          // Query nominatim OSM
          $.ajax({
            url: `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${gps.latitude}&lon=${gps.longitude}`,
            contentType: 'application/json',
            type: 'GET'
          }).done(json => {
            if (json.name) resolve(`${json.name} - ${dateTime}`);
            else if (json.address && json.address.road) resolve(`${json.address.road} - ${dateTime}`);
            else reject(new Error("Invalid json"));
          }).fail(reject);
        }).catch(reject);
      }
    });
  }

  sortChanged = key => {
    if (this.taskList) {
      this.setState({ sortKey: key });
      setTimeout(() => {
        this.taskList.refresh();
      }, 0);
    }
  }

  handleTagClick = tag => {
    return e => {
      const evt = new CustomEvent("onProjectListTagClicked", { detail: tag });
      document.dispatchEvent(evt);
    }
  }

  tagsChanged = (filterTags) => {
    this.setState({ filterTags, selectedTags: [] });
  }

  handleFilterTextChange = e => {
    this.setState({ filterText: e.target.value });
  }

  toggleTag = t => {
    return () => {
      if (this.state.selectedTags.indexOf(t) === -1) {
        this.setState(update(this.state, { selectedTags: { $push: [t] } }));
      } else {
        this.setState({ selectedTags: this.state.selectedTags.filter(tag => tag !== t) });
      }
    }
  }

  selectTag = t => {
    if (this.state.selectedTags.indexOf(t) === -1) {
      this.setState(update(this.state, { selectedTags: { $push: [t] } }));
    }
  }

  clearFilter = () => {
    this.setState({
      filterText: "",
      selectedTags: []
    });
  }

  onOpenFilter = () => {
    if (this.state.filterTags.length === 0) {
      setTimeout(() => {
        this.filterTextInput.focus();
      }, 0);
    }
  }



  render() {
    const { refreshing, data, filterTags } = this.state;
    const numTasks = data.tasks.length;
    const canEdit = this.hasPermission("change");
    const userTags = Tags.userTags(data.tags);
    let deleteWarning = _("Todas as tarefas, imagens e modelos associados a este projeto serão excluídos permanentemente. Tem certeza de que deseja continuar?");
    if (!data.owned) deleteWarning = _("Este projeto foi compartilhado com você. Ele não será excluído, mas simplesmente ocultado do seu painel. Continuar?")

    return (
      <li className={"project-list-item list-group-item " + (refreshing ? "refreshing" : "")}
        href="javascript:void(0);"
        ref={this.setRef("dropzone")}
      >

        {canEdit ?
          <EditProjectDialog
            ref={(domNode) => { this.editProjectDialog = domNode; }}
            title={_("Editar Projeto")}
            saveLabel={_("Salvar alterações")}
            savingLabel={_("Salvando alterações...")}
            saveIcon="far fa-edit"
            showDuplicate={true}
            onDuplicated={this.props.onProjectDuplicated}
            projectName={data.name}
            projectDescr={data.description}
            projectId={data.id}
            projectTags={data.tags}
            deleteWarning={deleteWarning}
            saveAction={this.updateProject}
            showPermissions={this.hasPermission("change")}
            deleteAction={this.hasPermission("delete") ? this.handleDelete : undefined}
          />
          : ""}

        <div className="row no-margin">
          <ErrorMessage bind={[this, 'error']} />
          <div className="btn-group project-buttons">
            {this.hasPermission("add") ?
              <div className={"asset-download-buttons " + (this.state.upload.uploading ? "hide" : "")}>
                <button type='button'
                        className='btn btn-sm rounded-corners upload-file upload-folder bg-success'
                        onClick={() => {
                          const btnTarget = "folderpicker_" + this.props.data.id 
                          document.querySelector(`#${btnTarget}`).click();
                          this.handleUpload();
                          }}>
                          <i className="content-upload-glyphicon" aria-hidden="true"></i>
                          Selecionar pastas
                        <input
                          type="file" 
                          id={"folderpicker_" + this.props.data.id }
                          name="fileList" 
                          webkitdirectory='true' 
                          multiple 
                          style={{display:'none'}} 
                          onChange={this.handleUploadfolders}/>
                </button>
                <button type="button" 
                    className="btn btn-sm rounded-corners upload-file"
                    onClick={() => {
                      const btnTarget = "filerpicker_" + this.props.data.id 
                      document.querySelector(`#${btnTarget}`).click();
                      this.handleUpload();
                    }}>
                    <i className="content-upload-glyphicon" aria-hidden="true"></i>
                    {_("Selecionar imagens e Ponto de Controle")}
                    <input 
                        type="file" 
                        id={"filerpicker_" + this.props.data.id }
                        name="fileList" 
                        accept=".png,.jpg,.jpeg,.zip,.tif"
                        multiple 
                        style={{display:'none'}} 
                        onChange={this.handleUploadFiles}/>
                </button>
                <button type="button"
                  className="btn btn-sm rounded-corners import-file"
                  onClick={this.handleImportTask}>
                  <i className="content-import-glyphicon"></i> {_("Importar")}
                </button>
                {this.state.buttons.map((button, i) => <React.Fragment key={i}>{button}</React.Fragment>)}
              </div>
              : ""}

            <button disabled={this.state.upload.error !== ""}
              type="button"
              className={"btn btn-danger btn-sm " + (!this.state.upload.uploading ? "hide" : "")}
              onClick={this.handleCancel}>
              <i className="glyphicon glyphicon-remove-circle"></i>
              Cancel Upload
            </button>
          </div>

          <div className="project-name">
            {data.name}
            {userTags.length > 0 ?
              userTags.map((t, i) => <div key={i} className="tag-badge small-badge" onClick={this.handleTagClick(t)}>{t}</div>)
              : ""}
          </div>
          <div className="project-description">
            {data.description}
          </div>
          <div className="row project-links">
            {numTasks > 0 ?
              <span className='task-container'>
                <i className='fa fa-tasks'></i>
                <a href="javascript:void(0);" onClick={this.toggleTaskList}>
                  <span>
                    <p>{interpolate(_("%(count)s Tarefas"), { count: numTasks })}</p>
                    <i className={'fa fa-caret-' + (this.state.showTaskList ? 'down' : 'right')}></i>
                  </span>
                </a>
              </span>
              : ""}

            {this.state.showTaskList && numTasks > 1 ?
              <div className="task-filters">
                <div className="btn-group">
                  {this.state.selectedTags.length || this.state.filterText !== "" ?
                    <a className="quick-clear-filter" href="javascript:void(0)" onClick={this.clearFilter}>×</a>
                    : ""}
                  <i className='fa fa-filter'></i>
                  <a href="javascript:void(0);" onClick={this.onOpenFilter} className="dropdown-toggle" data-toggle-outside data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
                    {_("Filtrar")}
                  </a>
                  <ul className="dropdown-menu dropdown-menu-right filter-dropdown">
                    <li className="filter-text-container">
                      <input type="text" className="form-control filter-text theme-border-secondary-07"
                        value={this.state.filterText}
                        ref={domNode => { this.filterTextInput = domNode }}
                        placeholder=""
                        spellCheck="false"
                        autoComplete="false"
                        onChange={this.handleFilterTextChange} />
                    </li>
                    {filterTags.map(t => <li key={t} className="tag-selection">
                      <input type="checkbox"
                        className="filter-checkbox"
                        id={"filter-tag-" + data.id + "-" + t}
                        checked={this.state.selectedTags.indexOf(t) !== -1}
                        onChange={this.toggleTag(t)} /> <label className="filter-checkbox-label" htmlFor={"filter-tag-" + data.id + "-" + t}>{t}</label>
                    </li>)}

                    <li className="clear-container"><input type="button" onClick={this.clearFilter} className="btn btn-default btn-xs" value={_("Limpar")} /></li>
                  </ul>
                </div>
                <div className="btn-group">
                  <i className='fa fa-sort-alpha-down'></i>
                  <a href="javascript:void(0);" className="dropdown-toggle" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
                    {_("Organizar")}
                  </a>
                  <SortPanel selected="-created_at" items={this.sortItems} onChange={this.sortChanged} />
                </div>
              </div> : ""}

            {numTasks > 0 && this.state.showMap ?
              <span>
                <i key="edit-icon" className='fa fa-globe'></i>
                <a key="edit-text" href="javascript:void(0);" onClick={this.viewMap}>
                  {_("Ver mapa")}
                </a>
              </span>
              : ""}

            {canEdit ?
              <span>
                <i key="edit-icon" className='far fa-edit'></i>
                <a key="edit-text" href="javascript:void(0);" onClick={this.handleEditProject}>
                  {_("Editar")}
                </a>
              </span>
              : ""}

            {!canEdit && !data.owned ?
              [<i key="edit-icon" className='far fa-eye-slash'></i>
                , <a key="edit-text" href="javascript:void(0);" onClick={this.handleHideProject(deleteWarning, this.handleDelete)}> {_("Delete")}
              </a>]
              : ""}

          </div>
        </div>
        <i className="drag-drop-icon fa fa-inbox"></i>
        <div className="row">
          {this.state.upload.uploading ? <UploadProgressBar {...this.state.upload} /> : ""}

          {this.state.upload.error !== "" ?
            <div className="alert alert-warning alert-dismissible">
              <button type="button" className="close" title={_("Close")} onClick={this.closeUploadError}><span aria-hidden="true">&times;</span></button>
              {this.state.upload.error}
            </div>
            : ""}

          {this.state.upload.editing ?
            <NewTaskPanel
              onSave={this.handleTaskSaved}
              onCancel={this.handleTaskCanceled}
              suggestedTaskName={this.handleTaskTitleHint}
              filesCount={this.state.upload.totalCount}
              showResize={true}
              getFiles={() => this.state.upload.files}
            />
            : ""}

          {this.state.importing ?
            <ImportTaskPanel
              onImported={this.newTaskAdded}
              onCancel={this.handleCancelImportTask}
              projectId={this.state.data.id}
            />
            : ""}

          {this.state.showTaskList ?
            <TaskList
              ref={this.setRef("taskList")}
              source={`/api/projects/${data.id}/tasks/?ordering=${this.state.sortKey}`}
              onDelete={this.taskDeleted}
              onTaskMoved={this.taskMoved}
              hasPermission={this.hasPermission}
              onTagsChanged={this.tagsChanged}
              onTagClicked={this.selectTag}
              history={this.props.history}
            /> : ""}

        </div>
      </li>
    );
  }
}

export default ProjectListItem;
