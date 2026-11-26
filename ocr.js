import {extractBandRows,extractRows,parseTsv,lineWords,toTime} from './domain.js';
let cvReady;
export function loadCv() {
  if(!cvReady)cvReady=new Promise((resolve,reject)=>{
    const s=document.createElement('script');s.src=new URL('./vendor/opencv.js',import.meta.url).href;s.onload=async()=>{try{resolve(await globalThis.cv);}catch(e){reject(e);}};s.onerror=()=>{cvReady=null;reject(new Error('Could not load photo tools. Check your connection and retry.'));};document.head.append(s);
  });return cvReady;
}
const canvas=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
export async function imageCanvas(blob,rotation=0) {
  const url=URL.createObjectURL(blob);try{
    const im=new Image();im.src=url;await im.decode();
    const sideways=rotation%180!==0,max=1800,scale=Math.min(1,max/Math.max(im.width,im.height));
    const w=Math.round(im.width*scale),h=Math.round(im.height*scale),c=canvas(sideways?h:w,sideways?w:h),ctx=c.getContext('2d');
    ctx.translate(c.width/2,c.height/2);ctx.rotate(rotation*Math.PI/180);ctx.drawImage(im,-w/2,-h/2,w,h);return c;
  }finally{URL.revokeObjectURL(url);}
}

