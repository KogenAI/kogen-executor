# Strip inherited Claude route and model selectors

Slug: claudecode-child-env-route-selectors
Model: not applicable — deterministic environment filtering has no meaningful state
Acceptance:
- .kogen/intents/claudecode-child-env-route-selectors/acceptance.feature
- features/steps/route_selectors.js

Extend executor/claudecode/args.go stripEnv with every selector in acceptance, grouped under comments for model selectors, request shaping, and per-cloud routes/auth bypass. Preserve existing stripping and setEnv behavior. Kogen flags and its runtime configuration directory, not parent selectors, determine model and route, including when no --model is passed. Do not strip HTTPS_PROXY, NO_PROXY, AWS_REGION or PATH. No provider calls or dependency changes are needed.

Update configuration documentation and the executor contract environment list to name every added variable and explain retained proxy/region variables. This checkout has no docs directory: add docs/configuration.md and docs/executor-contract.md with this focused environment policy, and link them from README.md's Claude Code configuration section; do not invent a broader executor specification.

## Decisions
- Strip model, request-shaping and cloud companion selectors while retaining proxy and region settings. (source: request)
- Preserve exactly one runtime CLAUDE_CONFIG_DIR, supplied HOME and each setEnv entry. (source: request)

## Source comparison
- addressed: request Problem and Need's complete selector families map to the acceptance JSON names and stripEnv extension above; existing credential, route and nested-session exclusions remain unchanged.
- addressed: Need's grouped comments and configuration/executor-contract documentation map to the implementation and documentation requirements above; missing documentation paths are created rather than assuming external files exist.
- addressed: Synthetic acceptance's base containing all added names, HTTPS_PROXY, NO_PROXY, AWS_REGION, PATH, config, HOME and setEnv overrides maps to the direct childEnv capture and exact singleton assertions; parent ANTHROPIC_MODEL=x and ANTHROPIC_CUSTOM_HEADERS=h map to the real fake-Claude round with an empty task Model.
- omitted: no requested behavior; no external Claude capability claim is needed to verify this local filtering contract.

## Tests
- Remove all added names while preserving passthrough values and singleton overrides: add focused childEnv regression coverage with the acceptance inputs (unit)
- Prevent inherited ANTHROPIC_MODEL=x and ANTHROPIC_CUSTOM_HEADERS=h reaching a real round with no model flag: add fake-Claude round regression coverage (integration)
- Name all added variables in configuration and executor-contract docs and group stripEnv additions by family: review documentation and comments against acceptance names (existing)

## Feasibility
- evidence: {"id":"env-observer","kind":"observer","inputs":["features/steps/route_selectors.js"],"observers":["features/steps/route_selectors.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/route_selectors.js good","exit":0,"output":"accepted\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/route_selectors.js bad","exit":1,"output":"rejected\n"}]}
