import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession, roleOf } from "@/lib/local-session";
import { normalizeProjectCode, selectRows } from "@/lib/supabase-data";
import { billingAmount, billingPaymentIsEffective, billIsEffective, invoiceBillingCategory } from "@/lib/billing-payment-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;
type Category = "Engineering Bill" | "Design Books" | "Supervision Bill" | "Other Services Bill";
const TABS = ["Summary","File List","Design Bill","Design Deposit","Design Books Bill","Design Books Deposit","Supervision Bill","S Deposit","Others Bill","Others Bill Deposit"];

function sheet(tab:string, headers:string[], rows:unknown[][], totals:Row={gross:0,discount:0,billed:0,paid:0,due:0,projects:1}) {
  return { tab, tabs:[...TABS], headers, rows:rows.map(row=>row.map(value=>String(value??""))), totals, url:"", updatedAt:new Date().toISOString() };
}
function mappedPayment(row: Row, projectId: string) {
  return {
    Payment_ID: row.payment_code,
    Project_ID: projectId,
    Payment_Date: row.payment_date || "",
    Amount: billingAmount(row.amount),
    Payment_Method: row.payment_method || "",
    Reference_No: row.reference_no || "",
    Notes: row.notes || "",
    Payment_For: row.payment_for || "",
    Income_Category: row.income_category || "",
    Transaction_Type: row.transaction_type || "",
    Affects_Business_Balance: row.affects_business_balance !== false,
    Is_Legacy_Manual: row.is_legacy_manual === true,
    Approval_Status: row.approval_status || "",
    Status: row.status || "",
  };
}
function mappedBill(row: Row, projectId: string) {
  return {
    Bill_ID: row.bill_code,
    Project_ID: projectId,
    Bill_Date: row.bill_date || "",
    Billing_Category: row.billing_category || "",
    Category: row.category || "",
    Description: row.description || "",
    Amount: billingAmount(row.amount),
    Discount: billingAmount(row.discount),
    Net_Amount: billingAmount(row.net_amount ?? (billingAmount(row.amount) - billingAmount(row.discount))),
    Status: row.status || "",
    Unit_Price: row.unit_price ?? "",
    Quantity: row.quantity ?? "",
  };
}

