import {defaultSettings,uid,columnsFor,includedRows,shiftText,dateLabel,fileBase,unclearFields,mergeRows} from './domain.js';
import {download,makePdf,makeXlsx} from './exports.js';
import {createReader,preparePhoto,readPrepared,detectedDate} from './ocr.js';

const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const STORAGE=`shiftsheet.${new URL('./',import.meta.url).pathname}.v1`;let state={rows:[],settings:defaultSettings(),dateUnclear:true},run=null;
function message(text=''){$('errorMessage').textContent=text;$('errorMessage').hidden=!text;}
function save(){try{localStorage.setItem(STORAGE,JSON.stringify(state));}catch{}}
function fitPaper(){requestAnimationFrame(()=>{const stage=$('paperStage'),paper=$('sheetPaper'),wrap=$('paperWrap'),css=getComputedStyle(stage),available=stage.clientWidth-parseFloat(css.paddingLeft)-parseFloat(css.paddingRight)-1,scale=Math.min(1,Math.max(150,available)/1100);paper.style.transform=`scale(${scale})`;wrap.style.width=`${1100*scale}px`;wrap.style.height=`${paper.offsetHeight*scale}px`;});}
function render(){
  const s=state.settings,cols=columnsFor(state.rows,s),count=Math.max(24,...cols.map(c=>c.length));
  const html=cols.map((col,ci)=>{const area=s.showArea&&ci<4;let content='';
    for(let i=0;i<count;i++){
      const item=col[i],header=item?.type==='header',person=item?.type==='person',flags=person?unclearFields(item):[],nameFlag=flags.includes('name')||flags.includes('group'),timeFlag=flags.includes('start')||flags.includes('end');
      const values=header?[item.label,'Sch','Area']:person?[item.name,shiftText(item),item.area]:['','',''];
      content+=`<div class="paper-row ${header?'header':''}"><span class="${nameFlag?'unclear':''}">${esc(values[0])}</span><span class="${timeFlag?'unclear':''}">${esc(values[1])}</span>${area?`<span>${esc(values[2])}</span>`:''}</div>`;
    }return `<div class="paper-column ${area?'':'no-area'}">${content}</div>`;
  }).join('');
  $('sheetPaper').classList.toggle('empty-paper',!state.rows.length);
  $('sheetPaper').innerHTML=`<div class="paper-date ${state.dateUnclear&&state.rows.length?'unclear':''}">${esc(dateLabel(s.date))}</div><div class="paper-title">Walmart <span class="spark">✳</span> ${esc(s.title)}</div><div class="paper-grid">${html}</div><div class="paper-footer">Walmart <span style="color:#e2b12a">✳</span></div>`;
  $('pdfBtn').disabled=$('excelBtn').disabled=!!run||!includedRows(state.rows,s).length;fitPaper();
}
function busy(value){$('uploadBox').classList.toggle('busy',value);$('dropzone').setAttribute('aria-disabled',String(value));$('fileInput').disabled=value;$('progressPanel').hidden=!value;render();}
function progress(text,percent){$('progressLabel').textContent=text;$('progressBar').style.width=`${Math.min(100,Math.max(0,percent))}%`;}
function releasePhotos(){for(const im of $('photoStrip').querySelectorAll('img'))if(im.src.startsWith('blob:'))URL.revokeObjectURL(im.src);$('photoStrip').replaceChildren();$('photoStrip').hidden=true;}
async function upload(files){
  if(run)return;const selected=[...files].sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}));if(!selected.length)return;
  message();if(selected.length>20){message('Choose up to 20 photos.');return;}
  const valid=[];for(const f of selected){if(!/image\/(jpeg|png|webp)/.test(f.type)&&! /\.(jpe?g|png|webp)$/i.test(f.name)){message('Use JPG, PNG or WebP photos.');return;}if(f.size>20*1024*1024){message('Use photos smaller than 20 MB.');return;}valid.push(f);}
  releasePhotos();for(const f of valid){const im=document.createElement('img');im.src=URL.createObjectURL(f);im.alt=f.name;im.title=f.name;$('photoStrip').append(im);}$('photoStrip').hidden=false;
  state={rows:[],settings:defaultSettings(),dateUnclear:true};
  const task={id:uid(),worker:null,cancelled:false,reject:null},stop=new Promise((_,reject)=>task.reject=reject);run=task;
  const active=p=>Promise.race([p,stop]);busy(true);let group='other',date=null,failed=0;
  try{
    progress('Reading photos…',1);
    task.worker=await active(createReader(()=>{}).then(worker=>{if(task.cancelled){worker.terminate();throw new Error('Cancelled');}return worker;}));
    for(let i=0;i<valid.length;i++){
      if(task.cancelled)break;const file=valid[i],sourceId=`${task.id}-${i}`;
      try{
        progress(`Reading ${i+1} of ${valid.length}…`,i/valid.length*100+1);await new Promise(r=>setTimeout(r,15));
        const p=await active(preparePhoto(file));
        await task.worker.setParameters({tessedit_pageseg_mode:'6'});
        const h=document.createElement('canvas'),height=Math.round(p.original.height*.16);h.width=p.original.width*2;h.height=height*2;h.getContext('2d').drawImage(p.original,0,0,p.original.width,height,0,0,h.width,h.height);
        const header=await active(task.worker.recognize(h,{}, {text:true})),found=detectedDate(header.data.text);
        if(found&&date&&found!==date){failed++;message(`One photo is for ${found}. Upload reports for the same day.`);continue;}
        if(found&&!date){date=found;state.settings.date=found;state.dateUnclear=false;}
        const result=await active(readPrepared(task.worker,p,sourceId,group,(_,fraction)=>progress(`Reading ${i+1} of ${valid.length}…`,(i+fraction)/valid.length*100)));
        if(task.cancelled)break;if(!result.rows.length){failed++;continue;}group=result.lastGroup;
        state.rows=mergeRows(state.rows,result.rows.map(r=>({...r,sourceName:file.name}))).rows;save();render();
      }catch(e){if(task.cancelled)break;failed++;console.error('Photo could not be read',e);}
    }
    if(failed&&!$('errorMessage').textContent)message(`${failed} photo${failed===1?'':'s'} could not be read. Upload clearer photos.`);
  }catch(e){if(!task.cancelled){console.error(e);message('Could not read the photos. Please try again.');}}
  finally{try{await task.worker?.terminate();}catch{}if(run===task){run=null;busy(false);save();}$('fileInput').value='';}
}
$('fileInput').onchange=e=>upload(e.target.files);
$('dropzone').onkeydown=e=>{if(['Enter',' '].includes(e.key)&&!run){e.preventDefault();$('fileInput').click();}};
for(const name of ['dragenter','dragover'])$('uploadBox').addEventListener(name,e=>{e.preventDefault();if(!run)$('uploadBox').classList.add('drag-over');});
for(const name of ['dragleave','drop'])$('uploadBox').addEventListener(name,e=>{e.preventDefault();$('uploadBox').classList.remove('drag-over');if(name==='drop')upload(e.dataTransfer.files);});
$('cancelScan').onclick=()=>{if(!run)return;run.cancelled=true;run.reject(new Error('Cancelled'));run.worker?.terminate();};
async function exportFile(type){
  if(run||!state.rows.length)return;message();const b=type==='pdf'?$('pdfBtn'):$('excelBtn'),old=b.innerHTML;b.disabled=true;b.textContent='Preparing…';
  try{const settings={...state.settings,dateUnclear:state.dateUnclear},data=type==='pdf'?await makePdf(state.rows,settings):await makeXlsx(state.rows,settings);download(data,`${fileBase(settings)}.${type==='pdf'?'pdf':'xlsx'}`,type==='pdf'?'application/pdf':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');}
  catch(e){console.error(e);message('Could not create the download. Please try again.');}finally{b.innerHTML=old;render();}
}
$('pdfBtn').onclick=()=>exportFile('pdf');$('excelBtn').onclick=()=>exportFile('xlsx');
new ResizeObserver(fitPaper).observe($('paperStage'));
try{const old=JSON.parse(localStorage.getItem(STORAGE)||'null');if(Array.isArray(old?.rows)&&old.settings){const s=defaultSettings();state={rows:old.rows.slice(0,1000),settings:{...s,title:String(old.settings.title||s.title).slice(0,80),date:/^\d{4}-\d{2}-\d{2}$/.test(old.settings.date)?old.settings.date:s.date},dateUnclear:old.dateUnclear===true};}}catch{}
render();
