import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession } from "@/lib/local-session";
import { handleLandviewDataAction, normalizeProjectCode } from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;
type Category = "Engineering Bill" | "Design Books" | "Supervision Bill" | "Other Services Bill";
const TABS = ["Summary","File List","Design Bill","Design Deposit","Design Books Bill","Design Books Deposit","Supervision Bill","S Deposit","Others Bill","Others Bill Deposit"];

function text(v: unknown) { return String(v ?? "").trim(); }
function num(v: unknown) { const n=Number(text(v).replace(/,/g,"").replace(/[^0-9.-]/g,"")); return Number.isFinite(n)?n:0; }
function category(row: Row): Category {
  // Prefer canonical billing buckets. Payment_For can be a free-text purpose
  // such as "6th Floor R.C.C Bill" and must not override Income_Category.
  const source=text(
    row.Billing_Category || row.billing_category ||
    row.Income_Category || row.income_category ||
    row.Category || row.category ||
    row.Payment_For || row.payment_for ||
    row.Description || row.description
  ).toLowerCase();
  if(/design\s*books?/.test(source)) return "Design Books";
  if(/supervision/.test(source)) return "Supervision Bill";
  if(/other|soil|survey|municipality|file pass/.test(source)) return "Other Services Bill";
  return "Engineering Bill";
}
function sheet(tab:string,headers:string[],rows:unknown[][],totals:Row={gross:0,discount:0,billed:0,paid:0,due:0,projects:1}) {
  return {tab,tabs:[...TABS],headers,rows:rows.map(r=>r.map(v=>String(v??""))),totals,url:"",updatedAt:new Date().toISOString()};
}

export async function GET(request: NextRequest) {
  try {
    const projectId=normalizeProjectCode(request.nextUrl.searchParams.get("fileId"));
    if(!projectId) return NextResponse.json({success:false,error:"Enter a valid File ID such as LV-209."},{status:400});
    const user=await requireLocalSession(request);
    if(!user) return NextResponse.json({success:false,error:"Session expired."},{status:401});
    const [project,billing]=await Promise.all([
      handleLandviewDataAction("getProject",{projectId},user) as Promise<Row>,
      handleLandviewDataAction("getProjectBilling",{projectId},user) as Promise<Row>,
    ]);
    const bills=(Array.isArray(billing.bills)?billing.bills:[]) as Row[];
    const payments=(Array.isArray(billing.payments)?billing.payments:[]) as Row[];
    const groups: Record<Category,{bills:Row[];payments:Row[];gross:number;discount:number;paid:number;due:number}>={
      "Engineering Bill":{bills:[],payments:[],gross:0,discount:0,paid:0,due:0},
      "Design Books":{bills:[],payments:[],gross:0,discount:0,paid:0,due:0},
      "Supervision Bill":{bills:[],payments:[],gross:0,discount:0,paid:0,due:0},
      "Other Services Bill":{bills:[],payments:[],gross:0,discount:0,paid:0,due:0},
    };
    for(const b of bills){const g=groups[category(b)];g.bills.push(b);g.gross+=num(b.Amount);g.discount+=num(b.Discount);}
    for(const p of payments){const g=groups[category(p)];g.payments.push(p);g.paid+=num(p.Amount);}
    for(const g of Object.values(groups))g.due=Math.max(0,g.gross-g.discount-g.paid);
    const eng=groups["Engineering Bill"],books=groups["Design Books"],sup=groups["Supervision Bill"],oth=groups["Other Services Bill"];
    const totalDue=eng.due+books.due+sup.due+oth.due,totalBilled=eng.gross-eng.discount+books.gross-books.discount+sup.gross-sup.discount+oth.gross-oth.discount;
    const billRows=(c:Category)=>groups[c].bills.map(b=>[projectId,b.Description||c,b.Unit_Price||"",b.Quantity||"",b.Amount||0,b.Bill_ID||""]);
    const payRows=(c:Category)=>groups[c].payments.map(p=>[projectId,p.Payment_Date||"",[p.Payment_Method,p.Reference_No].filter(Boolean).join(" · ")||"Client Payment",p.Amount||0,p.Approval_Status||"Approved",p.Payment_ID||""]);
    const sheets=[
      sheet("Summary",["FILE ID","Client Name","Project Name","Engineering Bill","Engineering Discount","Engineering Deposit","Engineering Due","Supervision Bill","Supervision Discount","Supervision Deposit","Supervision Due","Other Services Bill","Other Services Discount","Other Services Deposit","Other Services Due","Design Books Bill","Design Books Discount","Design Books Deposit","Design Books Due","Total Due","Status"],[[projectId,project.Client_Name||"",project.Project_Name||"",eng.gross,eng.discount,eng.paid,eng.due,sup.gross,sup.discount,sup.paid,sup.due,oth.gross,oth.discount,oth.paid,oth.due,books.gross,books.discount,books.paid,books.due,totalDue,totalDue>.009?"DUE":totalBilled>0?"FULL PAID":""]]),
      sheet("File List",["FILE ID","Client Name","Address","Phone","Floor/Story","Build Type","Land Area"],[[projectId,project.Client_Name||"",project.Location||"",project.Phone_Number||"",project.Floors||"",project.Project_Type||"",project.Plot_Area||""]]),
      sheet("Design Bill",["FILE ID","Service Name","Rate (BDT)","QTY","Amount (BDT)","Bill ID"],billRows("Engineering Bill")),
      sheet("Design Deposit",["FILE ID","Date","Details","Amount","Verification","Income ID"],payRows("Engineering Bill")),
      sheet("Design Books Bill",["FILE ID","Service Name","Rate (BDT)","QTY","Amount (BDT)","Bill ID"],billRows("Design Books")),
      sheet("Design Books Deposit",["FILE ID","Date","Details","Amount","Verification","Income ID"],payRows("Design Books")),
      sheet("Supervision Bill",["FILE ID","Service Name","Rate (BDT)","QTY","Amount (BDT)","Bill ID"],billRows("Supervision Bill")),
      sheet("S Deposit",["FILE ID","Date","Details","Amount","Verification","Income ID"],payRows("Supervision Bill")),
      sheet("Others Bill",["FILE ID","Service Name","Rate (BDT)","QTY","Amount (BDT)","Bill ID"],billRows("Other Services Bill")),
      sheet("Others Bill Deposit",["FILE ID","Date","Details","Amount","Verification","Income ID"],payRows("Other Services Bill")),
    ];
    return NextResponse.json({success:true,data:{projectId,sheets,payments,updatedAt:new Date().toISOString(),source:"supabase"}},{headers:{"Cache-Control":"no-store, max-age=0","X-Landview-Data":"supabase"}});
  } catch(error){const message=error instanceof Error?error.message:"Project billing request failed.";return NextResponse.json({success:false,error:message},{status:/session/i.test(message)?401:/not found/i.test(message)?404:502,headers:{"Cache-Control":"no-store"}});}
}
