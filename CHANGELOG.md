# Changelog

## [1.10.3](https://github.com/huishouden/health/compare/v1.10.2...v1.10.3) (2026-10-05)

### Bug Fixes

* Rebuild against the re-tagged kit ([6b25d9b](https://github.com/huishouden/health/commit/6b25d9bac850a3a954150fd411d8da37927fca5b))

## [1.10.2](https://github.com/huishouden/health/compare/v1.10.1...v1.10.2) (2026-10-05)

### Changes

* Agenda, to-do and reminder syncs on open skip the database read when this device published the same items in the last 6 hours; a change, a single record's edit or 6 hours passing syncs as before (pwa-kit 0.103.0)

## [1.10.1](https://github.com/huishouden/health/compare/v1.10.0...v1.10.1) (2026-10-05)

### Bug Fixes

* a change saved just before the app closed and written again when it next opens never puts back an older value; another member's newer change is kept (pwa-kit 0.102.0)

## 1.10.0 (2026-10-05)

### Features

* **visits:** each person's appointments in a new Visits tab (Today, Medicines, Visits, History; People under More). It covers kind, day and time, the doctor or clinic and how far it is from home, the place or a video link, what to do or bring (with the medicine list one tap away), reminders at chosen lead times (default the day before and 2 hours before) to the carers, notes for admins and member carers only, and Attended or Missed with Undo. A visit can want a follow-up: Book opens the next one filled in, Not needed drops it, and the portal shows "Book a follow-up for <person>" until one or the other. What a visit publishes says only "Appointment for <person>"; the detail goes only to a reader's own calendar with Health details on, never the notes, and never a private doctor where a helper carer reads it. New calendar events that name someone are suggested, and Import from calendar asks whose each other one is. The assistant's earlier appointments become visits. Today shows each person's next visit within a week (pwa-kit 0.101.0).

## [1.9.0](https://github.com/huishouden/health/compare/v1.8.0...v1.9.0) (2026-10-05)

### Features

* hashed assets from the suite's asset CDN (pwa-kit 0.100.0) ([120774f](https://github.com/huishouden/health/commit/120774f797e109613281985c51dd882aa8689181))

## [1.8.0](https://github.com/huishouden/health/compare/v1.7.1...v1.8.0) (2026-10-05)

### Features

* **scan:** Scan the label takes a photo, a chosen photo, paste, drop and several; Share to Health (kit 0.99.0) ([962e0c0](https://github.com/huishouden/health/commit/962e0c00551c56ad4dc0d4a8852eabbf33906c3b))

### Bug Fixes

* **scan:** a viewer who may not add medicines is told so when a photo is shared ([4d7c8b4](https://github.com/huishouden/health/commit/4d7c8b4323a189ed92efbbf26feaad81aeb53c40))

## [1.7.1](https://github.com/huishouden/health/compare/v1.7.0...v1.7.1) (2026-10-05)

### Other

* Maintenance

## [1.7.0](https://github.com/huishouden/health/compare/v1.6.2...v1.7.0) (2026-10-05)

### Features

* **reminders:** dose and refill reminders name the doses or the medicine, and stop unsent once the dose is marked given or skipped (on any carer's phone or the portal's To-do list) or the refill ordered (kit 0.98.2) ([6382317](https://github.com/huishouden/health/commit/638231789523575454e7ed1057f37b6c0aa949c9))

### Other

* role coverage and wording for reminder sources ([c27a3b4](https://github.com/huishouden/health/commit/c27a3b40544cd70dce3ac0553a7f58c3d58dcae3))
* docs, review: reminders that stop once done elsewhere ([9c943d3](https://github.com/huishouden/health/commit/9c943d31544d7e527d0ce48230e6bb389a4c58ff))

## [1.6.2](https://github.com/huishouden/health/compare/v1.6.1...v1.6.2) (2026-10-05)

### Tests

* signed-in tests on a household of the run's own instead of fixed test users; the roles test runs on the emulators (`bun run e2e:emulator`) ([#17](https://github.com/huishouden/health/issues/17))

## [1.6.1](https://github.com/huishouden/health/compare/v1.6.0...v1.6.1) (2026-10-05)

### Other

* Maintenance

## [1.6.0](https://github.com/huishouden/health/compare/v1.5.1...v1.6.0) (2026-10-05)


### Features

* **contacts:** contacts saved before positions get one in the background (kit 0.88.0) ([#28](https://github.com/huishouden/health/issues/28)) ([538e109](https://github.com/huishouden/health/commit/538e1098279772ab63a364c77790dafeb22204de))


### Bug Fixes

* **todos:** the portal's to-do button says what it does, "Mark done" not "Done" ([#30](https://github.com/huishouden/health/issues/30)) ([638c312](https://github.com/huishouden/health/commit/638c312159078e2ccb0a60bc011e39e861e38cdb))

## [1.5.1](https://github.com/huishouden/health/compare/v1.5.0...v1.5.1) (2026-10-05)


### Bug Fixes

* **today:** a given dose looks done, an open one says Give (kit 0.86.0) ([#24](https://github.com/huishouden/health/issues/24)) ([67f7323](https://github.com/huishouden/health/commit/67f7323bd80e6b11728b14769fd90c0b3cd809ff))

## [1.5.0](https://github.com/huishouden/health/compare/v1.4.1...v1.5.0) (2026-10-04)


### Features

* **contacts:** the pharmacy's distance from home beside each medicine; kit 0.84.0 ([#22](https://github.com/huishouden/health/issues/22)) ([118f114](https://github.com/huishouden/health/commit/118f11404fff7ac1df367841122199365d69ade8))

## [1.4.1](https://github.com/huishouden/health/compare/v1.4.0...v1.4.1) (2026-10-04)


### Bug Fixes

* kit v0.74.0 to 0.82.1, contacts' pay details for admins and members only ([#20](https://github.com/huishouden/health/issues/20)) ([af70133](https://github.com/huishouden/health/commit/af7013365094c0a7422299c031f2b415443d0d38))

## [1.4.0](https://github.com/huishouden/health/compare/v1.3.0...v1.4.0) (2026-10-04)


### Features

* medicine names for the reader's own calendar only (calendarDetail, kit v0.71.0) ([#15](https://github.com/huishouden/health/issues/15)) ([681bc5b](https://github.com/huishouden/health/commit/681bc5b52dec259c0d184c0e2be74cee285e7828))

## [1.3.0](https://github.com/huishouden/health/compare/v1.2.0...v1.3.0) (2026-10-04)


### Features

* a medicine's dose times in your own calendar (kit v0.67.0) ([#11](https://github.com/huishouden/health/issues/11)) ([541ecf1](https://github.com/huishouden/health/commit/541ecf110c96478a87053b77f7ecd438b0a2b19f))


### Bug Fixes

* **dark:** initial avatars keep an edge in dark; kit 0.70.0 ([#14](https://github.com/huishouden/health/issues/14)) ([a2cfa61](https://github.com/huishouden/health/commit/a2cfa611b7489c452687eefce50395ca1bc4520c))

## [1.2.0](https://github.com/huishouden/health/compare/v1.1.0...v1.2.0) (2026-10-04)


### Features

* Health in Spanish and Dutch ([#9](https://github.com/huishouden/health/issues/9)) ([36a510f](https://github.com/huishouden/health/commit/36a510f6c835e1d98078708a8fbf635e98c75867))

## [1.1.0](https://github.com/huishouden/health/compare/v1.0.1...v1.1.0) (2026-10-03)


### Features

* dark mode that follows the suite's theme ([#6](https://github.com/huishouden/health/issues/6)) ([ae38ed0](https://github.com/huishouden/health/commit/ae38ed04fe69acc85f8ae9767644e6811cf9a3a8))

## [1.0.1](https://github.com/huishouden/health/compare/v1.0.0...v1.0.1) (2026-10-03)


### Bug Fixes

* the list for the doctor prints and saves as PDF, and fits a phone ([#4](https://github.com/huishouden/health/issues/4)) ([2cb8edf](https://github.com/huishouden/health/commit/2cb8edfc1700e43fb6f983498cbaa3b75e28a2c4))

## 1.0.0 (2026-10-03)


### Features

* Huishouden Health, medicines and care for everyone at home, on /health/ ([#2](https://github.com/huishouden/health/issues/2)) ([6e09eb6](https://github.com/huishouden/health/commit/6e09eb66abca043af12559adb945d38f8dff9381))
