/** Preserve entered wording; avoid prepending a second employment statement. */
export function certificateContent(record: { description: string }) {
  const value = String(record.description || "").trim().replace(/\s+[•●▪]\s*/g, "\n• ");
  const lines = value.split(/\r?\n/).map(line => line.trim());
  if (/^this\s+is\s+to\s+certify\b/i.test(value)) {
    return { opening: "complete" as const, continuation: "", lines };
  }
  if (/^(?:has\s+(?:been\s+serving|served)|is\s+(?:serving|employed)|served|was\s+employed)\b/i.test(value)) {
    // A legacy statement may place the tenure and duties in one paragraph.
    const match = value.match(/^([\s\S]*?[.!?])(?:\s+(?=[A-Z])|$)/);
    const continuation = match ? match[1] : lines[0];
    const rest = value.slice(continuation.length).trim();
    return { opening: "continuation" as const, continuation, lines: rest ? rest.split(/\r?\n/).map(line => line.trim()) : [] };
  }
  return { opening: "generated" as const, continuation: "", lines };
}
