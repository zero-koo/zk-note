// convex/limits.ts
//
// Read caps for list queries. Convex guidelines require every query to return
// a bounded collection — an unbounded `.collect()` grows with the 소유자's data
// until it trips the transaction read limit, and the failure arrives late, on
// the account with the most data.
//
// These are caps, not pagination: the screens that need to walk past the cap
// (노트 목록, 태스크 목록) will move to `paginationOpts` when they are built,
// and that ticket owns the client change. Until then a cap is the honest
// bound — it keeps the failure mode "you see the newest N" instead of
// "the query throws for heavy users".

/** Newest-N cap for 노트 · 태스크 · 폴더 lists. */
export const LIST_LIMIT = 200;

/** Search returns fewer: past this, relevance beats completeness. */
export const SEARCH_LIMIT = 50;

/** 첨부 belong to a single 노트, so this cap is generous by design. */
export const ATTACHMENT_LIMIT = 100;
