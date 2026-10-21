/** Network transport only. The server owns physics; the browser interpolates snapshots. */
export class OnlineSession {
  constructor(onChange) {
    this.onChange=onChange;this.connected=false;this.token=null;this.events=[];this.nextInput=0;this.delay=500;this.closed=false;this.connect();
  }
  connect() {
    this.socket=new WebSocket(`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}/ws`);
    this.socket.onopen=()=>{this.connected=true;this.delay=500;this.socket.send(JSON.stringify({type:'join'}));this.onChange();};
    this.socket.onmessage=event=>{
      try {
        const message=JSON.parse(event.data);
        if(message.type==='spectator'){this.token=null;this.error=null;}
        if(message.type==='joined'){this.token=message.token;this.error=null;}
        if(message.type==='error'){this.error=message.error;}
        if(message.type==='state'){
          const snapshot=message.observation;
          this.previous=this.latest;this.latest=snapshot;this.receivedAt=performance.now();
          this.previousLists={};
          if(this.previous?.matchId===snapshot.matchId && this.previous.wave===snapshot.wave) for(const key of ['ships','enemies','shots','drops']) this.previousLists[key]=new Map((this.previous[key] || []).map(item=>[item.id,item]));
          this.events.push(...message.events);if(this.events.length>100)this.events.splice(0,this.events.length-100);
        }
        this.onChange();
      }catch{this.error='Invalid server message';}
    };
    this.socket.onclose=()=>{this.connected=false;this.token=null;this.onChange();if(!this.closed){setTimeout(()=>this.connect(),this.delay);this.delay=Math.min(5000,this.delay*2);}};
    this.socket.onerror=()=>{this.error='Arena connection failed';};
  }
  async request(path,value) {
    const response=await fetch(path,{method:value===undefined?'GET':'POST',headers:value===undefined?{}:{'Content-Type':'application/json'},body:value===undefined?undefined:JSON.stringify(value),signal:AbortSignal.timeout(10000)});
    const data=await response.json();if(!response.ok)throw new Error(data.error);return data;
  }
  async start(mode=this.latest?.mode || 'coop') {
    if(!this.connected)throw new Error('Arena is disconnected; wait for reconnection');
    if(this.starting)return;
    this.starting=true;
    try {
      const snapshot=await this.request('/api/start',{mode});
      this.previous=null;this.previousLists={};this.latest=snapshot;this.receivedAt=performance.now();
      this.token=null;this.error=null;this.nextInput=0;
      this.socket.send(JSON.stringify({type:'join'}));
    } finally {this.starting=false;}
  }
  async pause(command) {await this.request('/api/control',{command});}
  sendInput(action,timestamp,force=false) {
    if(this.latest?.mode==='ai' || !this.connected || !this.token || (!force && timestamp<this.nextInput))return;
    this.nextInput=timestamp+33;
    this.socket.send(JSON.stringify({type:'input',token:this.token,action,durationMs:250}));
  }
  drainEvents(){return this.events.splice(0);}
  view(timestamp) {
    if(!this.latest)return null;
    const view={...this.latest}; const t=Math.max(0,Math.min(1,(timestamp-this.receivedAt)/50));
    for(const key of ['ships','enemies','shots','drops'])view[key]=(this.latest[key] || []).map(item=>{
      const previous=this.previousLists[key]?.get(item.id);if(!previous || !item.id)return item;
      return {...item,x:previous.x+(item.x-previous.x)*t,y:previous.y+(item.y-previous.y)*t};
    });
    view.player=view.ships.find(ship=>ship.id==='player') || view.player;view.wingman=view.ships.find(ship=>ship.id==='wingman') || null;
    if(!this.connected)view.state='paused';
    return view;
  }
  close(){this.closed=true;this.socket.close();}
}
