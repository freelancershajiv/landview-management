"use client";

import {
  FormEvent,
  useEffect,
  useState,
} from "react";

import { landViewApi } from "@/lib/api";
import {
  EmptyState,
  Field,
  LoadingState,
  Money,
  PageHeader,
  StatCard,
  formatDate,
  pick,
} from "@/components/lv-ui";

type Mode = "bill" | "payment" | "invoice" | null;

type FinanceForm = {
  Project_ID: string;
  Amount: string;
  Date: string;
  Description: string;
};

function invoicePdfUrl(invoice: any) {
  return pick(
    invoice,
    [
      "PDF_URL",
      "Invoice_PDF_URL",
      "File_URL",
      "pdfUrl",
    ],
    ""
  );
}

function invoiceDownloadUrl(invoice: any) {
  const direct = pick(
    invoice,
    ["Download_URL", "downloadUrl"],
    ""
  );

  if (direct) return direct;

  const fileId = pick(
    invoice,
    ["PDF_File_ID", "File_ID", "fileId"],
    ""
  );

  return fileId
    ? `https://drive.google.com/uc?export=download&id=${fileId}`
    : "";
}

export default function FinancePage() {
  const [dash, setDash] = useState<any>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [bills, setBills] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [mode, setMode] = useState<Mode>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FinanceForm>({
    Project_ID: "",
    Amount: "",
    Date: "",
    Description: "",
  });

  async function load() {
    setLoading(true);
    setError("");

    try {
      const [dashboard, projectRows, paymentRows, invoiceRows] =
        await Promise.all([
          landViewApi.getBillingDashboard(),
          landViewApi.getProjects(),
          landViewApi.getPayments(),
          landViewApi.getInvoices(),
        ]);

      setDash(dashboard);
      setProjects(projectRows);
      setPayments(paymentRows);
      setInvoices(invoiceRows);

      const projectBills = await Promise.all(
        projectRows.slice(0, 50).map(async (project: any) => {
          const projectId = pick(project, ["Project_ID"]);

          try {
            return (
              (await landViewApi.getProjectBilling(projectId))?.bills || []
            );
          } catch {
            return [];
          }
        })
      );

      setBills(projectBills.flat());
    } catch (err: any) {
      setError(err?.message || "Could not load finance.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function open(modeToOpen: Mode) {
    setError("");
    setSuccess("");
    setMode(modeToOpen);
    setForm({
      Project_ID: "",
      Amount: "",
      Date: new Date().toISOString().slice(0, 10),
      Description: "",
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();

    if (saving) return;

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      if (mode === "bill") {
        await landViewApi.createBill({
          ...form,
          Bill_Date: form.Date,
          Amount: form.Amount,
          Bill_Amount: form.Amount,
          Description: form.Description,
          Notes: form.Description,
        });

        setSuccess("Bill saved successfully.");
      } else if (mode === "payment") {
        await landViewApi.createPayment({
          ...form,
          Payment_Date: form.Date,
          Amount: form.Amount,
          Payment_Amount: form.Amount,
          Notes: form.Description,
        });

        setSuccess("Payment recorded successfully.");
      } else if (mode === "invoice") {
        const result = await landViewApi.createInvoice(form.Project_ID);

        const invoiceId =
          result?.invoiceId ||
          result?.invoice?.Invoice_ID ||
          "Invoice";

        setSuccess(
          `${invoiceId} generated and saved to the project's Drive folder.`
        );
      }

      setMode(null);
      await load();
    } catch (err: any) {
      setError(
        err?.message ||
          "Could not save the finance record."
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <LoadingState label="Loading finance..." />;
  }

  return (
    <>
      <PageHeader
        eyebrow="BUSINESS"
        title="Finance"
        description="Bills, collections, outstanding balances and generated PDF invoices."
        action={
          <div className="button-row">
            <button
              className="btn btn-light"
              onClick={() => open("payment")}
            >
              + Payment
            </button>

            <button
              className="btn btn-dark"
              onClick={() => open("bill")}
            >
              + Bill
            </button>
          </div>
        }
      />

      {error && (
        <div className="notice error">
          <strong>Notice</strong>
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="notice success">
          <strong>Completed</strong>
          <span>{success}</span>
        </div>
      )}

      <div className="stats-grid">
        <StatCard
          label="TOTAL BILLED"
          value={<Money value={dash?.totalBill || 0} />}
          detail={`${dash?.billCount || 0} bill records`}
          icon="৳"
        />

        <StatCard
          label="TOTAL PAID"
          value={<Money value={dash?.totalPaid || 0} />}
          detail={`${dash?.paymentCount || 0} payments`}
          icon="✓"
        />

        <StatCard
          label="OUTSTANDING"
          value={<Money value={dash?.pending || 0} />}
          detail="Billed less paid"
          icon="↗"
        />

        <StatCard
          label="PROJECTS"
          value={dash?.projectCount || 0}
          detail="Projects in finance scope"
          icon="◇"
        />
      </div>

      <div className="two-col">
        <section className="card table-card">
          <div className="section-title">
            <div>
              <span>COLLECTIONS</span>
              <h2>Recent payments</h2>
            </div>
          </div>

          {payments.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Payment</th>
                    <th>Project</th>
                    <th>Date</th>
                    <th>Amount</th>
                  </tr>
                </thead>

                <tbody>
                  {[...payments]
                    .reverse()
                    .slice(0, 10)
                    .map((record: any, index) => (
                      <tr
                        key={pick(
                          record,
                          ["Payment_ID"],
                          String(index)
                        )}
                      >
                        <td>
                          <strong>
                            {pick(
                              record,
                              ["Payment_ID"],
                              "Payment"
                            )}
                          </strong>
                        </td>

                        <td>
                          {pick(record, ["Project_ID"], "—")}
                        </td>

                        <td>
                          {formatDate(
                            record.Date || record.Payment_Date
                          )}
                        </td>

                        <td>
                          <strong>
                            <Money
                              value={
                                record.Amount ||
                                record.Payment_Amount
                              }
                            />
                          </strong>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-inline">
              No payment records yet.
            </div>
          )}
        </section>

        <section className="card invoice-card">
          <div className="section-title">
            <div>
              <span>INVOICES</span>
              <h2>Generated invoices</h2>
            </div>

            <button
              className="btn btn-small"
              onClick={() => open("invoice")}
            >
              Generate
            </button>
          </div>

          {invoices.length ? (
            <div className="invoice-list">
              {[...invoices]
                .reverse()
                .slice(0, 10)
                .map((record: any, index) => {
                  const pdfUrl = invoicePdfUrl(record);
                  const downloadUrl = invoiceDownloadUrl(record);

                  return (
                    <div
                      className="invoice-row"
                      key={pick(
                        record,
                        ["Invoice_ID"],
                        String(index)
                      )}
                    >
                      <div className="invoice-row-main">
                        <div>
                          <strong>
                            {pick(
                              record,
                              ["Invoice_ID"],
                              "Invoice"
                            )}
                          </strong>
                          <span>
                            {pick(record, ["Project_ID"], "—")}
                            {pick(record, ["Client_Name"], "")
                              ? ` · ${pick(record, ["Client_Name"])}`
                              : ""}
                          </span>
                        </div>

                        <div className="invoice-row-meta">
                          <b>
                            {pick(
                              record,
                              ["Status"],
                              "Generated"
                            )}
                          </b>
                          <span>
                            {formatDate(record.Invoice_Date)}
                          </span>
                        </div>
                      </div>

                      <div className="invoice-row-balance">
                        <span>Balance due</span>
                        <strong>
                          <Money
                            value={
                              record.Due_Amount ??
                              record.due ??
                              0
                            }
                          />
                        </strong>
                      </div>

                      {pdfUrl ? (
                        <div className="invoice-actions">
                          <a
                            className="btn btn-small btn-light"
                            href={pdfUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            View
                          </a>

                          <a
                            className="btn btn-small btn-light"
                            href={pdfUrl}
                            target="_blank"
                            rel="noreferrer"
                            title="Open the PDF, then use the browser/PDF viewer print command."
                          >
                            Print
                          </a>

                          {downloadUrl && (
                            <a
                              className="btn btn-small btn-dark"
                              href={downloadUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Download
                            </a>
                          )}
                        </div>
                      ) : (
                        <div className="invoice-missing-file">
                          This older invoice has no PDF file attached.
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          ) : (
            <EmptyState
              title="No invoices"
              text="Generate an invoice for a project when needed."
            />
          )}
        </section>
      </div>

      <section className="card table-card">
        <div className="section-title">
          <div>
            <span>BILL REGISTER</span>
            <h2>Bill records</h2>
          </div>
        </div>

        {bills.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Bill</th>
                  <th>Project</th>
                  <th>Description</th>
                  <th>Amount</th>
                </tr>
              </thead>

              <tbody>
                {[...bills]
                  .reverse()
                  .slice(0, 30)
                  .map((record: any, index) => (
                    <tr
                      key={pick(
                        record,
                        ["Bill_ID"],
                        String(index)
                      )}
                    >
                      <td>
                        <strong>
                          {pick(record, ["Bill_ID"], "Bill")}
                        </strong>
                      </td>

                      <td>
                        {pick(record, ["Project_ID"], "—")}
                      </td>

                      <td>
                        {pick(
                          record,
                          ["Description", "Particulars", "Item"],
                          "—"
                        )}
                      </td>

                      <td>
                        <strong>
                          <Money
                            value={
                              record.Amount ||
                              record.Bill_Amount ||
                              record.Total ||
                              record.Grand_Total
                            }
                          />
                        </strong>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-inline">No bills yet.</div>
        )}
      </section>

      {mode && (
        <div
          className="modal-backdrop"
          onMouseDown={() => !saving && setMode(null)}
        >
          <form
            className="modal card"
            onSubmit={submit}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="section-title">
              <div>
                <span>FINANCE RECORD</span>
                <h2>
                  {mode === "bill"
                    ? "Create bill"
                    : mode === "payment"
                    ? "Record payment"
                    : "Generate PDF invoice"}
                </h2>
              </div>

              <button
                type="button"
                className="icon-button"
                disabled={saving}
                onClick={() => setMode(null)}
              >
                ×
              </button>
            </div>

            {mode === "invoice" && (
              <div className="invoice-generation-note">
                The invoice will include all bill and payment records for
                the selected project and will be saved to that project's
                <strong> Invoices </strong>
                Drive folder.
              </div>
            )}

            <div className="form-grid">
              <Field label="PROJECT">
                <select
                  required
                  value={form.Project_ID}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      Project_ID: event.target.value,
                    }))
                  }
                >
                  <option value="">Select project</option>

                  {projects.map((project: any) => (
                    <option
                      key={pick(project, ["Project_ID"])}
                      value={pick(project, ["Project_ID"])}
                    >
                      {pick(project, ["Project_ID"])} —{" "}
                      {pick(
                        project,
                        ["Project_Name", "Client_Name"],
                        ""
                      )}
                    </option>
                  ))}
                </select>
              </Field>

              {mode !== "invoice" && (
                <>
                  <Field label="AMOUNT">
                    <input
                      required
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.Amount}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          Amount: event.target.value,
                        }))
                      }
                    />
                  </Field>

                  <Field label="DATE">
                    <input
                      type="date"
                      value={form.Date}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          Date: event.target.value,
                        }))
                      }
                    />
                  </Field>

                  <Field label="DESCRIPTION">
                    <input
                      value={form.Description}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          Description: event.target.value,
                        }))
                      }
                    />
                  </Field>
                </>
              )}
            </div>

            <div className="form-actions">
              <button
                type="button"
                className="btn btn-light"
                disabled={saving}
                onClick={() => setMode(null)}
              >
                Cancel
              </button>

              <button
                className="btn btn-dark"
                disabled={saving}
              >
                {saving
                  ? "Working..."
                  : mode === "invoice"
                  ? "Generate PDF invoice"
                  : "Save record"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
