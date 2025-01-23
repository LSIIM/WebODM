import React from 'react';
import ReactDOM from 'react-dom';
import L from 'leaflet';
import PropTypes from 'prop-types';
import '../css/OverviewControl.scss';
import OverviewControlPanel from './OverviewControlPanel';

class OverviewControl extends React.Component {
    static propTypes = {
        selectedLayers: PropTypes.array.isRequired,
        removeGeoJsonDetections: PropTypes.func,
        loadGeoJsonDetections: PropTypes.func,
        overlays: PropTypes.array.isRequired,
        tiles: PropTypes.array,
        isOpen: PropTypes.bool.isRequired, // Visibilidade
        onOpen: PropTypes.func.isRequired, // Função para abrir
        onClose: PropTypes.func.isRequired, // Função para fechar
    }

    render() {
        const { isOpen, onOpen, onClose } = this.props;

        return (
            <div className={isOpen ? "open" : ""}>
                <a
                    href="javascript:void(0);"
                    title="Visão geral"
                    onClick={() => {
                        console.log('isOpen antes de acionar onClick:', isOpen); // Verifique o valor de `isOpen` antes
                        isOpen ? onClose() : onOpen();  // Acione `onOpen` ou `onClose`
                    }}
                    className="leaflet-control-overview-control-button leaflet-bar-part theme-secondary">
                </a>
                {isOpen && (
                    <OverviewControlPanel
                        tiles={this.props.tiles}
                        onClose={onClose}
                        selectedLayers={this.props.selectedLayers}
                        removeGeoJsonDetections={this.props.removeGeoJsonDetections}
                        loadGeoJsonDetections={this.props.loadGeoJsonDetections}
                        overlays={this.props.overlays}
                    />
                )}
            </div>
        );
    }
}

export default L.Control.extend({
    options: {
        position: 'topright'
    },

    onAdd: function (map) {
        this.container = L.DomUtil.create('div', 'leaflet-control-overview-control leaflet-bar leaflet-control');
        this.map = map;

        L.DomEvent.disableClickPropagation(this.container);

        this.update(this.options.selectedLayers, 
                    this.options.removeGeoJsonDetections, 
                    this.options.loadGeoJsonDetections,
                    this.options.tiles,
                    this.options.overlays,
                    this.options.isOpen,
                    this.options.onOpen,
                    this.options.onClose);

        return this.container;
    },

    update: function(selectedLayers, removeGeoJsonDetections, loadGeoJsonDetections, tiles, overlays, isOpen, onOpen, onClose) {
        ReactDOM.render(
            <OverviewControl
                map={this.map}
                selectedLayers={selectedLayers}
                removeGeoJsonDetections={removeGeoJsonDetections}
                loadGeoJsonDetections={loadGeoJsonDetections}
                tiles={tiles}
                overlays={overlays}
                isOpen={isOpen}
                onOpen={onOpen}
                onClose={onClose}
            />, 
            this.container
        );
    },
    

    updateSelectedLayers: function(selectedLayers, overlays) {
        this.update(selectedLayers,
                    this.options.removeGeoJsonDetections, 
                    this.options.loadGeoJsonDetections,
                    this.options.tiles,
                    overlays,
                    this.options.isOpen,
                    this.options.onOpen,
                    this.options.onClose);
    },

    updateOverlays: function(overlays, selectedLayers) {
        this.update(selectedLayers,
                    this.options.removeGeoJsonDetections, 
                    this.options.loadGeoJsonDetections,
                    this.options.tiles,
                    overlays,
                    this.options.isOpen,
                    this.options.onOpen,
                    this.options.onClose);
    }
});