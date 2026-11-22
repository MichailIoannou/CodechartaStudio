---
title: "Analyses and snapshots"
description: "Analyse the current checkout or any commit of a project folder from the CodeCharta desktop app, see how far the map is from the commit you asked for, analyse many commits at once and clean up old analyses."
---

The CodeCharta desktop app can run the analysis itself. Each analysis of a project folder is kept as a **snapshot**:
the map of one commit (or of the files as they are on disk), with when it was made and with which settings. The app
shows the snapshot that fits the commit you look at, and tells you when it only has an older or newer one.

Everything on this page needs the desktop app and a project, created from the project menu in the top bar, whose
folder you work in. The web version opens maps you analysed yourself, see
[Loading maps](/docs/visualization/user-controls/loading-maps).

## Requirements

- [CodeCharta Shell](/docs/analysis/codecharta-shell) (ccsh) 2.2.1 or newer, for example with
  `npm i -g codecharta-analysis`
- Java 22 or newer
- git, to analyse commits

**Settings → Desktop tools** shows which of them the app found and in which version, and lets you pick another
executable. When something is missing, the analysis does not start and says what to install.

## Analysing

The app never analyses on its own. Start an analysis from:

- the **workspace status** next to the project menu in the top bar: **Analyse current checkout**, or **Analyse
  a1b2c3d** when the map shows another commit than the one you asked for;
- the **History**: **Analyse This Commit** in a commit's menu, or **Analyse Working Tree** in the menu of the
  uncommitted changes;
- the **Snapshots** dialog (workspace status → **Snapshots…**): **Analyse current checkout** and **Analyse HEAD commit**.

A commit is analysed in a temporary copy of the repository, so your working folder and its branch stay untouched.
Analysing the current checkout reads the files as they are on disk, including changes you have not committed; such a
snapshot is flagged **uncommitted**.

Analyses run one after the other. The workspace status fills like a progress bar while one runs; open it to see every
queued, running, finished and failed analysis, cancel one, read the log of a failed one or try it again. When the
analysis you asked for is done, the map switches to it.

## When the map shows another commit

When the commit you asked for has no analysis yet, the map shows the closest analysed commit instead, and a notice at
the top right says so, for example "No analysis of the current checkout — showing 9f8e7d6 (Release 2.4.0), stale by 3
commits." **Analyse now** in the notice starts the missing analysis. Dismissing the notice keeps the map; the workspace
status still says **stale by 3**.

The closest analysis may be older (**stale by**), newer (**ahead by**) or on another branch (**diverged**). After a
commit, pull or branch switch in the app, the notice and the workspace status measure again against the new HEAD,
without starting an analysis.

## Snapshots

**Snapshots…** in the workspace status lists every analysis of the project, grouped by folder, with its commit, the
date of the commit and of the analysis, a short form of the analysis settings, its size and flags such as **shown**
(in the map now), **uncommitted** or **imported**. Point at a row for its actions:

- **Open** shows that snapshot in the map.
- **Re-analyse** analyses the same commit again and replaces the snapshot.
- **Show log** shows what ccsh wrote while it analysed.
- **Delete** (the bin) moves the snapshot to the recycle bin after asking. The Delete key does the same for the row
  that has the focus.

The bottom of the dialog says how much space the project's analyses take.

## Analysing several commits

**Analyse several…** in the Snapshots dialog, or **Analyse the Last Commits from Here…** in a commit's menu in the
History, analyses many commits in one go:

- **The last N commits** of a branch, or up to the commit you started from. **Main line only (first parent)** skips the
  commits that came in through merges.
- **Every tag** of the repository.

Before anything starts, the dialog counts how many commits still need an analysis and how many already have one, and
estimates how long it takes from earlier analyses of the folder. A batch holds at most 200 commits. Its analyses show
as one line in the workspace status, with how many are done and **Cancel batch** to stop the rest.

## Cleaning up

**Clean up…** in the Snapshots dialog removes old analyses of the working folder. Choose how many of the newest commit
analyses and working-tree analyses to keep, and whether to keep the analyses of branch tips and tags; the analysis shown
in the map and imported snapshots are always kept. The dialog lists what it would remove and how much space that frees;
**Move to recycle bin** does it. Nothing is ever removed without you asking.

Deleted analyses go to the recycle bin of your operating system. If the recycle bin cannot take them, nothing is
deleted and a message says so.

## From the command line

The analyses of the app also run without it, through the `codecharta-core` executable that comes with the desktop app:

```bash
codecharta-core projects list
codecharta-core analyse --project <project id> --folder <folder id>                    # the working tree
codecharta-core analyse --project <project id> --folder <folder id> --commit <full sha> # one commit
codecharta-core snapshots list --project <project id> --folder <folder id>
```

`projects list --json` prints the ids. The new snapshot shows in the app the next time it lists the folder.

## Limits

- Git submodules and Git LFS files are not set up in the temporary copy of a commit, so their files are missing or
  appear as LFS pointer files in the map of a commit.
- On Windows, very long paths can stop git from creating the temporary copy. The error then suggests
  `git config --global core.longpaths true`.
- svn history is not read for commit analyses.
