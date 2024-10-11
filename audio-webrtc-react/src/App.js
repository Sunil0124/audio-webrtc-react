
import React, { useState, useRef, useEffect } from 'react';
import SimplePeer from 'simple-peer';
import AV from './av';
import './styles.css'
import io from 'socket.io-client';

const socket = io('http://localhost:3001');  // Connect to your signaling server


function App() {
  const [stream, setStream] = useState(null);
  const [isFilterOn, setIsFilterOn] = useState(false);
  const [signalData, setSignalData] = useState([]);
  const myVideoRef = useRef();
  const peerVideoRef = useRef();
  const peerRef = useRef();
  let audioContext, gainNode, filterNode;
  const [devices,setDevices] = useState({inputs:[], outputs:[]});
  const [selectedInputDevice, setSelectedInputDevice] = useState(null);
  

  const fetchAudioDevices = async () =>{
    //Retrives and updates the state with available audio input and output devices
    const deviceInfos =  await navigator.mediaDevices.enumerateDevices();
    const audioInputs = deviceInfos.filter((d) => d.kind ==='audioinput');
    const audioOutputs = deviceInfos.filter((d) => d.kind ==='audiooutput');
    setDevices({
      inputs: audioInputs,
      outputs: audioOutputs,
    });
  }

  const initiatAudioStream = async () => {
    //Capture audio from the selected device while disabling video, with error handling
    try {
      const constraints = {
        audio:{
          deviceId: selectedInputDevice ? { exact: selectedInputDevice} : undefined
        },
        video: false
      };

      const audiostream = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(audiostream);
      myVideoRef.current.srcObject = audiostream;

      //setting up web audio API filters
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioContext.createMediaStreamSource(audiostream);
      gainNode = audioContext.createGain();
      filterNode = audioContext.createBiquadFilter();

      gainNode.gain.value = 0.75;
      filterNode.type = 'lowpass';
      filterNode.frequency.value = 200;

      if (isFilterOn) {
        source.connect(gainNode).connect(filterNode).connect(audioContext.destination);
      } else {
        source.connect(audioContext.destination);
      }
    

  
    //connects to peer using WebRTC and streams audio
    const peerConnection = new SimplePeer({
      initiator: true,
      trickle: false,
      stream: audiostream,
    });

    peerConnection.on('signal', (data) => { 
      //Exchange signal data for peer
     // console.log('SIGNAL', JSON.stringify(data)); 
     console.log('Sending signal data: ', data);
    // setSignalData(prevData => [...prevData, data]);
     socket.emit('signal',data);
    });

    peerConnection.on('stream', (stream) => {
      //To play the incoming stream from peer
      peerVideoRef.current.srcObject = stream;
    });

    peerRef.current = peerConnection;
  }
catch (err) {
  console.error('Error accessing media devices.', err);
}
};

 // Connect to peer using signaling server
 const establishPeerConnection = () => {
  if (!peerRef.current) {
    console.error('No peer reference available');
    return;
  }
  console.log('Connecting to peer...');
};


  useEffect(() =>{
    console.log("registering socket event listener");
    const handleSignal = (data) =>{
      console.log("received signal data from server", data);
      setSignalData(prevData => [...prevData,data]);
    };
    socket.on('signal', handleSignal);
    return () =>{
      console.log("cleaning up socket event listener");
      socket.off('signal', handleSignal)
    }
    // socket.on('signal', (data) =>{
    //   console.log('Received signa; data from server: ', data);
    //   setSignalData(prevData => [...prevData,data]);
    // })
  },[]);

  const connectToSelectedSignal = (signal) =>{
    console.log('connecting to selected signal...');
    if(peerRef.current){
      peerRef.current.signal(signal);
    }else{
       // Create a new peer if none exists (for non-initiators)
      const peer = new SimplePeer({
        initiator: false,
        trickle:false,
      });
      peer.on('signal', (data) =>{
        socket.emit('signal', data);// Send signal data back to the server
      });
      peer.on('stream', (remoteStream) =>{
        peerVideoRef.current.srcObject = remoteStream;
      });
      peer.signal(signal);// Connect to the signal selected from the dropdown
      peerRef.current =peer;
    }
    
    //peerRef.current.signal(signal);
  };

  const toggleFilter = () => {
    //toggle filter (gain + frequency)
    setIsFilterOn(!isFilterOn);
    const filterSignalData = {
      type: 'filter-toggle',
      filterState: !isFilterOn,
    };
    socket.emit('signal', filterSignalData);// Emit signal with filter state
    if (audioContext && stream) {
      if (isFilterOn) {
        audioContext.close();
      } else {
        initiatAudioStream();
      }
    }
  };
  const changeOutputDevice =(deviceId) =>{
    //sets the audio output device to the selected one
    const audioElement = myVideoRef.current;
    if(audioElement.setSinkId){
      audioElement.setSinkId(deviceId)
      .then(() => console.log(`Output device set to ${deviceId}`))
      .catch(err => console.error('Error setting output device', err))
    }else{
      console.warn('setSinkId() is not supported by browser');
    }
  };

  useEffect(() =>{
    //fetch audio input and output devices on the mount 
    fetchAudioDevices();
  }, []);

  //handle incoming singal data fromthe server and pass it to peer
  // useEffect(() =>{
  //   socket.on('signal',(data) =>{
  //     console.log('Received singal data from server:', data);
  //     if(peerRef.current){
  //       peerRef.current.signal(data);
  //     }
  //   })
  // },[]);
//------------------
  // const handleSignalData = (signalData) => {
  //   //handles incoming signaling data for peer connection
  //   try {
  //     const parsedSignalData = JSON.parse(signalData);
  //     con
  //     peerRef.current.signal(parsedSignalData);
  //   } catch (error) {
  //     console.error("Invalid signal data format or error in signaling:", error);
  //   }
  // };

  const processSignalData = (signalString) => {
    try {
      const parsedSignal = JSON.parse(signalString);
      console.log("Parsed signal data from textarea:", parsedSignal);
      if (peerRef.current) {
        peerRef.current.signal(parsedSignal);  // Use the signal to connect to the peer
      } else {
        console.error("No peer connection found");
      }
    } catch (error) {
      console.error("Invalid signal data entered:", error);
    }
  };

  return (
    <div className="app-container">
      <h1><span role="img" aria-label="musical notes">🎶</span> Audio Streaming App <span role="img" aria-label="musical notes">🎶</span></h1>
      <div className="input-output-select">
        <h3> Select Audio Input:  </h3>
          <select onChange={(e) => setSelectedInputDevice(e.target.value)}>
            {devices.inputs.length > 0 ?(
            devices.inputs.map((d) =>(
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || `Microphone ${d.deviceId}`}
            </option>
          ))
        ):(
            <option> No audio input devices found</option>
          )}
          </select>
        <h3> Select Audio Output:  </h3>
        
          <select onChange={(e) => changeOutputDevice(e.target.value)}>
          {devices.outputs.length > 0 ? (
            devices.outputs.map((d) =>(
          //  {devices.filter((d) => d.kind ==='audiooutput').map((d) =>(
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || `Speaker ${d.deviceId}`}
            </option>
          ))
        
        ):(
        <option>no audio output devices found</option>)
      }
      </select>
