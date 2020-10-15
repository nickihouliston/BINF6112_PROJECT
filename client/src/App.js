import React, { Component } from 'react';
import './App.css';
import { OutTable, ExcelRenderer } from 'react-excel-renderer';
import { Col, Input, InputGroup, InputGroupAddon, FormGroup, Label, Button, Fade, FormFeedback, Container, Card } from 'reactstrap';
import axios from 'axios';
import Navbar from './components/Navbar';
import Table from './components/Table';

// todo: 
// - convert to hooks 
// - split into different components

const apiURL = "http://localhost:8000";

export default class App extends Component {
  constructor(props){
    super(props);
    this.state={
        apiResponse: "",
        isOpen: false,
        dataLoaded: false,
        isFormInvalid: false,
        fileObject: null,
        rows: null,
        cols: null,
        processedData: null
    }
    this.fileHandler = this.fileHandler.bind(this);
    this.toggle = this.toggle.bind(this);
    this.openFileBrowser = this.openFileBrowser.bind(this);
    this.renderFile = this.renderFile.bind(this);
    this.fileInput = React.createRef();
  }

    // callAPI() {
    // fetch("http://localhost:9000/testAPI")
    //     .then(res => res.text())
    //     .then(res => this.setState({ apiResponse: res }))
    //     .catch(err => err);
    // }

    // componentDidMount() {
    //     this.callAPI();
    // }

    // Loads and renders file to client
    renderFile = (fileObj) => {
        //just pass the fileObj as parameter
        ExcelRenderer(fileObj, (err, resp) => {
        if(err){
            console.log(err);            
        }
        else{
            this.setState({
            dataLoaded: true,
            cols: resp.cols,
            rows: resp.rows
            });
        }
        }); 
    }

    // Checks if file is valid
  fileHandler = (event) => {    
    if(event.target.files.length){
        this.setState({
            fileObject: event.target.files
        });
        let fileObj = event.target.files;
       
        for (var i = 0; i < fileObj.length; i++) {
            let fileName = fileObj[i].name;
            if(fileName.slice(fileName.lastIndexOf('.')+1) === "xlsx"){
              this.setState({
                  uploadedFileName: fileName,
                  isFormInvalid: false
              });
              this.renderFile(fileObj[i])
            } else{
              this.setState({
                  isFormInvalid: true,
                  uploadedFileName: ""
              })
              break;
            }
              

        }
        //check for file extension and pass only if it is .xlsx and display error message otherwise
        
    }               
  }


  // Backend incorporation
  onClickHandler = () => {
    const data = new FormData();
    for(var x = 0; x<this.state.fileObject.length; x++) {
      data.append('file', this.state.fileObject[x])
    }
    axios.post(apiURL + '/upload', data, {
        
    }).then(res => {
        console.log(res);
        if (res.status === 200) {
          axios.get(apiURL+"/process")
              .then(rsp => rsp.data)
              .then(json => {
                console.log(json);
                this.setState({
                  processedData: json,
                  dataLoaded: false
                });
              });
        }
    }).catch(err => console.log(err))
  }

  toggle() {
    this.setState({
      isOpen: !this.state.isOpen
    });
  }

  openFileBrowser = () => {
    this.fileInput.current.click();
  }

  render() {
    return (
      <div>
        <Navbar />
        <Container>
        <form className="input-form">
          <FormGroup row>
            <Label for="exampleFile" xs={6} sm={4} lg={2} size="lg">Upload</Label>          
            <Col xs={4} sm={8} lg={10}>                                                     
              <InputGroup>
                <InputGroupAddon addonType="prepend">
                    <Button color="info" style={{color: "white", zIndex: 0}} onClick={this.openFileBrowser.bind(this)}>
                        <i className="cui-file"></i>
                        Browse&hellip;
                    </Button>
                  <input type="file" hidden onChange={this.fileHandler.bind(this)} ref={this.fileInput} multiple onClick={(event)=> { event.target.value = null }} style={{"padding":"10px"}} />      
                  <button type="button" class="btn btn-success btn-block" onClick={this.onClickHandler}>
                      Upload
                  </button>
                </InputGroupAddon>
                <Input type="text" className="form-control" value={this.state.uploadedFileName} readOnly invalid={this.state.isFormInvalid} />                                              
                <FormFeedback>    
                  <Fade in={this.state.isFormInvalid} tag="h6" style={{fontStyle: "italic"}}>
                    Please select a .xlsx file only !
                  </Fade>                                                                
                </FormFeedback>
              </InputGroup>     
            </Col>                                                   
            </FormGroup>
        </form>

        {this.state.dataLoaded && 
        <div className="output-table">
          <Card body outline color="secondary" className="restrict-card">
              <OutTable data={this.state.rows} columns={this.state.cols} tableClassName="ExcelTable2007" tableHeaderRowClass="heading" />
          </Card>  
        </div>}
        {this.state.processedData && 
          <Table data={this.state.processedData} />
        }
        </Container>
      </div>
    );
  }
}

/*
<Switch>
        <Nav />
        <Route path='/home'/>
        <Route path='/results'/>
      </Switch>
*/