// Find the report table, rectify its perspective, and remove long grid lines.
// Every detected person band is retained even if its name is unreadable.
export async function preparePhoto(blob,rotation=0) {
  const cv=await loadCv(),original=await imageCanvas(blob,rotation),allocated=[];
  const keep=x=>(allocated.push(x),x);
  try {
    const src=keep(cv.imread(original)),gray=keep(new cv.Mat()),bw=keep(new cv.Mat());
    cv.cvtColor(src,gray,cv.COLOR_RGBA2GRAY);cv.adaptiveThreshold(gray,bw,255,cv.ADAPTIVE_THRESH_GAUSSIAN_C,cv.THRESH_BINARY_INV,35,10);
    const contours=keep(new cv.MatVector()),hierarchy=keep(new cv.Mat());cv.findContours(bw,contours,hierarchy,cv.RETR_EXTERNAL,cv.CHAIN_APPROX_SIMPLE);
    let index=-1,largest=0;
    for(let i=0;i<contours.size();i++){const c=contours.get(i),area=cv.contourArea(c);if(area>largest){largest=area;index=i;}c.delete();}
    let warped=keep(new cv.Mat()),rectified=false;
    if(index>=0&&largest>src.cols*src.rows*.20){
      const c=contours.get(index),hull=keep(new cv.Mat());cv.convexHull(c,hull);c.delete();
      const points=[];for(let i=0;i<hull.data32S.length;i+=2)points.push({x:hull.data32S[i],y:hull.data32S[i+1]});
      const ordered=[points.reduce((a,b)=>a.x+a.y<b.x+b.y?a:b),points.reduce((a,b)=>a.y-a.x<b.y-b.x?a:b),points.reduce((a,b)=>a.x+a.y>b.x+b.y?a:b),points.reduce((a,b)=>a.y-a.x>b.y-b.x?a:b)];
      const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),width=2000;
      const height=Math.round(width*Math.max(dist(ordered[0],ordered[3]),dist(ordered[1],ordered[2]))/Math.max(dist(ordered[0],ordered[1]),dist(ordered[3],ordered[2])));
      if(height>500&&height<4200){
        const from=keep(cv.matFromArray(4,1,cv.CV_32FC2,ordered.flatMap(p=>[p.x,p.y]))),to=keep(cv.matFromArray(4,1,cv.CV_32FC2,[20,20,2020,20,2020,height+20,20,height+20])),matrix=keep(cv.getPerspectiveTransform(from,to));
        cv.warpPerspective(src,warped,matrix,new cv.Size(2120,height+40),cv.INTER_LINEAR,cv.BORDER_CONSTANT,new cv.Scalar(255,255,255,255));rectified=true;
      }
    }
    if(!rectified){const ratio=2000/src.cols;cv.resize(src,warped,new cv.Size(2000,Math.round(src.rows*ratio)));}
    const g=keep(new cv.Mat()),binary=keep(new cv.Mat());cv.cvtColor(warped,g,cv.COLOR_RGBA2GRAY);cv.adaptiveThreshold(g,binary,255,cv.ADAPTIVE_THRESH_GAUSSIAN_C,cv.THRESH_BINARY_INV,35,10);
    const hl=keep(new cv.Mat()),vl=keep(new cv.Mat()),hk=keep(cv.getStructuringElement(cv.MORPH_RECT,new cv.Size(60,1))),vk=keep(cv.getStructuringElement(cv.MORPH_RECT,new cv.Size(1,27)));
    cv.morphologyEx(binary,hl,cv.MORPH_OPEN,hk);cv.morphologyEx(binary,vl,cv.MORPH_OPEN,vk);
    const mask=keep(new cv.Mat()),dilated=keep(new cv.Mat()),dk=keep(cv.Mat.ones(2,2,cv.CV_8U)),clean=keep(new cv.Mat()),inv=keep(new cv.Mat());
    cv.bitwise_or(hl,vl,mask);cv.dilate(mask,dilated,dk);cv.bitwise_not(dilated,inv);cv.bitwise_and(binary,inv,clean);cv.bitwise_not(clean,clean);
    const full=canvas(clean.cols,clean.rows);cv.imshow(full,clean);
    const edges=[];
    for(let y=0;y<hl.rows;y++){
      let count=0;for(let x=40;x<Math.min(370,hl.cols);x++)if(hl.data[y*hl.cols+x])count++;
      if(count>180){const last=edges[edges.length-1];if(!last||y-last[last.length-1]>8)edges.push([y]);else last.push(y);}
    }
    const lines=edges.map(a=>a.reduce((s,v)=>s+v,0)/a.length),bands=[];
    for(let i=1;i<lines.length;i++){const a=lines[i-1],b=lines[i];if(b-a>25)bands.push({top:Math.floor(a+3),bottom:Math.floor(b-2),type:b-a>65?'person':'header'});}
    if(bands.filter(b=>b.type==='person').length<2){
      const names=canvas(Math.round(full.width*.205),full.height);names.getContext('2d').drawImage(full,0,0,names.width,full.height,0,0,names.width,full.height);
      return {full,names,bands:[],width:full.width,height:full.height,original,rectified};
    }
    const names=canvas(440,bands.length*64),nc=names.getContext('2d');nc.fillStyle='white';nc.fillRect(0,0,names.width,names.height);
    bands.forEach((b,i)=>{const h=Math.min(38,b.bottom-b.top);nc.drawImage(full,22,b.top,398,h,12,i*64+10,398,h);});
    const labels=[];
    for(let i=0;i<bands.length;i++){
      const b=bands[i];if(b.type!=='person')continue;
      for(const [top,bottom] of [[b.top,Math.min(b.bottom,b.top+43)],[Math.max(b.top,b.bottom-43),b.bottom]]){
        const roi=clean.roi(new cv.Rect(420,top,clean.cols-420,bottom-top)),rb=new cv.Mat(),closed=new cv.Mat(),kernel=cv.Mat.ones(1,18,cv.CV_8U),cs=new cv.MatVector(),hi=new cv.Mat();
        try{
          cv.bitwise_not(roi,rb);cv.morphologyEx(rb,closed,cv.MORPH_CLOSE,kernel);cv.findContours(closed,cs,hi,cv.RETR_EXTERNAL,cv.CHAIN_APPROX_SIMPLE);
          for(let j=0;j<cs.size();j++){const c=cs.get(j),r=cv.boundingRect(c),area=cv.contourArea(c);c.delete();if(r.width>=55&&r.width<=430&&r.height>=10&&area>90)labels.push({row:i,x:r.x+420,y:r.y+top,w:r.width,h:r.height});}
        }finally{roi.delete();rb.delete();closed.delete();kernel.delete();cs.delete();hi.delete();}
      }
    }
    labels.sort((a,b)=>a.row-b.row||a.x-b.x);
    const labelSheet=canvas(460,Math.max(1,labels.length)*64),lc=labelSheet.getContext('2d');lc.fillStyle='white';lc.fillRect(0,0,labelSheet.width,labelSheet.height);
    labels.forEach((l,i)=>{const x=Math.max(0,l.x-4),y=Math.max(0,l.y-4),w=Math.min(444,l.w+8,full.width-x),h=Math.min(54,l.h+8,full.height-y);lc.drawImage(full,x,y,w,h,8,i*64+5,w,h);});
    return {full,names,bands,labels,labelSheet,width:full.width,height:full.height,original,rectified};
  }finally{for(const mat of allocated.reverse())mat.delete();}
}

