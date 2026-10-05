# Manual test — Copy link / Copy message (`src/clipboard.ts`)

`copyText(text)` returns `true` only when the text actually reached the clipboard:
web → `navigator.clipboard.writeText`, falling back to a hidden `<textarea>` + `document.execCommand("copy")`
(element always removed); native → `expo-clipboard`.

## A. Web, normal tab (secure context)
1. Register a ticket on `/`, land on `/ticket/NW-XXXX` (you are the owner, share sheet visible).
2. Tap **Copy link** → toast "Link copied". Paste somewhere → the `?ref=NW-XXXX` link.
3. Pick the **Funny** tone, tap **Copy message** → toast "Message copied". Paste → full funny message incl. link.
4. Open `/rep/ANANYA-AMR`, tap **Copy my link** → toast "Link copied". Paste → `?rep=ANANYA-AMR&utm_source=whatsapp` link.

## B. Web, inside the preview iframe / non-secure context (Clipboard API blocked)
1. Repeat A.2–A.4 inside the embedded preview. Expected: still "Link copied" / "Message copied" via the
   `execCommand` fallback, and the pasted text matches.
2. DevTools: `document.querySelectorAll("textarea").length` must be unchanged after each copy (helper cleaned up).

## C. Forced failure (both paths blocked)
1. In DevTools console run:
   `navigator.clipboard.writeText = () => Promise.reject(new Error("blocked")); document.execCommand = () => false;`
2. Tap **Copy link** → red toast exactly: `Couldn't copy. Press and hold the link below to copy it`.
   The toast must never show the raw URL.
3. The link text under the buttons (`ref-link` / `rep-link`) and the message preview are selectable:
   press-and-hold (or drag-select on desktop) highlights them.

## D. Native (Expo Go)
1. Open the ticket page in Expo Go, tap **Copy link** → "Link copied"; paste in Notes → link present.
2. Tap **Copy message** → "Message copied"; paste → full message.
3. `/rep/ANANYA-AMR` → **Copy my link** → "Link copied".
