'use strict';
const fs=require('node:fs');
const assert=require('node:assert/strict');
// Existing JSON usage goldens at eb73f9b7cd576c248f5c50963169386d25dbf96f.
function baseline(){return [
 {cached:20,cost_usd:0.25,input:35,model:'claude-sonnet-5-5',output:7,reasoning:null,source:'harness',state:'complete'},
 {cached:null,cost_usd:null,input:null,model:'claude-sonnet-5-5',output:7,reasoning:null,source:'harness',state:'partial'},
 {cached:20,cost_usd:0.5,input:35,model:'claude-sonnet-5-5',output:7,reasoning:null,source:'harness',state:'complete'}
];}
function extract(s){return Array.from(s.matchAll(/`(\{"cached":[^`]+\})`/g),m=>JSON.parse(m[1]));}
function compare(before,after){
 assert.equal(before.length,3,'three existing usage goldens');assert.equal(after.length,before.length);
 for(let i=0;i<before.length;i++){
  assert.ok(Object.hasOwn(after[i],'cache_write'),'golden '+i+' must add cache_write');
  const {cache_write,...rest}=after[i];assert.deepStrictEqual(rest,before[i]);assert.equal(cache_write,i===1?null:5);
 }
}
if(require.main===module){
 const before=baseline();const good=before.map((u,i)=>({...u,cache_write:i===1?null:5}));compare(before,good);
 if(process.argv[2]==='good')console.log('accepted');else{
  for(let i=0;i<good.length;i++)for(const k of Object.keys(good[i])){const bad=JSON.parse(JSON.stringify(good));bad[i][k]=k==='state'?'unknown':-1;assert.throws(()=>compare(before,bad));}
  console.log('rejected');process.exitCode=1;
 }
}else{
 const {Then}=require('@cucumber/cucumber');
 Then('k-exec-usage-cache-write: existing usage goldens differ only by cache_write',function(){compare(baseline(),extract(fs.readFileSync('executor/claudecode/failed_round_usage_test.go','utf8')));});
}