</div>

<div className="buttons-container">
<button onClick={initiatAudioStream}><span role="img" aria-label="microphone">🎤</span> Start Audio </button>

       
 <button onClick={establishPeerConnection}>🔗 Connect to Peer</button>

 <button onClick={toggleFilter}>
  {isFilterOn ? (
    <span><span role="img" aria-label="mixer board">🎚️</span> Turn Filter Off</span>
  ) : (
    <span><span role="img" aria-label="control knobs">🎛️</span> Turn Filter On</span>
  )}
</button>

</div>

<div className="call-container">
  <h3>Call:</h3>
  <select onChange={(e) => connectToSelectedSignal(JSON.parse(e.target.value))}>
    {signalData.length > 0 ? (
      signalData.map((signal,i) =>(
        <option key={i} value={JSON.stringify(signal)}>
          Signal {i+1}
        </option>
      ))
    ):(<option>No signals available</option>)}
  </select>
</div>

      <div className="audio-container">
        <h3> Your Audio</h3>
        <audio ref={myVideoRef} controls autoPlay />
        <h3> Peer Audio</h3>
        <audio ref={peerVideoRef} controls autoPlay />
      </div>
      <textarea
        placeholder="Paste signal data here"
        onChange={(e) => processSignalData(e.target.value)}
        className="signal-input"
      />
      {audioContext && <AV audioContext={audioContext} />}
    </div>
  );
}

export default App;