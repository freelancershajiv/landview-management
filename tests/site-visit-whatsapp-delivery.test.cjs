const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

const delivery = import("../whatsapp-service/group-delivery.mjs");
const phone = "8801700000001";
const otherPhone = "8801700000002";
const photo = { mimeType: "image/jpeg", base64: "AQID" };

function linkedSocket(id, onSend) {
  return { user: { id }, sendMessage: onSend };
}

test("a verified linked device sends the visit text and photos with stable retry IDs", async () => {
  const { verifiedEmployeeGroupSender, sendDirectGroupPayload } = await delivery;
  const messages = [];
  const state = {
    connection: "open",
    sock: linkedSocket(phone + ":3@s.whatsapp.net", async (jid, content, options) => {
      messages.push({ jid, content, id: options.messageId });
      return { key: { id: options.messageId } };
    }),
  };
  const send = verifiedEmployeeGroupSender(state, phone);
  const original = await sendDirectGroupPayload(send, "test-group", "Visit", [photo, photo], "visit-1");
  const retry = await sendDirectGroupPayload(send, "test-group", "Visit", [photo, photo], "visit-1");
  assert.equal(original.mediaCount, 2);
  assert.equal(new Set(original.messageIds).size, 3);
  assert.deepEqual(original.messageIds, retry.messageIds);
  assert.equal(messages[0].content.text, "Visit");
  assert.ok(Buffer.isBuffer(messages[1].content.image));
});

test("a different number, a LID, a missing number and a disconnected socket all block sending", async () => {
  const { verifiedEmployeeGroupSender } = await delivery;
  for (const [jid, expected, connection] of [
    [otherPhone + "@s.whatsapp.net", phone, "open"],
    [phone + "@lid", phone, "open"],
    [phone + "@s.whatsapp.net", "", "open"],
    [phone + "@s.whatsapp.net", phone, "disconnected"],
  ]) {
    const state = { connection, sock: linkedSocket(jid, assert.fail) };
    assert.throws(() => verifiedEmployeeGroupSender(state, expected), { status: 409 });
  }
});

test("a replacement device during group lookup blocks the entire send", async () => {
  const { verifiedEmployeeGroupSender, sendDirectGroupPayload } = await delivery;
  const state = { connection: "open", sock: linkedSocket(phone + "@s.whatsapp.net", assert.fail) };
  const send = verifiedEmployeeGroupSender(state, phone);
  state.sock = linkedSocket(otherPhone + "@s.whatsapp.net", assert.fail);
  await assert.rejects(sendDirectGroupPayload(send, "test-group", "Visit", [photo], "visit-2"), { status: 409 });
});

test("a change of identity between the text and the photo stops media delivery", async () => {
  const { verifiedEmployeeGroupSender, sendDirectGroupPayload } = await delivery;
  const messages = [];
  const socket = linkedSocket(phone + "@s.whatsapp.net", async (_jid, content) => {
    messages.push(content);
    socket.user.id = otherPhone + "@s.whatsapp.net";
    return { key: { id: "first" } };
  });
  const send = verifiedEmployeeGroupSender({ connection: "open", sock: socket }, phone);
  await assert.rejects(sendDirectGroupPayload(send, "test-group", "Visit", [photo], "visit-3"), { status: 409 });
  assert.deepEqual(messages, [{ text: "Visit" }]);
});

