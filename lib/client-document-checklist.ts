const requirements = [
  { name: "Photo", aliases: ["Client Photo", "Passport Size Photo", "Photograph"] },
  { name: "NID/Passport/Birth Certificate", aliases: ["Client NID", "NID", "Passport", "Birth Certificate", "National ID", "NID Card"] },
  { name: "Ownership Registry Paper", aliases: ["Land Deed", "Title Deed", "Ownership Deed", "Registered Deed"] },
  { name: "Khotian", aliases: ["Khatian", "Khatian / Porcha", "Khotian / Porcha", "Porcha"] },
  { name: "Land Tax Slip", aliases: ["Land Tax Receipt", "Land Tax", "Dakhila"] },
];

const normalize = (value: unknown) => String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

type DocumentRegisterEntry = { document_name?: string; collection_status?: string; return_status?: string };

export function clientDocumentChecklist(entries: DocumentRegisterEntry[]) {
  return requirements.map(({ name, aliases }) => {
    const accepted = new Set([name, ...aliases].map(normalize));
    const matches = entries.filter((entry) => accepted.has(normalize(entry.document_name)));
    const available = matches.filter((entry) => normalize(entry.return_status) !== "returned");
    const hasStatus = (status: string) => available.some((entry) => normalize(entry.collection_status) === status);
    const status = hasStatus("verified") ? "Verified"
      : hasStatus("received") ? "Received · verification not recorded"
      : hasStatus("partial") ? "Partially received"
      : hasStatus("pending") ? "Pending"
      : hasStatus("not required") ? "Not required"
      : matches.length ? "Returned or unavailable" : "Missing";
    return { name, status };
  });
}
