/** Small HTTP client for Codex/tools and other external controllers. */
export class ArenaClient {
  constructor(baseURL='http://127.0.0.1:3000') {this.baseURL=baseURL;}
  async request(path,value) {
    const response=await fetch(new URL(path,this.baseURL),{method:value===undefined?'GET':'POST',headers:value===undefined?{}:{'Content-Type':'application/json'},body:value===undefined?undefined:JSON.stringify(value),signal:AbortSignal.timeout(5000)});
    const data=await response.json();if(!response.ok)throw new Error(data.error);return data;
  }
  observe(){return this.request('/api/state');}
  async claim(role='wingman',name='Codex'){this.lease=await this.request('/api/claim',{role,name,token:this.lease?.role===role?this.lease.token:undefined});return {role:this.lease.role};}
  act(action,durationMs=300){if(!this.lease)throw new Error('Claim a ship first');return this.request('/api/action',{...this.lease,action,durationMs});}
  step(action,frames=60){if(!this.lease)throw new Error('Claim a ship first');return this.request('/api/step',{...this.lease,action,frames});}
  async release(){if(this.lease)await this.request('/api/release',{token:this.lease.token});this.lease=null;}
  start(mode='coop'){return this.request('/api/start',{mode});}
}
