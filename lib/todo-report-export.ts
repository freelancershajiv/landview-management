import type { ReportFilters, ReportRow } from "@/lib/todo-reporting";

type Summary = { total:number; open:number; inProgress:number; done:number; overdue:number; dueToday:number };
type ReportData = { rows:ReportRow[]; stats:Summary; filters:ReportFilters; generatedAt:string };
const COLUMNS = [
  {name:"To Do Code",key:"code",width:17},
  {name:"Title",key:"title",width:42},
  {name:"Status",key:"status",width:16},
  {name:"Priority",key:"priority",width:13},
  {name:"Assigned Employee",key:"employee",width:31},
  {name:"Reference",key:"reference",width:17},
  {name:"Client",key:"client",width:28},
  {name:"Workflow Service",key:"workflow",width:30},
  {name:"Workflow Status",key:"workflowStatus",width:18},
  {name:"Due Date",key:"dueDate",width:16},
  {name:"Due Time",key:"dueTime",width:13},
  {name:"Created At",key:"createdAt",width:26},
  {name:"Completed At",key:"completedAt",width:26},
  {name:"Overdue Days",key:"overdueDays",width:18},
  {name:"Description",key:"description",width:54},
] as const;
function xml(v:unknown) {
  return String(v??"").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,"")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;").replace(/'/g,"&apos;");
}
function column(i:number) { let name="";while(i>0){i--;name=String.fromCharCode(65+i%26)+name;i=Math.floor(i/26);}return name; }
function inlineCell(address:string,value:unknown,style=0){
  return '<c r="'+address+'" s="'+style+'" t="inlineStr"><is><t xml:space="preserve">'+xml(value)+'</t></is></c>';
}
function numberCell(address:string,value:number,style=0){
  return '<c r="'+address+'" s="'+style+'"><v>'+Number(value||0)+'</v></c>';
}
function sheetXml(data:ReportData) {
  const rows:string[]=[];
  const title=inlineCell("A1","LAND VIEW | ARCHITECTS & ENGINEERS",1);
  rows.push('<row r="1" ht="29" customHeight="1">'+title+'</row>');
  rows.push('<row r="2" ht="23" customHeight="1">'+inlineCell("A2","To Do Management Report",2)+'</row>');
  rows.push('<row r="3">'+inlineCell("A3","Generated: "+data.generatedAt+"  |  Total "+data.stats.total+"  |  Open "+data.stats.open+"  |  Done "+data.stats.done+"  |  Overdue "+data.stats.overdue,3)+'</row>');
  const filterSummary=Object.entries(data.filters).filter(([k,v])=>v!==""&&v!=="All"&&!(k==="sort"&&v==="Due Date")).map(([k,v])=>k+": "+v).join("   ·   ")||"All To Dos";
  rows.push('<row r="4">'+inlineCell("A4","Filters: "+filterSummary,3)+'</row>');
  rows.push('<row r="5" ht="28" customHeight="1">'+COLUMNS.map((c,i)=>inlineCell(column(i+1)+"5",c.name,4)).join("")+'</row>');
  for(let index=0;index<data.rows.length;index++){
    const row=data.rows[index],r=index+6;
    const cells=COLUMNS.map((c,i)=>{
      const value=row[c.key];
      return c.key==="overdueDays"?numberCell(column(i+1)+r,Number(value),Number(value)>0?6:5):inlineCell(column(i+1)+r,value,index%2===0?5:7);
    }).join("");
    rows.push('<row r="'+r+'" ht="21" customHeight="1">'+cells+'</row>');
  }
  const dims=COLUMNS.map((c,i)=>'<col min="'+(i+1)+'" max="'+(i+1)+'" width="'+c.width+'" customWidth="1"/>').join("");
  const last=Math.max(6,data.rows.length+5);
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'+
    '<dimension ref="A1:O'+last+'"/>'+
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="5" topLeftCell="A6" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'+
    '<sheetFormatPr defaultRowHeight="18"/><cols>'+dims+'</cols><sheetData>'+rows.join("")+'</sheetData>'+
    '<mergeCells count="4"><mergeCell ref="A1:O1"/><mergeCell ref="A2:O2"/><mergeCell ref="A3:O3"/><mergeCell ref="A4:O4"/></mergeCells>'+
    '<autoFilter ref="A5:O'+last+'"/>'+
    '<pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>'+
    '</worksheet>';
}
function crc32(buf:Buffer) {
  let crc=-1;
  for(const b of buf){crc^=b;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xEDB88320:0);}
  return (crc^-1)>>>0;
}
function archive(files:Array<[string,string]>) {
  const chunks:Buffer[]=[],central:Buffer[]=[];
  let offset=0;
  for(const [filename,body] of files){
    const name=Buffer.from(filename,"utf8"),content=Buffer.from(body,"utf8"),crc=crc32(content);
    const local=Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50,0);
    local.writeUInt16LE(20,4);local.writeUInt16LE(0,6);local.writeUInt16LE(0,8);
    local.writeUInt32LE(crc,14);local.writeUInt32LE(content.length,18);local.writeUInt32LE(content.length,22);
    local.writeUInt16LE(name.length,26);
    chunks.push(local,name,content);
    const record=Buffer.alloc(46);
    record.writeUInt32LE(0x02014b50,0);record.writeUInt16LE(20,4);record.writeUInt16LE(20,6);
    record.writeUInt32LE(crc,16);record.writeUInt32LE(content.length,20);record.writeUInt32LE(content.length,24);
    record.writeUInt16LE(name.length,28);record.writeUInt32LE(offset,42);
    central.push(record,name);
    offset+=local.length+name.length+content.length;
  }
  const start=offset,centralSize=central.reduce((sum,part)=>sum+part.length,0);
  const end=Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);
  end.writeUInt32LE(centralSize,12);end.writeUInt32LE(start,16);
  return Buffer.concat([...chunks,...central,end]);
}
export function exportTodoXlsx(data:ReportData):Buffer{
  const files:Array<[string,string]> = [
    ["[Content_Types].xml",'<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'],
    ["_rels/.rels",'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ["xl/workbook.xml",'<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="To Do Report" sheetId="1" r:id="rId1"/></sheets></workbook>'],
    ["xl/_rels/workbook.xml.rels",'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
    ["xl/styles.xml",'<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="4"><font><sz val="10"/><name val="Aptos"/></font><font><b/><sz val="16"/><color rgb="FFFFFFFF"/><name val="Aptos Display"/></font><font><b/><sz val="13"/><color rgb="FF92232A"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/></font></fonts><fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFA51D25"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF2F4F6"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF1F1"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="8"><xf fontId="0" fillId="0" borderId="0" xfId="0"/><xf fontId="1" fillId="2" borderId="0" xfId="0"/><xf fontId="2" fillId="0" borderId="0" xfId="0"/><xf fontId="0" fillId="0" borderId="0" xfId="0"/><xf fontId="3" fillId="2" borderId="0" xfId="0"/><xf fontId="0" fillId="0" borderId="0" xfId="0"/><xf fontId="2" fillId="4" borderId="0" xfId="0"/><xf fontId="0" fillId="3" borderId="0" xfId="0"/></cellXfs></styleSheet>'],
    ["xl/worksheets/sheet1.xml",sheetXml(data)],
  ];
  return archive(files);
}
function pdfSafe(v:unknown) {
  return String(v??"").normalize("NFKD").replace(/[^\x20-\x7E]/g,"?").replace(/\\/g,"\\\\").replace(/\(/g,"\\(").replace(/\)/g,"\\)");
}
function pdfTxt(x:number,y:number,value:unknown,size=9,font="F1") {
  return "BT /"+font+" "+size+" Tf "+x.toFixed(1)+" "+y.toFixed(1)+" Td ("+pdfSafe(value)+") Tj ET\n";
}
function shorten(value:unknown,len:number) {
  const v=String(value??"");
  return v.length>len?v.slice(0,Math.max(0,len-2))+"..":v;
}
export function exportTodoPdf(data:ReportData):Buffer {
  const pageWidth=842,pageHeight=595;
  const cols=[
    {label:"CODE",width:82,get:(r:ReportRow)=>r.code,chars:18},
    {label:"TASK",width:182,get:(r:ReportRow)=>r.title,chars:39},
    {label:"STATUS",width:75,get:(r:ReportRow)=>r.status,chars:16},
    {label:"PRIORITY",width:60,get:(r:ReportRow)=>r.priority,chars:12},
    {label:"EMPLOYEE",width:125,get:(r:ReportRow)=>r.employee,chars:26},
    {label:"REFERENCE",width:90,get:(r:ReportRow)=>r.reference,chars:18},
    {label:"DUE",width:106,get:(r:ReportRow)=>r.dueDate+(r.dueTime?" "+r.dueTime.slice(0,5):""),chars:21},
    {label:"LATE",width:40,get:(r:ReportRow)=>r.overdueDays?String(r.overdueDays)+"d":"-",chars:6},
  ];
  const PER_PAGE=22;
  const pages=Math.max(1,Math.ceil(data.rows.length/PER_PAGE));
  const objects:Array<Buffer|string> = ["","", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>","<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>"];
  const kids:string[]=[];
  for(let p=0;p<pages;p++){
    const start=p*PER_PAGE;
    const pageRows=data.rows.slice(start,start+PER_PAGE);
    let stream="q\n";
    stream+="0.645 0.113 0.145 rg 34 537 774 26 re f\n";
    stream+="0.1 0.14 0.19 rg\n";
    stream+=pdfTxt(35,564,"LAND VIEW   |   ARCHITECTS & ENGINEERS",11,"F2");
    stream+=pdfTxt(35,545,"TO DO MANAGEMENT REPORT",13,"F2");
    stream+="1 1 1 rg\n";
    stream+=pdfTxt(42,520,"CODE      TASK                              STATUS       PRIORITY       EMPLOYEE                          REFERENCE          DUE                   LATE",8,"F2");
    stream+="0.14 0.19 0.24 rg\n";
    stream+=pdfTxt(35,499,"Generated: "+data.generatedAt.slice(0,16).replace("T"," ")+" UTC   |   "+data.stats.total+" matching tasks   |   "+data.stats.open+" open   |   "+data.stats.done+" done   |   "+data.stats.overdue+" overdue",8);
    let y=477;
    for(let i=0;i<pageRows.length;i++){
      const row=pageRows[i];
      if(i%2===0)stream+="0.96 0.97 0.98 rg 34 "+(y-6)+" 774 19 re f\n";
      stream+="0.14 0.19 0.24 rg\n";
      let x=39;
      for(const col of cols){
        stream+=pdfTxt(x,y,shorten(col.get(row),col.chars),7.5,col.label==="CODE"?"F2":"F1");
        x+=col.width;
      }
      y-=20;
    }
    if(!pageRows.length)stream+=pdfTxt(38,465,"No tasks match the chosen filters.",11);
    stream+="0.77 0.79 0.82 RG 34 38 m 808 38 l S\n";
    stream+="0.38 0.43 0.47 rg\n";
    stream+=pdfTxt(35,24,"LAND VIEW · Internal Management Report · Asia/Dhaka",8);
    stream+=pdfTxt(720,24,"Page "+(p+1)+" / "+pages,8);
    stream+="Q\n";
    const body=Buffer.from(stream,"latin1");
    const contentId=objects.length+1;
    objects.push(Buffer.concat([Buffer.from("<< /Length "+body.length+" >>\nstream\n","ascii"),body,Buffer.from("endstream","ascii")]));
    const pageId=objects.length+1;
    objects.push("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 "+pageWidth+" "+pageHeight+"] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents "+contentId+" 0 R >>");
    kids.push(pageId+" 0 R");
  }
  objects[0]="<< /Type /Catalog /Pages 2 0 R >>";
  objects[1]="<< /Type /Pages /Kids ["+kids.join(" ")+"] /Count "+pages+" >>";
  const chunks:Buffer[]=[Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n","latin1")];
  const offsets:number[]=[0];
  let offset=chunks[0].length;
  for(let i=0;i<objects.length;i++){
    offsets.push(offset);
    const body=typeof objects[i]==="string"?Buffer.from(objects[i] as string,"latin1"):objects[i] as Buffer;
    const record=Buffer.concat([Buffer.from((i+1)+" 0 obj\n","ascii"),body,Buffer.from("\nendobj\n","ascii")]);
    chunks.push(record);offset+=record.length;
  }
  const xrefStart=offset;
  let xref="xref\n0 "+(objects.length+1)+"\n0000000000 65535 f \n";
  for(let i=1;i<offsets.length;i++)xref+=String(offsets[i]).padStart(10,"0")+" 00000 n \n";
  xref+="trailer\n<< /Size "+(objects.length+1)+" /Root 1 0 R >>\nstartxref\n"+xrefStart+"\n%%EOF\n";
  chunks.push(Buffer.from(xref,"ascii"));
  return Buffer.concat(chunks);
}
