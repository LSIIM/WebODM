import React from 'react';
import PropTypes from 'prop-types';
import { _ } from '../classes/gettext';
import '../css/ErrorMessage.scss';

class ErrorMessage extends React.Component {
    static propTypes = {
        bind: PropTypes.array.isRequired // two element array, 
                                               // with first element being the parent element 
                                               // and the second the error property to display
                                               // ex. [this, 'error']
    };

    constructor(props){
        super(props);
        this.close = this.close.bind(this);
    }

    close(){
        const [parent, prop] = this.props.bind;
        parent.setState({[prop]: ""});
    }

    render(){
        const [parent, prop] = this.props.bind;

        if (parent.state[prop]){
            return (
                <div className={"alert alert-warning alert-dismissible " + (this.props.className ? this.props.className : "")}>
                    <div className="alert-icon">
                        <i className="fa fa-exclamation-triangle"></i>
                    </div>
                    <div className="error-alert">Erro!</div>
                    
                    <button type="button" className="close" title={_("Close")} onClick={this.close}>Fechar</button>
                    {/* {parent.state[prop]} */}
                    <div className="error-message">
                    Não foi detectada nenhuma daninha no talhão selecionado!
                    </div>
                </div>
                
            );
        }else{
            return (<div></div>);
        }
    }
}

export default ErrorMessage;