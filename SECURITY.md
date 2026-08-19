# Security Policy

## Reporting a vulnerability

Please report vulnerabilities privately via
[GitHub private vulnerability reporting](../../security/advisories/new).
Do not open a public issue for security problems.

You can expect an acknowledgment within a week. Once fixed, the advisory is
published and the fix lands in a `security`-typed commit with a `### Security`
entry in the CHANGELOG.

## Scope notes

OpenBurn's server controls a laser — a machine that burns things. Reports about
the server accepting unauthenticated commands from the network, command
injection into the G-code stream, or anything that could make a machine move
unexpectedly are all in scope and treated as high priority.
