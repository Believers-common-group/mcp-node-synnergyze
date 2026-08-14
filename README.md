# Synnergyze Genesis MCP

This repository is the governed Synnergyze runtime/integration surface for the current Alpha reference environment.

## Canonical architecture source

Cross-network architecture decisions belong in `Believers-common-group/SynergyzeGovernance`, branch `HQ`. This repository implements and tests bounded runtime contracts; repository presence does not confer Registry, Warden, RiverOS, SILK, or other network authority.

## Network module contracts

The current contract-only boundary slice is declared in `.vsr/module-bindings.yaml` and implemented as TypeScript contracts under:

- `modules/warden/contracts.ts`
- `modules/qel/contracts.ts`
- `modules/river/contracts.ts`
- `modules/bnr/contracts.ts`
- `modules/silk-dam/contracts.ts`
- `modules/silk/contracts.ts`

The cross-boundary type/contract tests live in `modules/contracts.test.ts`.

Permanent separation:

```text
NETWORK OBJECT != REPOSITORY != MODULE != SERVICE != DEPLOYMENT != AUTHORITY
```

The contract slice does not move or replace the existing RC1 or Agent Fabric implementation. Those fixtures remain implementation lineage until equivalent extracted module tests exist.

## Verification

```bash
npm run test:contracts
npm run type-check
npm run lint
npm run test
```

## Activation boundary

Implementation presence is not activation. Warden production activation, BNR node promotion, RiverOS production evidence service promotion, and SILK/SILK-Dam financial/economic activation remain separately gated by canonical governance and release evidence.
