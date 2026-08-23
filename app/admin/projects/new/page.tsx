"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { landViewApi } from "@/lib/api";
import { Field, PageHeader } from "@/components/lv-ui";

const initial = {
  Project_ID: "",
  Project_Name: "",
  Client_Name: "",
  Phone_Number: "",
  Project_Type: "",
  Location: "",
  Design_Bill: "",
  Status: "Active",
  Start_Date: "",
};


export default function NewProjectPage() {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function set(key: string, value: string) {
    setForm(v => ({ ...v, [key]: value }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const result = await landViewApi.createProject(form);
      const id = result.Project_ID || form.Project_ID;
      router.push(id ? `/admin/projects/${encodeURIComponent(id)}` : "/admin/projects");
    } catch (e: any) {
      setError(e?.message || "Unable to create project.");
    } finally {
      setSaving(false);
    }
  }


  return <>
    <PageHeader
      eyebrow="PROJECT CONTROL"
      title="Create project"
      description="Add a project with client, location, status and commercial information."
      action={<Link href="/admin/projects" className="btn btn-light">← Projects</Link>}
    />

    <form onSubmit={submit} className="card form-card">
      {error && <div className="notice error"><strong>Could not save</strong><span>{error}</span></div>}

      <div className="form-section">
        <div><span>01</span><h2>Project identity</h2><p>Project ID can be entered manually. If left blank, Code.gs generates an LV- ID.</p></div>
        <div className="form-grid">
          <Field label="PROJECT ID" hint="Optional"><input value={form.Project_ID} onChange={e => set("Project_ID", e.target.value)} placeholder="LV-0001" /></Field>
          <Field label="PROJECT NAME"><input value={form.Project_Name} onChange={e => set("Project_Name", e.target.value)} placeholder="Residence / Commercial Project" /></Field>
          <Field label="PROJECT TYPE"><input value={form.Project_Type} onChange={e => set("Project_Type", e.target.value)} placeholder="Residential" /></Field>
          <Field label="STATUS"><select value={form.Status} onChange={e => set("Status", e.target.value)}><option>Active</option><option>Ongoing</option><option>Pending</option><option>Completed</option><option>Inactive</option></select></Field>
        </div>
      </div>

      <div className="form-section">
        <div><span>02</span><h2>Client & location</h2><p>Record the client contact information and project location.</p></div>
        <div className="form-grid">
          <Field label="CLIENT NAME"><input value={form.Client_Name} onChange={e => set("Client_Name", e.target.value)} placeholder="Client name" /></Field>
          <Field label="PHONE NUMBER"><input value={form.Phone_Number} onChange={e => set("Phone_Number", e.target.value)} placeholder="01XXXXXXXXX" /></Field>
          <Field label="LOCATION"><input value={form.Location} onChange={e => set("Location", e.target.value)} placeholder="Project location" /></Field>
          <Field label="START DATE"><input type="date" value={form.Start_Date} onChange={e => set("Start_Date", e.target.value)} /></Field>
        </div>
      </div>

      <div className="form-section">
        <div><span>03</span><h2>Commercial</h2><p>Initial design bill can be recorded if that column exists in your Projects sheet.</p></div>
        <div className="form-grid single"><Field label="DESIGN BILL"><input type="number" min="0" value={form.Design_Bill} onChange={e => set("Design_Bill", e.target.value)} placeholder="0" /></Field></div>
      </div>

      <div className="form-actions"><Link className="btn btn-light" href="/admin/projects">Cancel</Link><button disabled={saving} className="btn btn-dark">{saving ? "Saving..." : "Create project"}</button></div>
    </form>

  </>;
}
