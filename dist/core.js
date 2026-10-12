(function(root){
  const levels=['IID','Bộ phận','Cá nhân'];
  const months=q=>Array.from({length:3},(_,i)=>(q-1)*3+i+1);
  function migrate(s){
    const x=JSON.parse(JSON.stringify(s)); x.version=2; x.history=x.history||[];x.actions=x.actions||[];x.archive=x.archive||[];
    x.kpis.forEach(k=>{k.mode=k.mode||'last';k.plan=k.plan||'annual';k.targets=k.targets||{};k.updates=k.updates||{};});return x;
  }
  const key=k=>JSON.stringify(k.level==='IID'?['IID']:k.level==='Bộ phận'?['Bộ phận',k.team]:['Cá nhân',k.team,k.owner]);
  const label=ks=>ks[0].level==='IID'?'Toàn khối IID':ks[0].level==='Bộ phận'?ks[0].team:ks[0].owner+' · '+ks[0].team;
  function target(k,m){if(k.targets[m]!=null)return k.targets[m];return k.plan==='linear'?k.target*m/12:k.plan==='monthly'?k.target/12:k.target;}
  function attainment(actual,t,direction){if(actual==null||t==null)return null;if(direction==='down')return actual===0?120:t/actual*100;return t===0?(actual===0?100:120):actual/t*100;}
  function measure(k,period){let ms=period.type==='quarter'?months(period.value):[period.value];let values=ms.map(m=>k.updates[m]?.actual),targets=ms.map(m=>target(k,m));let coverage=values.filter(a=>a!=null).length;let aggregate=a=>k.mode==='sum'?a.reduce((s,v)=>s+v,0):k.mode==='average'?a.reduce((s,v)=>s+v,0)/a.length:a.at(-1);let needed=k.mode==='last'?values.at(-1)!=null:coverage===ms.length;let a=needed?aggregate(values):null,t=aggregate(targets);return{actual:a,target:t,score:attainment(a,t,k.direction),coverage,total:ms.length};}
  function groups(ks){let out={};ks.forEach(k=>(out[key(k)]??=[]).push(k));return out;}
  function weighted(ks,p){if(!ks.length||Math.abs(ks.reduce((s,k)=>s+k.weight,0)-100)>.01)return null;let results=ks.map(k=>measure(k,p).score);return results.some(v=>v==null)?null:results.reduce((s,v,i)=>s+Math.min(120,v)*ks[i].weight/100,0);}
  function composite(s,ks,p){let own=weighted(ks,p);if(ks[0].level==='IID')return own;let iid=weighted(s.kpis.filter(k=>k.level==='IID'),p),dept=weighted(s.kpis.filter(k=>k.level==='Bộ phận'&&k.team===ks[0].team),p);let vals=ks[0].level==='Cá nhân'?[iid,dept,own]:[iid,own],mix=s.mix[ks[0].level==='Cá nhân'?'personal':'department'];return vals.some(v=>v==null)?null:vals.reduce((sum,v,i)=>sum+v*mix[i]/100,0);}
  function validate(s){if(!s||!Array.isArray(s.kpis)||!s.reviews||!s.mix)throw Error('Thiếu cấu trúc dữ liệu KPI.');let ids=new Set();for(let k of s.kpis){if(!k||typeof k.id!=='string'||ids.has(k.id)||!levels.includes(k.level)||!['up','down'].includes(k.direction)||!Number.isFinite(k.target)||k.target<=0||!Number.isFinite(k.weight)||k.weight<0||k.weight>100||!k.updates||['name','owner','team','unit','source','frequency'].some(n=>typeof k[n]!=='string'))throw Error('KPI không hợp lệ.');ids.add(k.id);if(k.mode&&!['sum','average','last'].includes(k.mode)||k.plan&&!['annual','linear','monthly'].includes(k.plan))throw Error('Cách tính kỳ không hợp lệ.');for(let [m,u]of Object.entries(k.updates))if(!/^([1-9]|1[0-2])$/.test(m)||!u||!Number.isFinite(u.actual)||u.actual<0||typeof u.note!=='string')throw Error('Kết quả tháng không hợp lệ.');for(let[m,t]of Object.entries(k.targets||{}))if(!/^([1-9]|1[0-2])$/.test(m)||!Number.isFinite(t)||t<0)throw Error('Mục tiêu tháng không hợp lệ.');}
    for(let k of s.kpis){if(k.ownerEmail!=null&&(typeof k.ownerEmail!=='string'||k.ownerEmail&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(k.ownerEmail)))throw Error('Email người được giao không hợp lệ.');if(k.level!=='IID'&&!s.kpis.some(p=>p.id===k.parent&&p.level===(k.level==='Bộ phận'?'IID':'Bộ phận')&&(k.level!=='Cá nhân'||p.team===k.team)))throw Error('Liên kết cấp trên phải đúng cấp và cùng bộ phận.');}
    for(let [n,b]of [['department',[[30,70],[30,70]]],['personal',[[20,40],[30,50],[20,40]]]]){let a=s.mix[n];if(!Array.isArray(a)||a.length!==b.length||a.some((v,i)=>!Number.isFinite(v)||v<b[i][0]||v>b[i][1])||Math.abs(a.reduce((x,y)=>x+y,0)-100)>.01)throw Error('Cơ cấu trọng số không hợp lệ.');}
    if(s.actions&&!Array.isArray(s.actions)||s.history&&!Array.isArray(s.history)||s.archive&&!Array.isArray(s.archive))throw Error('Dữ liệu quản lý không hợp lệ.');
    for(let a of s.actions||[])if(!a||['id','title','owner','due','status'].some(n=>typeof a[n]!=='string')||!['Mới','Đang làm','Hoàn tất'].includes(a.status)||!/^\d{4}-\d{2}-\d{2}$/.test(a.due))throw Error('Hành động không hợp lệ.');
    for(let r of Object.values(s.reviews))if(!r||typeof r.note!=='string'||!['Nháp','Đã đánh giá'].includes(r.status))throw Error('Đánh giá không hợp lệ.');return true;
  }
  root.KPI={migrate,months,key,label,target,attainment,measure,groups,weighted,composite,validate};if(typeof module!=='undefined')module.exports=root.KPI;
})(typeof window!=='undefined'?window:globalThis);
