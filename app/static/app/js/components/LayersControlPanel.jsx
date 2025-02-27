import React from 'react';
import PropTypes from 'prop-types';
import '../css/LayersControlPanel.scss';
import LayersControlLayer from './LayersControlLayer';
import { _ } from '../classes/gettext';
import { active } from 'd3';

export default class LayersControlPanel extends React.Component {
  static defaultProps = {
      layers: [],
      overlays: [],
  };
  static propTypes = {
    onClose: PropTypes.func.isRequired,
    layers: PropTypes.array.isRequired,
    overlays: PropTypes.array,
    map: PropTypes.object.isRequired,
    handleChangeTile: PropTypes.func.isRequired,
  }

  constructor(props){
    super(props);

    this.state = {
        activeTile: 0,
    }
  }

  handleCheckbox = (tileId) => {
    this.setState({activeTile: tileId});
    this.props.handleChangeTile();
  }

render() {
    let content = "";

    if (!this.props.layers.length) {
        content = (
            <span>
                <i className="loading fa fa-circle-notch fa-spin"></i> 
                {_("Carregando…")}
            </span>
        );
    } else {
        content = (
            <div>
                {this.props.overlays.length ? 
                    <div className="overlays theme-border-primary">
                        {this.props.overlays.map((layer, i) => (
                            <div key={i}>
                                <LayersControlLayer map={this.props.map} expanded={false} overlay={true} layer={layer} />
                                {i < this.props.overlays.length && <span className="horizontal-bar"></span>}
                            </div>
                        ))}
                    </div>
                : ""}
                {this.props.layers.sort((a, b) => {
                    const m_a = a[Symbol.for("meta")] || {};
                    const m_b = b[Symbol.for("meta")] || {};
                    return m_a.name > m_b.name ? -1 : 1;
                }).map((layer, i) => {
                    return(
                    <div key={(layer[Symbol.for("meta")] || {}).name || i}> 
                        <LayersControlLayer map={this.props.map} expanded={this.props.layers.length === 1} overlay={false} layer={layer} tileID={i} checked={this.state.activeTile === i} onCheckboxChange={() => this.handleCheckbox(i)} />
                    </div>
                )})}
            </div>
        );
    }

    return (
        <div className="layers-control-panel">
            <span className="close-button fas fa-times" onClick={this.props.onClose}></span>
            <div className="title">{_("CAMADAS")}</div>
            {content}
        </div>
    );
}

}
