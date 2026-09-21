"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import "./registers.css";

type Project={id:string;project_code:string;project_name:string;client_name:string;phone_number:string;location:string;status:string};
type DocRow={id:string;register_code:string;project_code:string;project_name:string;client_name:string;phone_number:string;document_name:string;document_type:string;collection_status:string;document_form:string;quantity:number;received_date:string|null;received_by:string|null;return_status:string;returned_date:string|null;returned_to:string|null;remarks:string|null;updated_at:string};
type BookRow={id:string;book_code:string;project_code:string;project_name:string;client_name:string;phone_number:string;book_type:string;revision:string|null;copies:number;preparation_status:string;ready_date:string|null;printer_name:string|null;sent_to_print_date:string|null;printing_status:string;printed_date:string|null;collected_from_printer_date:string|null;delivery_status:string;delivered_date:string|null;delivered_to:string|null;delivered_by:string|null;remarks:string|null;updated_at:string};
type DocForm={project_code:string;document_name:string;document_type:string;collection_status:string;document_form:string;quantity:string;received_date:string;received_by:string;return_status:string;returned_date:string;returned_to:string;remarks:string};
type BookForm={project_code:string;book_type:string;revision:string;copies:string;preparation_status:string;ready_date:string;printer_name:string;sent_to_print_date:string;printing_status:string;printed_date:string;collected_from_printer_date:string;delivery_status:string;delivered_date:string;delivered_to:string;delivered_by:string;remarks:string};

