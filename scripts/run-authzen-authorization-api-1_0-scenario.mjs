import assert from "node:assert/strict";

const configuredBaseUrl = process.env.AUTHZEN_CERT_BASE_URL;
if (!configuredBaseUrl) {
  throw new Error("AUTHZEN_CERT_BASE_URL is required");
}

const baseUrl = configuredBaseUrl.replace(/\/$/, "");
const base = new URL(baseUrl);
if (base.protocol !== "https:" && process.env.AUTHZEN_CERT_ALLOW_HTTP !== "1") {
  throw new Error("AUTHZEN_CERT_BASE_URL must use HTTPS unless AUTHZEN_CERT_ALLOW_HTTP=1");
}

async function call(method, path, payload, headers = {}) {
  const response = await fetch(new URL(path, `${baseUrl}/`), {
    method,
    redirect: "error",
    headers: {
      ...(payload === undefined ? {} : { "content-type": "application/json" }),
      ...headers,
    },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });

  const text = await response.text();
  let body;
  if (text.length > 0) {
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error(`${method} ${path} returned non-JSON body: ${text.slice(0, 200)}`);
    }
  }
  return { response, body };
}

function evaluation(subject, action, resource, context) {
  return {
    subject,
    action,
    resource,
    ...(context === undefined ? {} : { context }),
  };
}

async function expectDecision(payload, expected, label) {
  const { response, body } = await call("POST", "/access/v1/evaluation", payload);
  assert.equal(response.status, 200, `${label}: expected HTTP 200`);
  assert.equal(typeof body?.decision, "boolean", `${label}: decision must be boolean`);
  assert.equal(body.decision, expected, `${label}: unexpected decision`);
}

async function expect400(path, payload, label) {
  const { response } = await call("POST", path, payload);
  assert.equal(response.status, 400, `${label}: expected HTTP 400`);
}

function ids(results) {
  return results.map((entry) => entry.id);
}

function actionNames(results) {
  return results.map((entry) => entry.name);
}

async function runDiscovery() {
  const { response, body } = await call("GET", "/.well-known/authzen-configuration");
  assert.equal(response.status, 200, "discovery: expected HTTP 200");
  assert.equal(body.policy_decision_point, baseUrl, "discovery: PDP base URL mismatch");
  assert.equal(
    body.access_evaluation_endpoint,
    `${baseUrl}/access/v1/evaluation`,
    "discovery: evaluation endpoint mismatch",
  );
  assert.equal(
    body.access_evaluations_endpoint,
    `${baseUrl}/access/v1/evaluations`,
    "discovery: batch endpoint mismatch",
  );
  assert.equal(body.search_subject_endpoint, `${baseUrl}/access/v1/search/subject`);
  assert.equal(body.search_resource_endpoint, `${baseUrl}/access/v1/search/resource`);
  assert.equal(body.search_action_endpoint, `${baseUrl}/access/v1/search/action`);
}

async function runBasic() {
  const alice = { type: "user", id: "alice" };
  const bob = { type: "user", id: "bob" };
  const record1 = { type: "record", id: "record-1" };
  const record2Archived = {
    type: "record",
    id: "record-2",
    properties: { status: "archived" },
  };

  await expectDecision(evaluation(alice, { name: "read" }, record1), true, "B1 alice read record-1");
  await expectDecision(evaluation(alice, { name: "write" }, record1), true, "B2 alice write record-1");
  await expectDecision(evaluation(bob, { name: "read" }, record1), true, "B3 bob read record-1");
  await expectDecision(evaluation(bob, { name: "write" }, record1), false, "B4 bob write record-1");
  await expectDecision(
    evaluation(alice, { name: "write" }, record2Archived),
    false,
    "P5 alice write archived",
  );
  await expectDecision(
    evaluation(
      { type: "user", id: "bob", properties: { role: "admin" } },
      { name: "write" },
      record2Archived,
    ),
    true,
    "P6 admin write archived",
  );
  await expectDecision(
    evaluation(alice, { name: "delete", properties: { soft: true } }, record1),
    true,
    "P7 soft delete",
  );
  await expectDecision(
    evaluation(alice, { name: "delete", properties: { soft: false } }, record1),
    false,
    "P8 hard delete",
  );

  await expectDecision(
    {
      ...evaluation(alice, { name: "read" }, record1, {
        time: "2025-06-27T18:03-07:00",
        ip: "192.168.1.1",
      }),
      unknown_top_level: "ignored",
    },
    true,
    "optional context / unknown field",
  );

  await expect400(
    "/access/v1/evaluation",
    { action: { name: "read" }, resource: record1 },
    "missing subject",
  );
  await expect400(
    "/access/v1/evaluation",
    { subject: alice, resource: record1 },
    "missing action",
  );
  await expect400(
    "/access/v1/evaluation",
    { subject: alice, action: { name: "read" } },
    "missing resource",
  );

  const requestId = `authzen-scenario-${Date.now()}`;
  const requestWithId = await call(
    "POST",
    "/access/v1/evaluation",
    evaluation(alice, { name: "read" }, record1),
    { "x-request-id": requestId },
  );
  assert.equal(requestWithId.response.status, 200);
  assert.equal(requestWithId.response.headers.get("x-request-id"), requestId);

  const first = await call("POST", "/access/v1/evaluation", evaluation(alice, { name: "read" }, record1));
  const second = await call("POST", "/access/v1/evaluation", evaluation(alice, { name: "read" }, record1));
  assert.equal(first.body.decision, second.body.decision, "idempotency: decision changed across identical calls");
}

