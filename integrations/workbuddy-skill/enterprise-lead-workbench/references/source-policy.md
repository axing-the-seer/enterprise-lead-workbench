# Source and evidence policy

## Raw first

Persist each provider response as an immutable source snapshot before normalization. Normalized facts point back to the snapshot and record the provider, retrieval time, mapping version, and availability state.

## Identity

Use a valid unified social credit code as the primary cross-provider identifier. When it is missing, create a match candidate from normalized company name and location; do not merge automatically when the match is ambiguous.

## Conflicts

Keep competing facts when providers disagree. A preferred display value may be selected by an explicit source-priority policy, but the alternatives and selection reason remain visible.

## Missing and unavailable data

Distinguish at least:

- not returned;
- not found;
- connection or entitlement unavailable;
- provider error;
- intentionally not queried.

None of these states means that a risk or attribute does not exist.

## Web evidence

Record the URL, page title, publication or observation time, retrieval time, quoted or summarized claim, and related company identifier. Web evidence supplements official data and cannot silently replace it.