const DOC_NAMES=["Client NID","Land Deed","Khatian / Porcha","Mutation / Namjari","Land Tax Receipt","Mouza Map","Digital Survey / Measurement","Previous Approved Plan","Previous Drawing","Power of Attorney","Authority / NOC Papers","Other"];
const BOOK_TYPES=["Architectural & Structural Design Book","Architectural Design Book","Structural Design Book","Electrical & Plumbing Design Book","Municipality Submission Book","Estimate & Costing Book","Other Design Book"];
function dhakaToday(){return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Dhaka",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());}
function emptyDoc():DocForm{return{project_code:"",document_name:"",document_type:"Land / Client Paper",collection_status:"Pending",document_form:"Copy",quantity:"1",received_date:"",received_by:"",return_status:"Not Applicable",returned_date:"",returned_to:"",remarks:""};}
function emptyBook():BookForm{return{project_code:"",book_type:"Architectural & Structural Design Book",revision:"R0",copies:"1",preparation_status:"Prepared",ready_date:dhakaToday(),printer_name:"",sent_to_print_date:"",printing_status:"Pending",printed_date:"",collected_from_printer_date:"",delivery_status:"Pending",delivered_date:"",delivered_to:"",delivered_by:"",remarks:""};}
function fmtDate(value?:string|null){if(!value)return"—";const p=value.slice(0,10).split("-").map(Number);if(p.length!==3||!p[0])return value;return new Date(p[0],p[1]-1,p[2]).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"});}
function searchText(values:unknown[]){return values.map(function(v){return String(v??"").toLowerCase();}).join(" ");}

export default function RegistersPage(){
  const[tab,setTab]=useState<"documents"|"books">("documents");
  const[projects,setProjects]=useState<Project[]>([]);
  const[documents,setDocuments]=useState<DocRow[]>([]);
  const[books,setBooks]=useState<BookRow[]>([]);
  const[loading,setLoading]=useState(true);
  const[saving,setSaving]=useState(false);
  const[error,setError]=useState("");
  const[message,setMessage]=useState("");
  const[query,setQuery]=useState("");
  const[filter,setFilter]=useState("all");
  const[modal,setModal]=useState(false);
  const[editId,setEditId]=useState("");
  const[docForm,setDocForm]=useState<DocForm>(emptyDoc());
  const[bookForm,setBookForm]=useState<BookForm>(emptyBook());

  async function load(){
    setLoading(true);setError("");
    try{
      const response=await fetch("/api/registers",{credentials:"same-origin",cache:"no-store"});
      const json=await response.json();
      if(!response.ok||!json?.success)throw new Error(json?.error||"Could not load registers.");
      setProjects(json.data.projects||[]);setDocuments(json.data.documents||[]);setBooks(json.data.books||[]);
    }catch(err){setError(err instanceof Error?err.message:"Could not load registers.");}
    finally{setLoading(false);}
  }
  useEffect(function(){void load();},[]);

  const docRows=useMemo(function(){
    const term=query.trim().toLowerCase();
    return documents.filter(function(row){
      if(term&&!searchText([row.register_code,row.project_code,row.client_name,row.phone_number,row.document_name,row.document_type,row.collection_status,row.return_status]).includes(term))return false;
      if(filter==="pending")return row.collection_status==="Pending"||row.collection_status==="Partial";
      if(filter==="received")return row.collection_status==="Received";
      if(filter==="held")return row.return_status==="Held by LAND VIEW";
      if(filter==="returned")return row.collection_status==="Returned"||row.return_status==="Returned";
      return true;
    });
  },[documents,query,filter]);

  const bookRows=useMemo(function(){
    const term=query.trim().toLowerCase();
    return books.filter(function(row){
      if(term&&!searchText([row.book_code,row.project_code,row.client_name,row.phone_number,row.book_type,row.printer_name,row.printing_status,row.delivery_status]).includes(term))return false;
      if(filter==="await-print")return row.printing_status==="Pending"&&row.preparation_status!=="Preparing";
      if(filter==="printer")return["Sent to Printer","Printing"].includes(row.printing_status);
      if(filter==="await-delivery")return["Printed","Collected from Printer"].includes(row.printing_status)&&row.delivery_status!=="Delivered";
      if(filter==="delivered")return row.delivery_status==="Delivered";
      return true;
    });
  },[books,query,filter]);

  const docMetrics=useMemo(function(){return{
    total:documents.length,
    pending:documents.filter(function(r){return r.collection_status==="Pending"||r.collection_status==="Partial";}).length,
    held:documents.filter(function(r){return r.return_status==="Held by LAND VIEW";}).length,
    returned:documents.filter(function(r){return r.return_status==="Returned"||r.collection_status==="Returned";}).length
  };},[documents]);

  const month=dhakaToday().slice(0,7);
  const bookMetrics=useMemo(function(){return{
    total:books.length,
    printer:books.filter(function(r){return["Sent to Printer","Printing"].includes(r.printing_status);}).length,
    awaiting:books.filter(function(r){return["Printed","Collected from Printer"].includes(r.printing_status)&&r.delivery_status!=="Delivered";}).length,
    delivered:books.filter(function(r){return r.delivery_status==="Delivered"&&String(r.delivered_date||"").startsWith(month);}).length
  };},[books,month]);

  function projectLabel(p:Project){return[p.project_code,p.client_name||p.project_name,p.phone_number].filter(Boolean).join(" · ");}
  function openNew(){setEditId("");setError("");setMessage("");if(tab==="documents")setDocForm(emptyDoc());else setBookForm(emptyBook());setModal(true);}
  function editDocument(row:DocRow){
    setTab("documents");setEditId(row.id);setDocForm({project_code:row.project_code,document_name:row.document_name,document_type:row.document_type||"Land / Client Paper",collection_status:row.collection_status,document_form:row.document_form,quantity:String(row.quantity||1),received_date:String(row.received_date||"").slice(0,10),received_by:row.received_by||"",return_status:row.return_status,returned_date:String(row.returned_date||"").slice(0,10),returned_to:row.returned_to||"",remarks:row.remarks||""});setModal(true);
  }
  function editBook(row:BookRow){
    setTab("books");setEditId(row.id);setBookForm({project_code:row.project_code,book_type:row.book_type,revision:row.revision||"",copies:String(row.copies||1),preparation_status:row.preparation_status,ready_date:String(row.ready_date||"").slice(0,10),printer_name:row.printer_name||"",sent_to_print_date:String(row.sent_to_print_date||"").slice(0,10),printing_status:row.printing_status,printed_date:String(row.printed_date||"").slice(0,10),collected_from_printer_date:String(row.collected_from_printer_date||"").slice(0,10),delivery_status:row.delivery_status,delivered_date:String(row.delivered_date||"").slice(0,10),delivered_to:row.delivered_to||"",delivered_by:row.delivered_by||"",remarks:row.remarks||""});setModal(true);
  }

  async function save(event:FormEvent){
    event.preventDefault();setSaving(true);setError("");setMessage("");
    try{
      const payload=tab==="documents"?docForm:bookForm;
      const response=await fetch("/api/registers",{method:editId?"PATCH":"POST",credentials:"same-origin",cache:"no-store",headers:{"Content-Type":"application/json"},body:JSON.stringify(Object.assign({kind:tab,id:editId||undefined},payload))});
      const json=await response.json();
      if(!response.ok||!json?.success)throw new Error(json?.error||"Could not save register entry.");
      setModal(false);setMessage(editId?"Register entry updated.":"Register entry added.");await load();
    }catch(err){setError(err instanceof Error?err.message:"Could not save register entry.");}
    finally{setSaving(false);}
  }

  const metrics=tab==="documents"
    ?[["Registered Items",docMetrics.total,"All client papers tracked"],["Pending / Partial",docMetrics.pending,"Still required from client"],["Originals Held",docMetrics.held,"Currently held by LAND VIEW"],["Returned",docMetrics.returned,"Returned to client"]]
    :[["Design Books",bookMetrics.total,"All registered books"],["At Printer",bookMetrics.printer,"Sent or currently printing"],["Awaiting Delivery",bookMetrics.awaiting,"Printed but not delivered"],["Delivered This Month",bookMetrics.delivered,"Completed handovers"]];

  const filters=tab==="documents"
    ?[["all","All"],["pending","Pending"],["received","Received"],["held","Originals Held"],["returned","Returned"]]
    :[["all","All"],["await-print","Awaiting Print"],["printer","At Printer"],["await-delivery","Awaiting Delivery"],["delivered","Delivered"]];

  return <div className="register-page">
    <header className="register-head"><div><small>LAND VIEW / OPERATIONS REGISTER</small><h1>Documents &amp; Design Books</h1><p>Physical client-document custody and design-book printing/delivery tracking.</p></div><button className="register-btn primary" onClick={openNew}>＋ {tab==="documents"?"Add Document":"Add Design Book"}</button></header>
    {error&&<div className="register-alert">{error}</div>}{message&&<div className="register-alert success">{message}</div>}
    <div className="register-tabs"><button className={tab==="documents"?"active":""} onClick={function(){setTab("documents");setFilter("all");setQuery("");}}>Client Documents</button><button className={tab==="books"?"active":""} onClick={function(){setTab("books");setFilter("all");setQuery("");}}>Design Books Register</button></div>
    <section className="register-metrics">{metrics.map(function(item){return <article className="register-metric" key={String(item[0])}><span>{item[0]}</span><strong>{item[1]}</strong><p>{item[2]}</p></article>;})}</section>
    <section className="register-panel">
      <div className="register-toolbar"><input className="register-search" value={query} onChange={function(e){setQuery(e.target.value);}} placeholder="Search File ID, owner, phone, document or book…" /><div className="register-filters">{filters.map(function(item){return <button key={item[0]} className={"register-filter "+(filter===item[0]?"active":"")} onClick={function(){setFilter(item[0]);}}>{item[1]}</button>;})}</div></div>
      {loading?<div className="register-empty">Loading registers…</div>:tab==="documents"?<div className="register-table-wrap"><table className="register-table"><thead><tr><th>Reg.</th><th>File / Client</th><th>Document</th><th>Status</th><th>Form</th><th>Received</th><th>Return</th><th>Remarks</th><th>Action</th></tr></thead><tbody>
        {docRows.length===0?<tr><td colSpan={9} className="register-empty">No client-document entries found.</td></tr>:docRows.map(function(row){return <tr key={row.id}><td><strong>{row.register_code}</strong></td><td><span className="project-main">{row.project_code} · {row.client_name||row.project_name||"Client"}</span><span className="sub">{row.phone_number||"No contact"}</span></td><td><span className="project-main">{row.document_name}</span><span className="sub">{row.document_type||"—"} · Qty {row.quantity}</span></td><td><span className={"status "+(row.collection_status==="Received"?"good":row.collection_status==="Pending"||row.collection_status==="Partial"?"warn":"")}>{row.collection_status}</span></td><td>{row.document_form}</td><td>{fmtDate(row.received_date)}<span className="sub">{row.received_by||"—"}</span></td><td><span className={"status "+(row.return_status==="Returned"?"good":row.return_status==="Held by LAND VIEW"?"bad":"")}>{row.return_status}</span><span className="sub">{fmtDate(row.returned_date)}</span></td><td>{row.remarks||"—"}</td><td><button className="register-edit" onClick={function(){editDocument(row);}}>Edit</button></td></tr>;})}
      </tbody></table></div>:<div className="register-table-wrap"><table className="register-table"><thead><tr><th>Book</th><th>File / Client</th><th>Book Type</th><th>Preparation</th><th>Printing</th><th>Printer / Dates</th><th>Delivery</th><th>Delivered To</th><th>Action</th></tr></thead><tbody>
        {bookRows.length===0?<tr><td colSpan={9} className="register-empty">No design-book entries found.</td></tr>:bookRows.map(function(row){return <tr key={row.id}><td><strong>{row.book_code}</strong><span className="sub">{row.revision||"No rev."} · {row.copies} {row.copies===1?"copy":"copies"}</span></td><td><span className="project-main">{row.project_code} · {row.client_name||row.project_name||"Client"}</span><span className="sub">{row.phone_number||"No contact"}</span></td><td>{row.book_type}</td><td><span className="status">{row.preparation_status}</span><span className="sub">Ready {fmtDate(row.ready_date)}</span></td><td><span className={"status "+(row.printing_status==="Collected from Printer"||row.printing_status==="Printed"?"good":row.printing_status==="Printing"||row.printing_status==="Sent to Printer"?"warn":"")}>{row.printing_status}</span></td><td>{row.printer_name||"—"}<span className="sub">Sent {fmtDate(row.sent_to_print_date)} · Printed {fmtDate(row.printed_date)}</span></td><td><span className={"status "+(row.delivery_status==="Delivered"?"good":row.delivery_status==="Ready for Delivery"?"warn":"bad")}>{row.delivery_status}</span><span className="sub">{fmtDate(row.delivered_date)}</span></td><td>{row.delivered_to||"—"}<span className="sub">{row.delivered_by?"By "+row.delivered_by:""}</span></td><td><button className="register-edit" onClick={function(){editBook(row);}}>Edit</button></td></tr>;})}
      </tbody></table></div>}
    </section>

    {modal&&<div className="register-modal-bg" onMouseDown={function(e){if(e.target===e.currentTarget&&!saving)setModal(false);}}><form className="register-modal" onSubmit={save}>
      <h2>{editId?"Edit":"Add"} {tab==="documents"?"Client Document":"Design Book"}</h2><p>{tab==="documents"?"Record physical papers received from or returned to the client.":"Track preparation, printing and final client delivery separately."}</p>
      {tab==="documents"?<div className="form-grid">
        <div className="form-field span2"><label>Project / Client</label><select required value={docForm.project_code} onChange={function(e){setDocForm(Object.assign({},docForm,{project_code:e.target.value}));}}><option value="">Choose File ID</option>{projects.map(function(p){return <option key={p.id} value={p.project_code}>{projectLabel(p)}</option>;})}</select></div>
        <div className="form-field"><label>Quantity / Pages</label><input type="number" min="0" value={docForm.quantity} onChange={function(e){setDocForm(Object.assign({},docForm,{quantity:e.target.value}));}}/></div>
        <div className="form-field"><label>Document Name</label><input required list="document-names" value={docForm.document_name} onChange={function(e){setDocForm(Object.assign({},docForm,{document_name:e.target.value}));}}/><datalist id="document-names">{DOC_NAMES.map(function(x){return <option key={x} value={x}/>;})}</datalist></div>
        <div className="form-field"><label>Document Type</label><select value={docForm.document_type} onChange={function(e){setDocForm(Object.assign({},docForm,{document_type:e.target.value}));}}><option>Land / Client Paper</option><option>Identity</option><option>Survey / Map</option><option>Authority / Approval</option><option>Previous Drawing</option><option>Other</option></select></div>
        <div className="form-field"><label>Collection Status</label><select value={docForm.collection_status} onChange={function(e){setDocForm(Object.assign({},docForm,{collection_status:e.target.value}));}}><option>Pending</option><option>Received</option><option>Partial</option><option>Not Required</option><option>Returned</option></select></div>
        <div className="form-field"><label>Original / Copy</label><select value={docForm.document_form} onChange={function(e){setDocForm(Object.assign({},docForm,{document_form:e.target.value}));}}><option>Original</option><option>Copy</option><option>Digital</option><option>Not Applicable</option></select></div>
        <div className="form-field"><label>Received Date</label><input type="date" value={docForm.received_date} onChange={function(e){setDocForm(Object.assign({},docForm,{received_date:e.target.value}));}}/></div>
        <div className="form-field"><label>Received By</label><input value={docForm.received_by} onChange={function(e){setDocForm(Object.assign({},docForm,{received_by:e.target.value}));}}/></div>
        <div className="form-field"><label>Return Status</label><select value={docForm.return_status} onChange={function(e){setDocForm(Object.assign({},docForm,{return_status:e.target.value}));}}><option>Not Applicable</option><option>Held by LAND VIEW</option><option>Returned</option></select></div>
        <div className="form-field"><label>Returned Date</label><input type="date" value={docForm.returned_date} onChange={function(e){setDocForm(Object.assign({},docForm,{returned_date:e.target.value}));}}/></div>
        <div className="form-field"><label>Returned To</label><input value={docForm.returned_to} onChange={function(e){setDocForm(Object.assign({},docForm,{returned_to:e.target.value}));}}/></div>
        <div className="form-field wide"><label>Remarks</label><textarea value={docForm.remarks} onChange={function(e){setDocForm(Object.assign({},docForm,{remarks:e.target.value}));}}/></div>
      </div>:<div className="form-grid">
        <div className="form-field span2"><label>Project / Client</label><select required value={bookForm.project_code} onChange={function(e){setBookForm(Object.assign({},bookForm,{project_code:e.target.value}));}}><option value="">Choose File ID</option>{projects.map(function(p){return <option key={p.id} value={p.project_code}>{projectLabel(p)}</option>;})}</select></div>
        <div className="form-field"><label>Copies</label><input type="number" min="1" value={bookForm.copies} onChange={function(e){setBookForm(Object.assign({},bookForm,{copies:e.target.value}));}}/></div>
        <div className="form-field span2"><label>Book Type</label><input required list="book-types" value={bookForm.book_type} onChange={function(e){setBookForm(Object.assign({},bookForm,{book_type:e.target.value}));}}/><datalist id="book-types">{BOOK_TYPES.map(function(x){return <option key={x} value={x}/>;})}</datalist></div>
        <div className="form-field"><label>Revision</label><input value={bookForm.revision} onChange={function(e){setBookForm(Object.assign({},bookForm,{revision:e.target.value}));}}/></div>
        <div className="form-field"><label>Preparation Status</label><select value={bookForm.preparation_status} onChange={function(e){setBookForm(Object.assign({},bookForm,{preparation_status:e.target.value}));}}><option>Preparing</option><option>Prepared</option><option>Ready for Print</option></select></div>
        <div className="form-field"><label>Ready Date</label><input type="date" value={bookForm.ready_date} onChange={function(e){setBookForm(Object.assign({},bookForm,{ready_date:e.target.value}));}}/></div>
        <div className="form-field"><label>Printer</label><input value={bookForm.printer_name} onChange={function(e){setBookForm(Object.assign({},bookForm,{printer_name:e.target.value}));}}/></div>
        <div className="form-field"><label>Sent to Print Date</label><input type="date" value={bookForm.sent_to_print_date} onChange={function(e){setBookForm(Object.assign({},bookForm,{sent_to_print_date:e.target.value}));}}/></div>
        <div className="form-field"><label>Printing Status</label><select value={bookForm.printing_status} onChange={function(e){setBookForm(Object.assign({},bookForm,{printing_status:e.target.value}));}}><option>Pending</option><option>Sent to Printer</option><option>Printing</option><option>Printed</option><option>Collected from Printer</option></select></div>
        <div className="form-field"><label>Printed Date</label><input type="date" value={bookForm.printed_date} onChange={function(e){setBookForm(Object.assign({},bookForm,{printed_date:e.target.value}));}}/></div>
        <div className="form-field"><label>Collected from Printer</label><input type="date" value={bookForm.collected_from_printer_date} onChange={function(e){setBookForm(Object.assign({},bookForm,{collected_from_printer_date:e.target.value}));}}/></div>
        <div className="form-field"><label>Delivery Status</label><select value={bookForm.delivery_status} onChange={function(e){setBookForm(Object.assign({},bookForm,{delivery_status:e.target.value}));}}><option>Pending</option><option>Ready for Delivery</option><option>Delivered</option></select></div>
        <div className="form-field"><label>Delivered Date</label><input type="date" value={bookForm.delivered_date} onChange={function(e){setBookForm(Object.assign({},bookForm,{delivered_date:e.target.value}));}}/></div>
        <div className="form-field"><label>Delivered To</label><input value={bookForm.delivered_to} onChange={function(e){setBookForm(Object.assign({},bookForm,{delivered_to:e.target.value}));}}/></div>
        <div className="form-field"><label>Delivered By</label><input value={bookForm.delivered_by} onChange={function(e){setBookForm(Object.assign({},bookForm,{delivered_by:e.target.value}));}}/></div>
        <div className="form-field wide"><label>Remarks</label><textarea value={bookForm.remarks} onChange={function(e){setBookForm(Object.assign({},bookForm,{remarks:e.target.value}));}}/></div>
      </div>}
      <div className="modal-actions"><button type="button" className="register-btn" disabled={saving} onClick={function(){setModal(false);}}>Cancel</button><button type="submit" className="register-btn primary" disabled={saving}>{saving?"Saving…":editId?"Save Changes":"Add Entry"}</button></div>
    </form></div>}
  </div>;
}
