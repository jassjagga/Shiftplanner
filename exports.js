import {columnsFor,includedRows,groupLabel,shiftText,dateLabel,fileBase,unclearFields} from './domain.js';

export function download(data,name,type='application/octet-stream') {
  const blob=data instanceof Blob?data:new Blob([data],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
const safeText=t=>String(t??'').replace(/[^\x20-\x7E\xA0-\xFF\u2013\u2014\u2018\u2019\u201C\u201D\u2022]/g,'?');
export async function makePdf(rows,settings) {
  if(!globalThis.PDFLib)throw new Error('PDF tools are still loading.');
  const {PDFDocument,StandardFonts,rgb}=globalThis.PDFLib,doc=await PDFDocument.create(),regular=await doc.embedFont(StandardFonts.Helvetica),bold=await doc.embedFont(StandardFonts.HelveticaBold);
  doc.setTitle(`${settings.title} — ${settings.date}`);doc.setCreator('ShiftSheet');
  const [pw,ph]=({letter:[792,612],a4:[841.89,595.28],legal:[1008,612]})[settings.paper]||[792,612];
  const margin=24,tableWidth=pw-2*margin,weights=[1.1,1.1,1.1,1.1,.9,.9],columns=columnsFor(rows,settings),maxRows=38,pages=Math.max(1,Math.ceil(Math.max(...columns.map(c=>c.length),1)/maxRows));
  const blue=rgb(.07,.30,.65),ink=rgb(.12,.20,.31),line=rgb(.49,.55,.63),soft=rgb(.92,.95,.98),yellow=rgb(1,.945,.65);
  const text=(page,value,x,y,w,size=7,font=regular,color=ink)=>{
    let s=safeText(value),actual=size;while(font.widthOfTextAtSize(s,actual)>w-5&&actual>5)actual-=.2;
    while(s&&font.widthOfTextAtSize(s,actual)>w-5)s=s.slice(0,-1);
    page.drawText(s,{x:x+3,y:y+3,size:actual,font,color});
  };
  for(let pi=0;pi<pages;pi++) {
    const page=doc.addPage([pw,ph]),top=ph-margin,date=safeText(dateLabel(settings.date));
    if(settings.dateUnclear)page.drawRectangle({x:margin-2,y:top-10,width:bold.widthOfTextAtSize(date,8)+5,height:13,color:yellow});
    page.drawText(date,{x:margin,y:top-8,size:8,font:bold,color:ink});
    page.drawRectangle({x:margin,y:top-44,width:tableWidth,height:28,color:blue,borderWidth:.7,borderColor:ink});
    const title=safeText(`Walmart  *   ${settings.title}`);let titleSize=17;while(bold.widthOfTextAtSize(title,titleSize)>tableWidth-20&&titleSize>9)titleSize-=.5;
    page.drawText(title,{x:(pw-bold.widthOfTextAtSize(title,titleSize))/2,y:top-35,size:titleSize,font:bold,color:rgb(1,1,1)});
    const count=Math.max(24,Math.min(maxRows,Math.max(...columns.map(c=>Math.max(0,Math.min(maxRows,c.length-pi*maxRows)))))),tableTop=top-60,rowHeight=Math.min(14,(tableTop-65)/count);
    let x=margin;
    for(let ci=0;ci<6;ci++) {
      const width=tableWidth*weights[ci]/6.2,area=settings.showArea&&ci<4,ratios=area?[.39,.46,.15]:[.46,.54],col=columns[ci].slice(pi*maxRows,(pi+1)*maxRows);
      for(let ri=0;ri<count;ri++) {
        const y=tableTop-(ri+1)*rowHeight,item=col[ri],header=item?.type==='header',person=item?.type==='person',flags=person?unclearFields(item):[];
        page.drawRectangle({x,y,width,height:rowHeight,borderColor:line,borderWidth:.45,...(header?{color:soft}:{})});
        let cx=x;
        for(let j=0;j<ratios.length;j++) {
          const cw=width*ratios[j],highlight=person&&(j===0?(flags.includes('name')||flags.includes('group')):j===1&&(flags.includes('start')||flags.includes('end')));
          if(highlight)page.drawRectangle({x:cx+.3,y:y+.3,width:cw-.6,height:rowHeight-.6,color:yellow});
          if(j)page.drawLine({start:{x:cx,y},end:{x:cx,y:y+rowHeight},color:line,thickness:.4});
          const value=header?[item.label,'Sch','Area'][j]:person?[item.name,shiftText(item),item.area][j]:'';
          text(page,value,cx,y,cw,header?7.1:7,header?bold:regular,header?blue:ink);cx+=cw;
        }
      }x+=width;
    }
    page.drawText('Walmart',{x:margin,y:36,size:10,font:bold,color:blue});
    if(pages>1)page.drawText(`${pi+1} / ${pages}`,{x:pw-margin-30,y:36,size:7,font:regular,color:ink});
  }return doc.save();
}

const xml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const colName=n=>{let s='';for(n++;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;};
const cell=(col,row,value,style=0)=>`<c r="${colName(col)}${row}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
const formulaCell=(col,row,formula,value,style=4)=>`<c r="${colName(col)}${row}" s="${style}" t="str"><f>${xml(formula)}</f><v>${xml(value)}</v></c>`;
const timeCell=(col,row,time,highlight)=>{
  if(!time)return cell(col,row,'',highlight?5:4);
  const [h,m]=time.split(':').map(Number),style=(m?7:6)+(highlight?2:0);
  return `<c r="${colName(col)}${row}" s="${style}"><v>${(h*60+m)/1440}</v></c>`;
};
const sheet=(rows,cols,merges=[],paper='letter')=>`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><sheetViews><sheetView workbookViewId="0" showGridLines="0"/></sheetViews><sheetFormatPr defaultRowHeight="18"/><cols>${cols.map((w,i)=>`<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${rows.map((r,i)=>`<row r="${i+1}" ht="${i===1?28:18}" customHeight="1">${r.join('')}</row>`).join('')}</sheetData>${merges.length?`<mergeCells count="${merges.length}">${merges.map(ref=>`<mergeCell ref="${ref}"/>`).join('')}</mergeCells>`:''}<pageMargins left="0.25" right="0.25" top="0.3" bottom="0.3" header="0.1" footer="0.1"/><pageSetup paperSize="${{letter:1,a4:9,legal:5}[paper]||1}" orientation="landscape" fitToWidth="1" fitToHeight="1"/></worksheet>`;

export async function makeXlsx(rows,settings) {
  if(!globalThis.JSZip)throw new Error('Excel tools are still loading.');
  const zip=new globalThis.JSZip(),columns=columnsFor(rows,settings),active=includedRows(rows,settings),positions=new Map(active.map((r,i)=>[r.id,i+2])),widths=[],offsets=[];
  let ncols=0;for(let ci=0;ci<6;ci++){offsets.push(ncols);const area=settings.showArea&&ci<4;widths.push(...(area?[17,21,8]:[18,23]));ncols+=area?3:2;}
  const plan=[[],[],[]];plan[0].push(cell(0,1,dateLabel(settings.date),settings.dateUnclear?5:1));plan[1].push(cell(0,2,`Walmart  •  ${settings.title}`,2));
  const count=Math.max(24,...columns.map(c=>c.length));
  for(let ri=0;ri<count;ri++){
    const row=ri+4,line=[];
    for(let ci=0;ci<6;ci++){
      const item=columns[ci][ri],area=settings.showArea&&ci<4,offset=offsets[ci];
      if(item?.type==='person'){
        const flags=unclearFields(item),source=positions.get(item.id),start=`'Associates'!D${source}`,end=`'Associates'!E${source}`;
        const formatTime=ref=>`IF(${ref}="","?",TEXT(${ref},IF(MINUTE(${ref})=0,"hAM/PM","h:mmAM/PM")))`;
        line.push(formulaCell(offset,row,`IF('Associates'!A${source}="","",'Associates'!A${source})`,item.name,flags.includes('name')||flags.includes('group')?5:4));
        line.push(formulaCell(offset+1,row,`${formatTime(start)}&"-"&${formatTime(end)}`,shiftText(item),flags.includes('start')||flags.includes('end')?5:4));
        if(area)line.push(formulaCell(offset+2,row,`IF('Associates'!F${source}="","",'Associates'!F${source})`,item.area,4));
      }else{
        const values=item?.type==='header'?[item.label,'Sch',...(area?['Area']:[])]:Array(area?3:2).fill('');values.forEach((v,j)=>line.push(cell(offset+j,row,v,item?.type==='header'?3:4)));
      }
    }plan.push(line);
  }
  const list=[['Name','Employee ID','Department','Start','Finish','Area / task','Source'].map((v,j)=>cell(j,1,v,3))];
  active.forEach((r,i)=>{const row=i+2,flags=unclearFields(r);list.push([cell(0,row,r.name,flags.includes('name')?5:4),cell(1,row,r.employeeId,4),cell(2,row,groupLabel(r.group,settings),flags.includes('group')?5:4),timeCell(3,row,r.start,flags.includes('start')),timeCell(4,row,r.end,flags.includes('end')),cell(5,row,r.area,4),cell(6,row,r.sourceName||'',4)]);});
  zip.file('[Content_Types].xml',`<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`);
  zip.file('_rels/.rels',`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  zip.file('xl/workbook.xml',`<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets><sheet name="Shift Plan" sheetId="1" r:id="rId1"/><sheet name="Associates" sheetId="2" r:id="rId2"/></sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`);
  zip.file('xl/_rels/workbook.xml.rels',`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  const xf=(font,fill,border,num=0)=>`<xf numFmtId="${num}" fontId="${font}" fillId="${fill}" borderId="${border}" xfId="0"${num?' applyNumberFormat="1"':''}/>`;
  zip.file('xl/styles.xml',`<?xml version="1.0"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="hAM/PM"/><numFmt numFmtId="165" formatCode="h:mmAM/PM"/></numFmts><fonts count="4"><font><sz val="9"/><name val="Calibri"/><color rgb="FF20334C"/></font><font><b/><sz val="10"/><name val="Calibri"/></font><font><b/><sz val="18"/><name val="Calibri"/><color rgb="FFFFFFFF"/></font><font><b/><sz val="9"/><name val="Calibri"/><color rgb="FF1455AA"/></font></fonts><fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1455AA"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE9F0F8"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF1A6"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border/><border><left style="thin"><color rgb="FF8E9BAE"/></left><right style="thin"><color rgb="FF8E9BAE"/></right><top style="thin"><color rgb="FF8E9BAE"/></top><bottom style="thin"><color rgb="FF8E9BAE"/></bottom></border></borders><cellStyleXfs count="1">${xf(0,0,0)}</cellStyleXfs><cellXfs count="10">${xf(0,0,0)}${xf(1,0,0)}<xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>${xf(3,3,1)}${xf(0,0,1)}${xf(0,4,1)}${xf(0,0,1,164)}${xf(0,0,1,165)}${xf(0,4,1,164)}${xf(0,4,1,165)}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`);
  zip.file('xl/worksheets/sheet1.xml',sheet(plan,widths,[`A1:${colName(ncols-1)}1`,`A2:${colName(ncols-1)}2`],settings.paper));
  zip.file('xl/worksheets/sheet2.xml',sheet(list,[24,14,23,16,16,24,28],[],settings.paper));
  return zip.generateAsync({type:'uint8array',compression:'DEFLATE'});
}
