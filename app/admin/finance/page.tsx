import BillingProjectJump from "@/components/billing-project-jump";

export default function BillingDashboard() {
  return <main className="bv4" style={{ maxWidth: 1500, margin: "0 auto", color: "var(--lv-text-primary)" }}>
    <h1>Client Billing</h1>
    <BillingProjectJump />
  </main>;
}
