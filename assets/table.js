(() => {
const $=id=>document.getElementById(id), search=$("globalSearch");
const DEFAULTS=["assay_name","available_databases","nt_database_date","doi","pcr_primer_forward","pcr_primer_reverse","targetTaxonomicAssay"];
const REQUIRED=["assay_name","doi","nt_database_date","date_released"];
const REPOSITORY_URL="https://github.com/McAllister-NOAA/rCRUX_databases/"; $("repoLink").href=REPOSITORY_URL;
let allRows=[],summaryRows=[],fields=[],selected=[],table=null,mode="summary",assay=null;
const clean=v=>String(v??"").trim(), norm=v=>clean(v).toLocaleLowerCase();
const date=v=>{const n=Date.parse(clean(v));return Number.isNaN(n)?-Infinity:n};
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const doiURL=v=>/^https?:\/\//i.test(clean(v))?clean(v):"https://doi.org/"+clean(v).replace(/^doi:\s*/i,"").replace(/^\/+/,"");
function summarize(rows){
 const groups=new Map(); rows.forEach(r=>{const a=clean(r.assay_name);if(a){if(!groups.has(a))groups.set(a,[]);groups.get(a).push(r)}});
 return Array.from(groups,([assay_name,records])=>{
  const ranked=records.map(record=>({record,release:date(record.date_released),nt:date(record.nt_database_date)})).sort((a,b)=>b.release-a.release||b.nt-a.nt);
  const best=ranked[0], tied=ranked.filter(x=>x.release===best.release&&x.nt===best.nt);
  const chosen=tied[Math.floor(Math.random()*tied.length)].record;
  return {...chosen,assay_name,available_databases:records.length,_records:records};
 }).sort((a,b)=>a.assay_name.localeCompare(b.assay_name,undefined,{numeric:true,sensitivity:"base"}));
}
function title(field){if(field==="available_databases")return "Available databases";if(mode==="summary"&&field==="nt_database_date")return "Most recent database date";if(mode==="summary"&&field==="doi")return "Latest DOI";return field}
function formatter(field,cell){
 if(field==="available_databases"){const r=cell.getRow().getData();return `<button class="count-link" data-assay="${esc(r.assay_name)}" type="button" aria-label="Show ${r.available_databases} databases for ${esc(r.assay_name)}">${r.available_databases} ↗</button>`}
 const v=clean(cell.getValue());if(!v)return "—";
 if(field==="doi"||field==="reference_doi")return `<a class="doi-link" href="${esc(doiURL(v))}" target="_blank" rel="noopener noreferrer">${esc(v.replace(/^https?:\/\/(dx\.)?doi\.org\//i,""))} ↗</a>`;
 if(/url|link/i.test(field)&&/^https?:\/\//i.test(v))return `<a class="doi-link" href="${esc(v)}" target="_blank" rel="noopener noreferrer">${esc(v)} ↗</a>`;
 return esc(v);
}
function column(field,i){
 return {title:title(field),field,frozen:i===0,minWidth:i===0?220:155,width:i===0?260:undefined,
  headerFilter:field==="available_databases"?false:"input",headerFilterPlaceholder:"Filter…",headerFilterFunc:"like",
  headerSort:true,sorter:field==="available_databases"?"number":"string",tooltip:true,formatter:c=>formatter(field,c)};
}
function updateCount(){if(!table)return;const shown=table.getData("active").length,total=mode==="summary"?summaryRows.length:allRows.filter(r=>clean(r.assay_name)===assay).length;$("resultCount").textContent=`${shown} of ${total} ${mode==="summary"?"assays":"database records"}`}
function globalSearch(){if(!table)return;const q=norm(search.value);table.setFilter(row=>{if(!q)return true;const vals=mode==="summary"?selected.map(f=>row[f]):Object.values(row);return vals.some(v=>norm(v).includes(q))});updateCount()}
function options(){
 const wrap=$("columnCheckboxes");wrap.innerHTML="";
 const choices=["assay_name","available_databases",...fields.filter(f=>f!=="assay_name")];
 choices.forEach(f=>{const label=document.createElement("label");label.className="column-option";const input=document.createElement("input");input.type="checkbox";input.value=f;input.checked=selected.includes(f);input.disabled=f==="assay_name";const span=document.createElement("span");span.textContent=title(f);label.append(input,span);wrap.append(label)});
}
function build(which,rows){
 mode=which;if(table){table.destroy();table=null}$("table").innerHTML="";
 const cols=(mode==="summary"?selected:fields).map(column);
 table=new Tabulator("#table",{data:rows,columns:cols,layout:"fitDataStretch",responsiveLayout:false,movableColumns:true,resizableColumnFit:true,height:"min(68vh,760px)",placeholder:"No records match the current filters.",pagination:true,paginationSize:25,paginationSizeSelector:[10,25,50,100],paginationCounter:"rows",columnDefaults:{vertAlign:"middle"},initialSort:[{column:mode==="summary"?"assay_name":"date_released",dir:mode==="summary"?"asc":"desc"}],tableBuilt:()=>{if(search.value)globalSearch();updateCount()},dataFiltered:updateCount});
 $("table").onclick=e=>{const b=e.target.closest("button[data-assay]");if(b)showAssay(b.dataset.assay)};
}
function summary(){assay=null;search.value="";$("backButton").hidden=true;$("columnChooser").hidden=false;$("viewTitle").textContent="Available assays";$("viewDescription").textContent="One row per assay_name. The linked record is chosen by latest date_released, then latest nt_database_date; ties are random."; $("tableTip").textContent="Available databases counts every CSV row for that assay_name. Click the count to view all records.";build("summary",summaryRows)}
function showAssay(a){assay=a;search.value="";$("backButton").hidden=false;$("columnChooser").hidden=true;$("viewTitle").textContent=a;$("viewDescription").textContent="All database records for this assay_name, including records with matching dates.";$("tableTip").textContent="This detail view includes every column from records.csv.";build("detail",allRows.filter(r=>clean(r.assay_name)===a))}
function parseCSV(text){
 // Small CSV parser with quoted-field and escaped-quote support; no parser CDN required.
 const rows=[];let row=[],value="",quoted=false;
 for(let i=0;i<text.length;i++){
  const ch=text[i];
  if(quoted){if(ch==='"'&&text[i+1]==='"'){value+='"';i++}else if(ch==='"'){quoted=false}else value+=ch}
  else if(ch==='"'&&value==="")quoted=true;
  else if(ch===','){row.push(value.trim());value=""}
  else if(ch==='\n'){row.push(value.trim());if(row.some(v=>v!==""))rows.push(row);row=[];value=""}
  else if(ch!=='\r')value+=ch;
 }
 row.push(value.trim());if(row.some(v=>v!==""))rows.push(row);
 if(!rows.length)return {fields:[],data:[]};
 const headers=rows.shift().map(v=>v.trim());
 return {fields:headers,data:rows.map(values=>Object.fromEntries(headers.map((h,i)=>[h,(values[i]??"").trim()] )))};
}
fetch("data/records.csv").then(r=>{if(!r.ok)throw Error("Could not load data/records.csv");return r.text()}).then(text=>{
 const parsed=parseCSV(text);fields=parsed.fields.filter(Boolean);
 const missing=REQUIRED.filter(f=>!fields.includes(f));if(missing.length)throw Error("Missing required CSV columns: "+missing.join(", "));
 allRows=parsed.data.filter(r=>Object.values(r).some(v=>clean(v)));summaryRows=summarize(allRows);
 selected=DEFAULTS.filter(f=>f==="available_databases"||fields.includes(f));options();summary();$("dataStatus").textContent=`${allRows.length} database records loaded`;
 $("doneColumns").onclick=()=>{selected=["assay_name",...Array.from($("columnCheckboxes").querySelectorAll("input:checked")).map(i=>i.value).filter(f=>f!=="assay_name")];if(selected.length===1)selected.push("available_databases");$("columnChooser").open=false;build("summary",summaryRows)};
 $("resetColumns").onclick=()=>{selected=DEFAULTS.filter(f=>f==="available_databases"||fields.includes(f));options()};
 $("backButton").onclick=summary;
 $("clearFilters").onclick=()=>{search.value="";if(table){table.clearFilter(true);table.clearSort();table.setSort([{column:mode==="summary"?"assay_name":"date_released",dir:mode==="summary"?"asc":"desc"}]);updateCount()}};
 $("downloadCsv").onclick=()=>{if(table)table.download("csv",mode==="summary"?"assay-summary.csv":"assay-database-records.csv")};
 search.addEventListener("input",globalSearch);
}).catch(err=>{$("dataStatus").textContent="Could not load data";$("columnCheckboxes").innerHTML=`<p class="column-error">Could not load column names: ${esc(err.message)}</p>`;$("table").innerHTML=`<div style="padding:24px;color:#9b2c2c">${esc(err.message)}</div>`;$("resultCount").textContent="0 records";console.error(err)});
document.addEventListener("keydown",e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==="k"){e.preventDefault();search.focus()}if(e.key==="Escape"&&document.activeElement===search){search.value="";globalSearch()}});
})();
