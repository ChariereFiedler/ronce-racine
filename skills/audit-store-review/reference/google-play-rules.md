# Google Play review rules - the audit table

Contents: how to read it · A. Build · B. Permissions and background · C. Data and privacy · D. Content and AI · E. Listing · F. Account and release · G. After release.

**How to read it.** `Last read` is the date a person or agent actually opened the source page, not the date of the rule. A row whose date is old, or which says "from memory", must be re-read before it is called a violation. Pages are on `support.google.com/googleplay/android-developer/` (answer ids below) or `developer.android.com`.

## A. Build

| ID | Rule | How to check | Source | Last read |
|----|------|--------------|--------|-----------|
| A1 | New apps must target a recent API level, set by a yearly deadline | `targetSdkVersion` in the **built** manifest vs the deadline on the page | Play Console Help, target API requirement (page to locate) | not re-read |
| A2 | Native code must ship 64-bit libraries | `unzip -l <aab> \| grep "\.so"`: an `arm64-v8a` entry for each native library | Play Console Help, 64-bit requirement (page to locate) | not re-read |
| A3 | Upload an Android App Bundle, signed, with a `versionCode` higher than any earlier upload | bundle vs the console's last version | Play Console Help, app bundles (page to locate) | not re-read |
| A4 | Debug symbols and mapping files are recommended, not required | console warning only: do not block the release | console message | 2026-11-11 |

## B. Permissions and background

| ID | Rule | How to check | Source | Last read |
|----|------|--------------|--------|-----------|
| B1 | Every permission declared must be used by the code; sensitive ones need a justification | built manifest vs `grep` of the code that uses each | developer.android.com | from memory |
| B2 | Runtime permissions are requested in context, and the app keeps working, or says why not, when one is denied | the code path after `requestPermissions` returns denied | developer.android.com | from memory |
| B3 | Each foreground-service type is declared in the manifest **and** in the console form (description, user impact if interrupted, one demo video per type) | `foregroundServiceType` in the built manifest; the form | answer/13392821 | 2026-11-11 |
| B4 | The type passed to `startForeground` matches the declared type | `grep -rn "startForeground" <src>` | developer.android.com | from memory |
| B5 | Targeting Android 15+, a `dataSync` or `mediaProcessing` service is limited to 6 h per 24 h; the service must stop itself in `onTimeout(int, int)` or the system raises a fatal exception | `grep -rn "onTimeout" <src>` and what it does | developer.android.com/develop/background-work/services/fgs/timeout | 2026-11-11 (search summary) |
| B6 | Foreground use must follow the Device and Network Abuse policy | read the service: does it do anything beyond the declared task | answer/13392821 | 2026-11-11 |

## C. Data and privacy

| ID | Rule | How to check | Source | Last read |
|----|------|--------------|--------|-----------|
| C1 | The data safety form is mandatory and must match what the app does; the store may act on a discrepancy | list every network call and every stored credential; match each to a form line | answer/10787469 | 2026-11-11 |
| C2 | "Collect" means sending data **off the device**. Data processed only locally and never sent is not disclosed. "Share" means a transfer to a third party; a transfer the user starts and expects is treated as such, not as a service provider's processing | per data type: does it leave the device, to whom, on whose initiative | answer/10787469 | 2026-11-11 |
| C3 | Credentials the app sends to a server (a token, a password) are data the form must account for | where is the secret stored, where is it sent | answer/10787469 | from memory |
| C4 | A privacy policy URL is required, publicly reachable, naming the developer and the app, listing the data handled, and saying how to get it deleted | fetch the live URL and compare with C1 | answer/10787469 | 2026-11-11 (existence only) |
| C5 | Apps with accounts need an in-app and a web way to delete the account | only if the app has accounts | Play Console Help, account deletion (page to locate) | not re-read |
| C6 | Biometric or voice data kept on the device must still be said in the policy; the form follows C2 | the policy text vs the code that writes the data | answer/10787469 | 2026-11-11 |

## D. Content and AI

| ID | Rule | How to check | Source | Last read |
|----|------|--------------|--------|-----------|
| D1 | An app that generates content with a generative model must give users an in-app way to report or flag offensive output to the developer without leaving the app | search the UI for a report action; a link that opens a mail client leaves the app | answer/13985936 | 2026-11-11 |
| D2 | D1 has no stated exemption for summarization or productivity apps on the official page; a secondary article claims one | treat as TO VERIFY with the store, not as OK | answer/13985936 | 2026-11-11 |
| D3 | Target audience must match the content; an audience under 13 triggers the Families policy | the audience answers in the console | Play Console Help, Families policy (page to locate) | not re-read |
| D4 | The content rating questionnaire answers must be truthful | the console answers sheet vs the app | Play Console Help, content ratings (page to locate) | not re-read |

## E. Listing

| ID | Rule | How to check | Source | Last read |
|----|------|--------------|--------|-----------|
| E1 | Title 30 characters, short description 80, full description 4000, release notes 500 | `wc -m` on each file | Play Console Help, store listing limits (page to locate) | not re-read |
| E2 | No emoji, repeated punctuation or all-caps in the title; no ranking or promotion claims ("best", "#1", "free", "new") | `grep -n -i` over the title and short texts | Play Console Help, metadata policy (page to locate) | from memory |
| E3 | Claims must be true of the app: "no cloud", "no account", "offline" must match the code | search the code for each network call against each claim | Play Console Help, metadata policy (page to locate) | from memory |
| E4 | Screenshots and video show the app as it is; the feature graphic and icon carry no misleading text | look at the files | Play Console Help, graphic assets (page to locate) | not re-read |

## F. Account and release

| ID | Rule | How to check | Source | Last read |
|----|------|--------------|--------|-----------|
| F1 | A personal developer account created after November 2023 must run a closed test with at least 12 testers for 14 days before production; organisation accounts do not | the account type and creation date in the console | Play Console Help, testing requirements for new personal accounts (page to locate) | from memory |
| F2 | Declarations of ads, app access, news, health, finance and government status are all required | the "App content" page of the console | console | not re-read |

## G. After release

| ID | Rule | How to check | Source | Last read |
|----|------|--------------|--------|-----------|
| G1 | Crash and ANR rates above the store's thresholds reduce visibility | the console's quality page, a few days after release | developer.android.com | from memory |

## Findings this table was written from

Recorded so that the next run knows what a real audit found, and so the rules above are not read as theory.

- A foreground service declared in the manifest and passed at runtime with the same type, with an `onTimeout` that stops it: B3, B4, B5 satisfied. The note "does not have any types" seen in a log did not match the code; reading the code settled it.
- A one-time notification permission request recorded in a marker file: once refused, the app never asks again, and the service notification stays hidden (B2). A product point, not a rejection.
- A local summarization model whose output is shown in the app: D1 and D2 open. No report action exists in the app.
- A token sent to a user-chosen git server: C3, to be matched by a data safety line or an explicit reasoning that the transfer is user-initiated.