function publisherWithStatuses(statuses, sendStatuses, clientOptedIn = true) {
  const employeeId = "EMP-0004";
  const sends = [];
  const records = [];
  const clientUpdates = [];
  const data = {
    normalizeProjectCode: value => value,
    selectRows: async table => {
      if (table === "employees") return [{ status: "Active", phone_number: phone }];
      if (table === "site_visits") return [{}];
      if (table === "projects") return [{ whatsapp_updates_enabled: clientOptedIn }];
      return [];
    },
    updateRows: async (_table, _filters, row) => records.push(row),
  };
  const modules = { "@/lib/supabase-data": data };
  const sandbox = {
    require: name => modules[name],
    process: { env: { WHATSAPP_BOT_API_TOKEN: "test", WHATSAPP_BOT_URL: "https://example.test", WHATSAPP_SITE_VISIT_GROUP_INVITE_CODE: "test" } },
    AbortSignal, console, setTimeout: callback => callback(),
    fetch: async (url, options) => {
      const path = new URL(url).pathname;
      if (path === "/functions/v1/landview-whatsapp-project-queue") {
        clientUpdates.push({ statusAtQueue: records.at(-1)?.whatsapp_publish_status, payload: JSON.parse(options.body) });
        return Response.json({ success: true, data: {} });
      }
      if (path === "/client/wake") return Response.json({});
      if (path === "/employee/status") {
        return Response.json({ employeeId, paired: true, connection: "open", ...statuses.shift() });
      }
      assert.equal(path, "/employee/send-verified");
      sends.push(JSON.parse(options.body));
      const status = sendStatuses.shift();
      return Response.json({ ok: status === 200, messageId: "test-message", mediaCount: 1 }, { status });
    },
  };
  function load(file) {
    const exports = {};
    const { outputText } = ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    });
    vm.runInNewContext(outputText, { ...sandbox, exports });
    return exports;
  }
  modules["@/lib/employee-whatsapp-identity"] = load("lib/employee-whatsapp-identity.ts");
  const { publishSiteVisitToWhatsApp } = load("lib/whatsapp-site-visits.ts");
  const publish = () => publishSiteVisitToWhatsApp({
    visitId: "SV-TEST", employeeId, projectId: "LV-TEST", mediaItems: [photo],
  });
  return { publish, sends, records, clientUpdates };
}

test("the visit publisher binds a text and photo delivery to the registered employee", async () => {
  const { publish, sends, records, clientUpdates } = publisherWithStatuses([{ phoneNumber: phone }], [200]);
  const result = await publish();
  assert.equal(result.status, "sent");
  assert.equal(sends.length, 1);
  assert.equal(sends[0].expectedPhone, phone);
  assert.equal(sends[0].employeeId, "EMP-0004");
  assert.match(sends[0].idempotencyKey, /SV-TEST/);
  assert.equal(sends[0].media.length, 1);
  assert.equal(records[0].whatsapp_publish_status, "sent");
  assert.equal(clientUpdates.length, 1);
  assert.equal(clientUpdates[0].statusAtQueue, "sent");
  assert.equal(clientUpdates[0].payload.dedupeKey, "client-site-visit:SV-TEST");
});

test("a verified group posting respects the project’s client notification opt-out", async () => {
  const { publish, clientUpdates } = publisherWithStatuses([{ phoneNumber: phone }], [200], false);
  assert.equal((await publish()).status, "sent");
  assert.equal(clientUpdates.length, 0);
});

test("the first failed identity check stops a retry after a transient gateway error", async () => {
  const { publish, sends, records, clientUpdates } = publisherWithStatuses([
    { phoneNumber: phone }, { phoneNumber: otherPhone },
  ], [503]);
  const result = await publish();
  assert.equal(result.status, "failed");
  assert.equal(sends.length, 1);
  assert.equal(records[0].whatsapp_publish_status, "failed");
  assert.equal(clientUpdates.length, 0);
});

test("a shared Admin session and a session labelled for another employee cannot publish the visit", async () => {
  for (const status of [{ sharedWithAdmin: true }, { employeeId: "EMP-0002" }, { phoneNumber: otherPhone }]) {
    const { publish, sends, clientUpdates } = publisherWithStatuses([{ phoneNumber: phone, ...status }], []);
    assert.equal((await publish()).status, "failed");
    assert.equal(sends.length, 0);
    assert.equal(clientUpdates.length, 0);
  }
});