async function runBatch() {
  const fullySpecified = await call("POST", "/access/v1/evaluations", {
    evaluations: [
      evaluation(
        { type: "user", id: "alice" },
        { name: "read" },
        { type: "record", id: "record-1" },
      ),
      evaluation(
        { type: "user", id: "bob" },
        { name: "write" },
        { type: "record", id: "record-1" },
      ),
    ],
  });
  assert.equal(fullySpecified.response.status, 200);
  assert.deepEqual(
    fullySpecified.body.evaluations.map((entry) => entry.decision),
    [true, false],
    "batch: fully specified decisions mismatch",
  );

  const defaults = await call("POST", "/access/v1/evaluations", {
    subject: { type: "user", id: "alice" },
    action: { name: "write" },
    resource: { type: "record", id: "record-1", properties: { status: "active" } },
    evaluations: [
      {},
      { resource: { type: "record", id: "record-2", properties: { status: "archived" } } },
    ],
  });
  assert.equal(defaults.response.status, 200);
  assert.deepEqual(defaults.body.evaluations.map((entry) => entry.decision), [true, false]);

  const properties = await call("POST", "/access/v1/evaluations", {
    action: { name: "write" },
    resource: { type: "record", id: "record-2", properties: { status: "archived" } },
    evaluations: [
      { subject: { type: "user", id: "alice" } },
      { subject: { type: "user", id: "bob", properties: { role: "admin" } } },
    ],
  });
  assert.equal(properties.response.status, 200);
  assert.deepEqual(properties.body.evaluations.map((entry) => entry.decision), [false, true]);

  const executeAll = await call("POST", "/access/v1/evaluations", {
    subject: { type: "user", id: "alice" },
    action: { name: "read" },
    options: { evaluations_semantic: "execute_all" },
    evaluations: [
      { resource: { type: "record", id: "record-1" } },
      {},
    ],
  });
  assert.equal(executeAll.response.status, 200);
  assert.equal(executeAll.body.evaluations.length, 2);
  assert.deepEqual(executeAll.body.evaluations.map((entry) => entry.decision), [true, false]);

  for (const evaluations of [undefined, []]) {
    const payload = {
      subject: { type: "user", id: "alice" },
      action: { name: "read" },
      resource: { type: "record", id: "record-1" },
      ...(evaluations === undefined ? {} : { evaluations }),
    };
    const backwardsCompatible = await call("POST", "/access/v1/evaluations", payload);
    assert.equal(backwardsCompatible.response.status, 200);
    assert.equal(backwardsCompatible.body.decision, true);
  }
}

async function runSearch() {
  const subjectCore = await call("POST", "/access/v1/search/subject", {
    subject: { type: "user" },
    action: { name: "read" },
    resource: { type: "record", id: "record-1" },
  });
  assert.equal(subjectCore.response.status, 200);
  assert.deepEqual(ids(subjectCore.body.results), ["alice", "bob"]);

  const subjectWithIgnoredId = await call("POST", "/access/v1/search/subject", {
    subject: { type: "user", id: "does-not-filter" },
    action: { name: "read" },
    resource: { type: "record", id: "record-1" },
  });
  assert.deepEqual(ids(subjectWithIgnoredId.body.results), ["alice", "bob"]);

  const subjectProperties = await call("POST", "/access/v1/search/subject", {
    subject: { type: "user" },
    action: { name: "write" },
    resource: { type: "record", id: "record-2", properties: { status: "archived" } },
  });
  assert.ok(ids(subjectProperties.body.results).includes("bob"));

  const resourceCore = await call("POST", "/access/v1/search/resource", {
    subject: { type: "user", id: "alice" },
    action: { name: "read" },
    resource: { type: "record" },
  });
  assert.ok(ids(resourceCore.body.results).includes("record-1"));

  const resourceProperties = await call("POST", "/access/v1/search/resource", {
    subject: { type: "user", id: "bob", properties: { role: "admin" } },
    action: { name: "write" },
    resource: { type: "record" },
  });
  assert.ok(ids(resourceProperties.body.results).includes("record-2"));

  const actionCore = await call("POST", "/access/v1/search/action", {
    subject: { type: "user", id: "alice" },
    resource: { type: "record", id: "record-1" },
  });
  assert.ok(actionNames(actionCore.body.results).includes("read"));
  assert.ok(actionNames(actionCore.body.results).includes("write"));

  const actionProperties = await call("POST", "/access/v1/search/action", {
    subject: { type: "user", id: "bob", properties: { role: "admin" } },
    resource: { type: "record", id: "record-2", properties: { status: "archived" } },
  });
  assert.ok(actionNames(actionProperties.body.results).includes("write"));

  const pageIgnored = await call("POST", "/access/v1/search/subject", {
    subject: { type: "user" },
    action: { name: "read" },
    resource: { type: "record", id: "record-1" },
    page: { limit: 1 },
  });
  assert.deepEqual(ids(pageIgnored.body.results), ["alice", "bob"]);

  const unknownTarget = await call("POST", "/access/v1/search/subject", {
    subject: { type: "spaceship" },
    action: { name: "read" },
    resource: { type: "record", id: "record-1" },
  });
  assert.deepEqual(unknownTarget.body.results, []);

  await expect400(
    "/access/v1/search/subject",
    { subject: { type: "user" }, resource: { type: "record", id: "record-1" } },
    "subject search missing action",
  );
  await expect400(
    "/access/v1/search/resource",
    { subject: { type: "user", id: "alice" }, action: { name: "read" } },
    "resource search missing target",
  );
  await expect400(
    "/access/v1/search/action",
    { subject: { type: "user", id: "alice" } },
    "action search missing resource",
  );
}

await runDiscovery();
await runBasic();
await runBatch();
await runSearch();

console.log(`AUTHZEN-AUTHORIZATION-API-1.0-SCENARIO-PROOF PASS ${baseUrl}`);