export async function GET(request: NextRequest) {
  try {
    const projectId = normalizeProjectCode(request.nextUrl.searchParams.get("fileId") || request.nextUrl.searchParams.get("projectId"));
    if (!projectId) return NextResponse.json({success:false,error:"Enter a valid File ID such as LV-209."},{status:400});
    const user = await requireLocalSession(request) as Row | null;
    if (!user) return NextResponse.json({success:false,error:"Session expired."},{status:401});
    if (roleOf(user) === "client") {
      const rawIds=String(user.projectIds || user.Project_IDs || user.project_ids || "");
      const allowedIds=new Set(rawIds.split(/[;,\s]+/).map(normalizeProjectCode).filter(Boolean));
      if(!allowedIds.has(projectId)) return NextResponse.json({success:false,error:"Access denied for this project."},{status:403});
    }

    const projectRows = await selectRows("projects", { filters: { project_code: projectId }, limit: 1 });
    if (!projectRows.length) return NextResponse.json({success:false,error:"Project not found."},{status:404});
    const project = projectRows[0];
    const [rawBills, rawPayments] = await Promise.all([
      selectRows("bills", { filters: { project_id: project.id }, order: "bill_date:asc", limit: 5000 }),
      selectRows("payments", { filters: { project_id: project.id }, order: "payment_date:asc", limit: 5000 }),
    ]);
    const bills = rawBills.filter(billIsEffective);
    const payments = rawPayments.filter(billingPaymentIsEffective);
    const groups: Record<Category,{bills:Row[];payments:Row[];gross:number;discount:number;paid:number;due:number}> = {
      "Engineering Bill":{bills:[],payments:[],gross:0,discount:0,paid:0,due:0},
      "Design Books":{bills:[],payments:[],gross:0,discount:0,paid:0,due:0},
      "Supervision Bill":{bills:[],payments:[],gross:0,discount:0,paid:0,due:0},
      "Other Services Bill":{bills:[],payments:[],gross:0,discount:0,paid:0,due:0},
    };
    for(const bill of bills){const g=groups[invoiceBillingCategory(bill)];g.bills.push(bill);g.gross+=billingAmount(bill.amount);g.discount+=billingAmount(bill.discount);}
    for(const payment of payments){const g=groups[invoiceBillingCategory(payment)];g.payments.push(payment);g.paid+=billingAmount(payment.amount);}
    for(const g of Object.values(groups)) g.due=Math.max(0,g.gross-g.discount-g.paid);

    const eng=groups["Engineering Bill"], books=groups["Design Books"], sup=groups["Supervision Bill"], oth=groups["Other Services Bill"];
    const totalDue=eng.due+books.due+sup.due+oth.due;
    const totalBilled=eng.gross-eng.discount+books.gross-books.discount+sup.gross-sup.discount+oth.gross-oth.discount;
    const totalPaid=payments.reduce((sum,row)=>sum+billingAmount(row.amount),0);
    const billRows=(c:Category)=>groups[c].bills.map(b=>[projectId,b.description||c,b.unit_price||"",b.quantity||"",b.amount||0,b.bill_code||"",groups[c].due<=0.009?"Paid":b.status||"",b.net_amount ?? (billingAmount(b.amount)-billingAmount(b.discount)),b.discount||0]);
    const payRows=(c:Category)=>groups[c].payments.map(p=>[projectId,p.payment_date||"",[p.payment_method,p.reference_no].filter(Boolean).join(" · ")||"Client Payment",p.amount||0,p.approval_status||"Approved",p.payment_code||""]);
    const sheets=[
      sheet("Summary",["FILE ID","Client Name","Project Name","Engineering Bill","Engineering Discount","Engineering Deposit","Engineering Due","Supervision Bill","Supervision Discount","Supervision Deposit","Supervision Due","Other Services Bill","Other Services Discount","Other Services Deposit","Other Services Due","Design Books Bill","Design Books Discount","Design Books Deposit","Design Books Due","Total Due","Status"],[[projectId,project.client_name_snapshot||"",project.project_name||"",eng.gross,eng.discount,eng.paid,eng.due,sup.gross,sup.discount,sup.paid,sup.due,oth.gross,oth.discount,oth.paid,oth.due,books.gross,books.discount,books.paid,books.due,totalDue,totalDue>.009?"DUE":totalBilled>0?"FULL PAID":""]]),
      sheet("File List",["FILE ID","Client Name","Address","Phone","Floor/Story","Build Type","Land Area","Referred By","Ref. Contact"],[[projectId,project.client_name_snapshot||"",project.location||"",project.phone_number_snapshot||"",project.floors||"",project.project_type||"",project.plot_area||"",project.referred_by||"",project.ref_contact||""]]),
      sheet("Design Bill",["FILE ID","Service Name","Rate (BDT)","QTY","Amount (BDT)","Bill ID","Status","Net Amount (BDT)","Discount (BDT)"],billRows("Engineering Bill")),
      sheet("Design Deposit",["FILE ID","Date","Details","Amount","Verification","Income ID"],payRows("Engineering Bill")),
      sheet("Design Books Bill",["FILE ID","Service Name","Rate (BDT)","QTY","Amount (BDT)","Bill ID","Status","Net Amount (BDT)","Discount (BDT)"],billRows("Design Books")),
      sheet("Design Books Deposit",["FILE ID","Date","Details","Amount","Verification","Income ID"],payRows("Design Books")),
      sheet("Supervision Bill",["FILE ID","Service Name","Rate (BDT)","QTY","Amount (BDT)","Bill ID"],billRows("Supervision Bill")),
      sheet("S Deposit",["FILE ID","Date","Details","Amount","Verification","Income ID"],payRows("Supervision Bill")),
      sheet("Others Bill",["FILE ID","Service Name","Rate (BDT)","QTY","Amount (BDT)","Bill ID"],billRows("Other Services Bill")),
      sheet("Others Bill Deposit",["FILE ID","Date","Details","Amount","Verification","Income ID"],payRows("Other Services Bill")),
    ];

    const legacyBills=bills.map(row=>mappedBill(row,projectId));
    const legacyPayments=payments.map(row=>mappedPayment(row,projectId));
    if(request.nextUrl.searchParams.get("response") === "summary") {
      return NextResponse.json({success:true,data:{projectId,bills:legacyBills,payments:legacyPayments,totalBill:totalBilled,totalPaid,due:Math.max(0,totalBilled-totalPaid)}},{headers:{"Cache-Control":"no-store, max-age=0","X-Landview-Data":"supabase-billing-compatible"}});
    }
    return NextResponse.json({success:true,data:{projectId,sheets,payments:legacyPayments,updatedAt:new Date().toISOString(),source:"supabase-billing-compatible"}},{headers:{"Cache-Control":"no-store, max-age=0","X-Landview-Data":"supabase-billing-compatible"}});
  } catch(error){const message=error instanceof Error?error.message:"Project billing request failed.";return NextResponse.json({success:false,error:message},{status:/session/i.test(message)?401:/not found/i.test(message)?404:500,headers:{"Cache-Control":"no-store"}});}
}
