export const GROUPS = [
  ['gm','GM',0],['omni','OMNI',0],
  ['fashion','Fashion',1],['unloading','Unloading',1],['offices','Offices',1],['leadership','Leadership',1],
  ['food','Food / grocery',2],['cosmetics','Cosmetics',2],['consumables','Consumables',2],['pharmacy','Pharmacy',2],['vision','Vision centre',2],['claims','Claims',2],
  ['produce','Produce',3],['bakery','Bakery / deli',3],['meat','Meat',3],['dairy','Dairy / frozen',3],
  ['csm','CSM',4],['service','Service desk',4],['greeter','Greeter',4],['standards','Store standards',4],
  ['sco','SCO',5],['cash','Cash',5],['other','Other / check group',5],
].map(([id,label,column])=>({id,label,column}));

export function defaultSettings() {
  return {title:'Daily Shift Plan',date:new Date().toLocaleDateString('en-CA'),paper:'letter',blankRows:1,showArea:true,includeCarryIn:false,
    groups:GROUPS.map(g=>({...g}))};
}
export const uid=()=>globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
export const groupLabel=(id,settings)=>settings?.groups.find(g=>g.id===id)?.label || GROUPS.find(g=>g.id===id)?.label || 'Other';
export function roleGroup(raw) {
  const s=raw.toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ');
  if (/dairy|frozen/.test(s)) return 'dairy';
  if (/produce/.test(s)) return 'produce';
  if (/omni/.test(s)) return /lead/.test(s)?'leadership':'omni';
  if (/bakery|\bdel[il]\b|\bdeil\b/.test(s)) return 'bakery';
  if (/people greeter|greet/.test(s)) return 'greeter';
  if (/csm|front end service supervisor/.test(s)) return 'csm';
  if (/cashier|visiting cash/.test(s)) return 'cash';
  if (/sco|self checkout/.test(s)) return 'sco';
  if (/customer service|service desk/.test(s)) return 'service';
  if (/fashion/.test(s)) return 'fashion';
  if (/cosmetic|beauty expert/.test(s)) return 'cosmetics';
  if (/\b[mbh]eat\b/.test(s)) return 'meat';
  if (/general merchandise|gm lead|electronics|seasonal/.test(s)) return /lead/.test(s)?'leadership':'gm';
  if (/grocery/.test(s)) return /manager|departmen/.test(s)?'leadership':'food';
  if (/consumable/.test(s)) return /food lead/.test(s)?'leadership':'consumables';
  if (/food lead|people lead/.test(s)) return 'leadership';
  if (/unload|stock unloader/.test(s)) return 'unloading';
  if (/compliance|accounting|asset.?protect|dsd|direct store|office|people /.test(s)) return 'offices';
  if (/pharma|otc/.test(s)) return 'pharmacy';
  if (/vision|optician/.test(s)) return 'vision';
  if (/claim/.test(s)) return 'claims';
  if (/store standard|maintenance/.test(s)) return 'standards';
  return null;
}
export function toTime(text) {
  const m=text.toLowerCase().replace(/[|\[\]]/g,'').match(/(\d{1,2})\s*[:.]\s*(\d{2})\s*([ap])\s*m/);
  if (!m) return '';
  let h=+m[1],min=+m[2]; if(h<1||h>12||min>59)return '';
  h=h%12+(m[3]==='p'?12:0);return `${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}`;
}
export function shortTime(t) {
  if(!/^\d{2}:\d{2}$/.test(t||''))return '?';
  const [h,m]=t.split(':').map(Number);return `${h%12||12}${m?':'+String(m).padStart(2,'0'):''}${h<12?'AM':'PM'}`;
}
export const shiftText=(r)=>`${shortTime(r.start)}-${shortTime(r.end)}`;
export const isNextDay=r=>Boolean(r.start&&r.end&&r.end<=r.start);
export function issues(r) {
  const p=[];if(!r.name?.trim()||/^check name/i.test(r.name))p.push('Missing name');if(r.group==='other')p.push('Check department');
  if(!r.start)p.push('Missing start');if(!r.end)p.push('Missing finish');
  if([r.start,r.end].some(t=>t&&Number(t.slice(3))%15!==0))p.push('Check minutes');
  if(r.start&&r.end){let n=(+r.end.slice(0,2)*60 + +r.end.slice(3))-(+r.start.slice(0,2)*60 + +r.start.slice(3));if(n<=0)n+=1440;if(n>960)p.push('Check long shift');}
  return p;
}
export function unclearFields(r) {
  const fields=new Set((r.unclearFields||[]).filter(f=>['name','group','start','end'].includes(f)));
  if(!r.name?.trim()||/^check name/i.test(r.name)||r.sourceId&&Number.isFinite(r.confidence)&&r.confidence<80)fields.add('name');
  if(r.group==='other')fields.add('group');
  for(const f of ['start','end'])if(!r[f]||Number(r[f].slice(3))%15!==0||Number.isFinite(r.timeConfidence?.[f])&&r.timeConfidence[f]<75)fields.add(f);
  if(issues(r).includes('Check long shift')){fields.add('start');fields.add('end');}
  return [...fields];
}
export const includedRows=(rows,s)=>rows.filter(r=>r.included!==false&&(!r.carryIn||s.includeCarryIn));
export function columnsFor(rows,settings) {
  const active=includedRows(rows,settings), cols=Array.from({length:6},()=>[]);
  for(const g of settings.groups) {
    const staff=active.filter(r=>r.group===g.id).sort((a,b)=>(a.start||'99').localeCompare(b.start||'99')||a.name.localeCompare(b.name));
    if(!staff.length)continue;
    cols[Math.min(5,Math.max(0,+g.column))].push({type:'header',label:g.label,group:g.id});
    cols[+g.column].push(...staff.map(r=>({type:'person',...r})));
    for(let i=0;i<settings.blankRows;i++)cols[+g.column].push({type:'blank'});
  }
  return cols;
}
export const dateLabel=(date)=>new Date(`${date}T12:00:00`).toLocaleDateString('en-CA',{weekday:'long',month:'long',day:'numeric',year:'numeric'});
export const fileBase=(s)=>`${s.title.replace(/[^a-z0-9]+/gi,'_').replace(/^_|_$/g,'').slice(0,70)||'Shift_Plan'}_${s.date}`;
export const cleanName=s=>s.replace(/[^a-z .'-]/gi,'').trim().toLowerCase().replace(/\b[a-z]/g,c=>c.toUpperCase());

// Tesseract TSV is used instead of reading-order text: shift labels sit above
// and below one another, so they must be associated with the name's row by y.
export function parseTsv(tsv) {
  const out=[];
  for(const line of tsv.split('\n').slice(1)) {
    const p=line.split('\t');if(+p[0]!==5||p.length<12||!p[11]?.trim())continue;
    out.push({text:p.slice(11).join('\t').trim(),x:+p[6],y:+p[7],w:+p[8],h:+p[9],confidence:+p[10]});
  }
  return out;
}
export function lineWords(words,tolerance=9) {
  const lines=[];
  for(const w of [...words].sort((a,b)=>a.y+a.h/2-b.y-b.h/2)) {
    const cy=w.y+w.h/2;let line=lines.find(l=>Math.abs(l.cy-cy)<tolerance);
    if(!line){line={cy,words:[]};lines.push(line);}line.words.push(w);
  }
  return lines.map(l=>({...l,words:l.words.sort((a,b)=>a.x-b.x),text:l.words.sort((a,b)=>a.x-b.x).map(w=>w.text).join(' ')})).sort((a,b)=>a.cy-b.cy);
}
export function extractRows(nameTsv,timeTsv,width,height,sourceId,initialGroup='other') {
  const names=lineWords(parseTsv(nameTsv),10), times=lineWords(parseTsv(timeTsv).filter(w=>w.x>width*.16),9);
  const anchors=[];let group=initialGroup;
  for(const l of names) {
    const t=l.text.replace(/[|_\[\]“”"‘’]/g,' ').replace(/\s+/g,' ').trim();
    const role=roleGroup(t);
    // Report role lists are outside the rectified table; headers have no person ID.
    const match=t.match(/^([a-z][a-z .'-]{1,48}?)\s*([0-9§]{3,4})\b/i);
    if(match && !/associate|depart|demand|scheduled|attendant|manager/i.test(match[1])) {
      let rawName=match[1].trim(),id=match[2].replace(/§/g,'5');
      rawName=rawName.replace(/\s*[. ]+[a-z08]$/i,'').trim();
      const name=cleanName(rawName);
      if(name.length>=2)anchors.push({type:'person',cy:l.cy,name,employeeId:id,group,confidence:l.words.reduce((s,w)=>s+w.confidence,0)/l.words.length});
    } else if(role) {group=role;anchors.push({type:'header',cy:l.cy,group});}
  }
  const result=[];
  for(let i=0;i<anchors.length;i++) {
    const a=anchors[i];if(a.type!=='person')continue;
    const previous=anchors[i-1], next=anchors[i+1];
    const top=a.cy-18,bottom=(next?next.cy-18:height);
    const found=[];
    for(const l of times.filter(l=>l.cy>=top&&l.cy<bottom)) {
      const re=/(\d{1,2}\s*[:.]\s*\d{2}\s*[ap]\s*m)/gi;let match;
      while((match=re.exec(l.text))) {
        const time=toTime(match[1]);if(!time)continue;
        // Find the first word corresponding to this regex for a reliable x.
        let offset=0,word=l.words[0];for(const w of l.words){if(offset+w.text.length>=match.index){word=w;break;}offset+=w.text.length+1;}
        found.push({time,x:word.x,y:l.cy,confidence:word.confidence});
      }
    }
    found.sort((a,b)=>a.x-b.x||a.y-b.y);
    // A given label can be duplicated by OCR, but equal start and end are invalid.
    const unique=found.filter((x,j)=>!found.slice(0,j).some(v=>v.time===x.time&&Math.abs(v.y-x.y)<15&&Math.abs(v.x-x.x)<100));
    let start='',end='';
    if(unique.length>=2){start=unique[0].time;end=unique[unique.length-1].time;}
    else if(unique.length===1){if(unique[0].y>a.cy+(bottom-a.cy)*.4)start=unique[0].time;else end=unique[0].time;}
    result.push({id:uid(),name:a.name,employeeId:a.employeeId,group:a.group,start,end,area:'',included:true,reviewed:false,sourceId,confidence:Math.round(a.confidence),carryIn:!!(start&&end&&start>='21:00'&&end<='09:00'),sourceY:a.cy/height});
  }
  return {rows:result,lastGroup:group};
}

export function mergeRows(existing,incoming) {
  const out=[...existing];let duplicates=0;
  for(const r of incoming) {
    const same=out.find(p=>(r.employeeId&&p.employeeId?p.employeeId===r.employeeId:p.name.toLowerCase()===r.name.toLowerCase())&&p.start===r.start&&p.end===r.end&&p.group===r.group);
    if(same){duplicates++;continue;}out.push(r);
  }
  return {rows:out,duplicates};
}

export function extractBandRows(nameTsv,timeTsv,bands,width,height,sourceId,initialGroup='other') {
  const nameWords=parseTsv(nameTsv),timeWords=parseTsv(timeTsv).filter(w=>w.x>width*.17);
  let group=initialGroup;const rows=[];
  for(let i=0;i<bands.length;i++) {
    const b=bands[i];
    const words=nameWords.filter(w=>w.y+w.h/2>=i*64&&w.y+w.h/2<(i+1)*64).sort((a,b)=>a.x-b.x);
    const raw=words.map(w=>w.text).join(' ').replace(/[|_\[\]“”"‘’]/g,' ').replace(/\s+/g,' ').trim();
    if(b.type==='header'){const role=roleGroup(raw);if(role)group=role;else if(i>2&&/[a-z]{3}/i.test(raw))group='other';continue;}
    if(!raw && b.bottom-b.top<65)continue;
    const match=raw.match(/^(.+?)\s*([0-9§]{3,5})(?:\s|$)/i);
    let rawName=match?match[1]:raw.replace(/\d.*$/,'');
    rawName=rawName.replace(/\s*[. ]+[a-z08]$/i,'').replace(/[. -]+$/,'').trim();
    const name=cleanName(rawName)||'Check name';
    const lines=lineWords(timeWords.filter(w=>w.y+w.h/2>b.top-4&&w.y+w.h/2<b.bottom+3),9);
    const found=[];
    for(const l of lines) {
      const re=/(\d{1,2}\s*[:.]\s*\d{2}\s*[ap]\s*m)/gi;let m;
      while((m=re.exec(l.text))) {
        const time=toTime(m[1]);if(!time)continue;
        let offset=0,word=l.words[0];for(const w of l.words){if(offset+w.text.length>=m.index){word=w;break;}offset+=w.text.length+1;}
        found.push({time,x:word.x,y:l.cy});
      }
    }
    found.sort((a,b)=>a.x-b.x||a.y-b.y);
    const unique=found.filter((x,j)=>!found.slice(0,j).some(v=>v.time===x.time&&Math.abs(v.y-x.y)<15&&Math.abs(v.x-x.x)<100));
    let start='',end='';
    if(unique.length>=2){start=unique[0].time;end=unique[unique.length-1].time;}
    else if(unique.length===1){if(unique[0].y>(b.top+b.bottom)/2)start=unique[0].time;else end=unique[0].time;}
    rows.push({id:uid(),name,employeeId:match?match[2].replace(/§/g,'5'):'',group,start,end,area:'',included:true,reviewed:false,sourceId,
      confidence:words.length?Math.round(words.reduce((s,w)=>s+w.confidence,0)/words.length):0,
      carryIn:!!(start&&end&&start>='21:00'&&end<='09:00'),sourceY:b.top/height});
  }
  return {rows,lastGroup:group};
}
