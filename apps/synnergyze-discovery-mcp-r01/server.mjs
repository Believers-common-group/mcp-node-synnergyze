/**
 * Synnergyze R0.1 public discovery MCP candidate.
 *
 * This is a separate, read-only, stdio-only MCP service. It does not import,
 * expose, or serve the synthetic R0.4/R0.5 workroom or its local JSON state.
 * No networking, repository mutation, login, Warden grant, or ledger access.
 * Registry publication is NOT authorized by this file.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const REPO = 'https://github.com/Believers-common-group/mcp-node-synnergyze';
const PR = REPO + '/pull/153';
const DISCUSSION = 'https://github.com/github/github-mcp-server/discussions/1257';
const HANDOFF = REPO + '/blob/sandbox/synnergyze-collaboration-r04/docs/mcp-registry/SYNNERGYZE-SANDBOX-CONNECTION-R0.1.md';

const catalog = Object.freeze({
  product: 'Synnergyze',
  description: 'Universal member-to-member workflow and office coordination; experimental sandbox.',
  sourceRepository: REPO,
  existingSandboxBranch: 'sandbox/synnergyze-collaboration-r04',
  existingDraftPullRequest: PR,
  r04Path: 'sandbox/synnergyze-collaboration-r04/',
  r05Path: 'apps/synnergyze-workspace-r05/',
  registryHandoff: HANDOFF,
  admissionDiscussion: DISCUSSION,
  stage: 'SYNTHETIC_LOCAL_ONLY',
  registered: false,
  operationalService: false,
  publicRemoteEndpoint: null,
  publicCapability: 'metadata-discovery-only'
});

const gates = Object.freeze({
  status: 'HOLD',
  source: PR,
  required: [
    'Independent approval of MCP tool contract, issuer and intended namespace',
    'Real package distribution or secure remote MCP endpoint',
    'MCP protocol test and security review',
    'DigitalMe and BNR member identity and Warden policy for any private capability',
    'RiverOS evidence and monitoring for any operational effect',
    'Valid real-world registry manifest and authorized publication',
    'Official registry verification before GitHub catalogue review'
  ],
  forbiddenInThisCandidate: [
    'Read or write local R0.5 state',
    'Privileged GitHub repository access',
    'ERP, Tally, payment or treasury operations',
    'Warden grant issuance or bypass',
    'Private member, identity, credential or evidence disclosure'
  ]
});

function textResult(data) {
  return { content: [{ type: 'text', text: JSON.stringify(data) }] };
}

const server = new McpServer(
  { name: 'synnergyze-discovery-candidate', version: '0.1.0' },
  { capabilities: { tools: {} } }
);

server.tool(
  'synnergyze_public_overview',
  'Read public, synthetic-only sandbox metadata and linked review sources. No privileged operations.',
  {},
  async () => textResult(catalog)
);

server.tool(
  'synnergyze_registry_admission_gates',
  'Read the requirements for future MCP registry submission and safe operational promotion.',
  {},
  async () => textResult(gates)
);

await server.connect(new StdioServerTransport());