function labelValues(tsv,labels) {
  const words=parseTsv(tsv),out=[];
  for(let i=0;i<labels.length;i++) {
    const selected=words.filter(w=>w.y+w.h/2>=i*64&&w.y+w.h/2<(i+1)*64).sort((a,b)=>a.x-b.x);
    const raw=selected.map(w=>w.text).join(' ').replace(/§/g,'5').replace(/prn/gi,'pm');
    const relevant=selected.filter(w=>/[0-9apm]/i.test(w.text)),confidence=relevant.length?Math.round(relevant.reduce((s,w)=>s+w.confidence,0)/relevant.length):0;
    const found=[...raw.matchAll(/\d{1,2}\s*[:.]\s*\d{2}\s*[ap]\s*m/gi)].map(m=>toTime(m[0])).filter(Boolean);
    out.push({...labels[i],values:found,raw,confidence,range:/[-–]/.test(raw)&&/\d\s*[:.]\s*\d/.test(raw)});
  }return out;
}
export function combineLabelReadings(result,labelTsv,prepared) {
  const labels=labelValues(labelTsv,prepared.labels);let person=0;
  for(let i=0;i<prepared.bands.length;i++){
    const b=prepared.bands[i];if(b.type!=='person')continue;
    const r=result.rows[person++];if(!r)continue;
    const parts=labels.filter(l=>l.row===i).sort((a,b)=>a.x-b.x);
    const values=parts.flatMap(p=>p.values.map((time,j)=>({time,x:p.x+j*120,y:p.y+p.h/2,confidence:p.confidence})));
    r.timeConfidence={};
    if(values.length>=2){r.start=values[0].time;r.end=values[values.length-1].time;r.timeConfidence.start=values[0].confidence;r.timeConfidence.end=values[values.length-1].confidence;}
    else if(values.length===1){
      const range=parts.find(p=>p.range&&p.values.length===1);
      if(range){const split=range.raw.search(/[-–]/),match=range.raw.match(/\d{1,2}\s*[:.]\s*\d{2}\s*[ap]\s*m/i);if(match&&match.index>split)r.end=values[0].time;else r.start=values[0].time;}
      else if(values[0].y>(b.top+b.bottom)/2)r.start=values[0].time;else r.end=values[0].time;
    }
    if(values.length===1){if(r.start===values[0].time)r.timeConfidence.start=values[0].confidence;if(r.end===values[0].time)r.timeConfidence.end=values[0].confidence;}
    r.carryIn=!!(r.start&&r.end&&r.start>='21:00'&&r.end<='09:00')||parts.some(p=>p.range&&p.raw.includes('<')&&/am/i.test(p.raw)&&(/pm.*[-–]/i.test(p.raw)||/\b(?:10|11|12)\s*[:.]/.test(p.raw)));
  }return result;
}

export function detectedDate(text) {
  const m=text.replace(/\s+/g,' ').match(/(\d{1,2})\s*(January|February|March|April|May|June|July|August|September|October|November|December)\s*[,.-]?\s*(20\d{2})/i);
  if(!m)return null;const month=['january','february','march','april','may','june','july','august','september','october','november','december'].indexOf(m[2].toLowerCase())+1;
  return `${m[3]}-${String(month).padStart(2,'0')}-${String(+m[1]).padStart(2,'0')}`;
}
export async function createReader(logger) {
  if(!globalThis.Tesseract)throw new Error('Photo reading tools are still loading. Please retry.');
  const vendor=new URL('./vendor/',import.meta.url).href.replace(/\/$/,'');
  return globalThis.Tesseract.createWorker('eng',1,{workerPath:`${vendor}/worker.min.js`,corePath:`${vendor}`,langPath:`${vendor}`,gzip:false,workerBlobURL:false,logger,errorHandler:e=>console.error('Photo reader:',e)});
}
export async function readPrepared(worker,p,sourceId,initialGroup,onStage=()=>{}) {
  onStage('Reading names',.18);await worker.setParameters({tessedit_pageseg_mode:'6',preserve_interword_spaces:'1'});
  const names=await worker.recognize(p.names,{}, {tsv:true,text:true});
  onStage('Reading shift times',.45);
  if(p.bands.length){
    const labels=await worker.recognize(p.labelSheet,{}, {tsv:true,text:true});
    let result=extractBandRows(names.data.tsv,'',p.bands,p.width,p.height,sourceId,initialGroup);
    combineLabelReadings(result,labels.data.tsv,p);
    if(result.rows.some(r=>!r.start||!r.end)){
      onStage('Checking unclear times',.72);await worker.setParameters({tessedit_pageseg_mode:'11'});
      const fallback=await worker.recognize(p.full,{}, {tsv:true,text:true});
      const again=extractBandRows(names.data.tsv,fallback.data.tsv,p.bands,p.width,p.height,sourceId,initialGroup);
      result.rows.forEach((r,i)=>{const a=again.rows[i];r.unclearFields=[];if(!r.start&&!(r.carryIn&&a?.start<'21:00')){r.start=a?.start||'';if(r.start)r.unclearFields.push('start');}if(!r.end){r.end=a?.end||'';if(r.end)r.unclearFields.push('end');}r.carryIn=r.carryIn||!!(r.start&&r.end&&r.start>='21:00'&&r.end<='09:00');});
    }
    return result;
  }
  await worker.setParameters({tessedit_pageseg_mode:'11'});const full=await worker.recognize(p.full,{}, {tsv:true,text:true});
  return extractRows(names.data.tsv,full.data.tsv,p.width,p.height,sourceId,initialGroup);
}
