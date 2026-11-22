import { describe,it,expect } from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {configFile,readServers,mutateServers} from './config-store.js';
describe('MCP configuration store',()=>{
 it('persists validated entries independently by scope',()=>{
 const root=mkdtempSync(tmpdir()+'/ocean-mcp-');
 try {
 const file=configFile('local',root,root);
 mutateServers(file,()=>[{id:'demo',name:'demo',command:'node',args:['server.js'],enabled:true}]);
 expect(readServers(file)[0].enabled).toBe(true);
 mutateServers(file,rows=>rows.map(row=>({...row,enabled:false})));
 expect(readServers(file)[0].enabled).toBe(false);
 expect(readServers(configFile('user',root,root))).toEqual([]);
 mutateServers(file,()=>[]);
 expect(readServers(file)).toEqual([]);
 } finally {rmSync(root,{recursive:true,force:true});}
 });
});
