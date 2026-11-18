#!/usr/bin/env bash
# Captures the outputs of the M1 and M2 git read commands for the core's parser tests (git 2.56, Linux).
# Usage: bash capture.sh <output folder> <scratch folder, deleted and created anew>
set -euo pipefail
OUT="$1"
WORK="$2"
rm -rf "$WORK"
mkdir -p "$OUT" "$WORK/home"
: > "$WORK/home/empty.gitconfig"
export HOME="$WORK/home" XDG_CONFIG_HOME="$WORK/home" GIT_CONFIG_GLOBAL="$WORK/home/empty.gitconfig" GIT_CONFIG_SYSTEM="$WORK/home/empty.gitconfig" GIT_CONFIG_NOSYSTEM=1
export GIT_AUTHOR_NAME="Ada Author" GIT_AUTHOR_EMAIL=ada@example.test GIT_COMMITTER_NAME="Carl Committer" GIT_COMMITTER_EMAIL=carl@example.test
export GIT_CONFIG_COUNT=3 GIT_CONFIG_KEY_0=init.defaultBranch GIT_CONFIG_VALUE_0=main GIT_CONFIG_KEY_1=commit.gpgsign GIT_CONFIG_VALUE_1=false GIT_CONFIG_KEY_2=core.autocrlf GIT_CONFIG_VALUE_2=false
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE
export GIT_CEILING_DIRECTORIES="$WORK"
export LC_ALL=C LANG=C GIT_OPTIONAL_LOCKS=0
N=0
tick() { export GIT_AUTHOR_DATE="@$((1700000000 + 60 * N)) +0000" GIT_COMMITTER_DATE="@$((1700000000 + 60 * N)) +0000"; N=$((N + 1)); }
commit() { local dir="$1" msg="$2"; shift 2; while [ $# -gt 0 ]; do mkdir -p "$(dirname "$dir/$1")"; printf '%s' "$2" > "$dir/$1"; git -C "$dir" add -- "$1"; shift 2; done; tick; git -C "$dir" commit -q --allow-empty -m "$msg"; }
G=(git --no-pager --literal-pathspecs -c core.quotepath=off -c color.ui=false -c log.showSignature=false -c i18n.logOutputEncoding=UTF-8 --no-optional-locks -c core.fsmonitor=false)
REVPARSE=(rev-parse --path-format=absolute --is-bare-repository --is-shallow-repository --git-dir --git-common-dir --show-prefix --show-toplevel)
STATUS=(status --porcelain=v2 --branch -z --untracked-files=normal --ignore-submodules=dirty)
REFS=(for-each-ref '--format=%(refname)%00%(objectname)%00%(objecttype)%00%(*objectname)%00%(*objecttype)%00%(HEAD)%00%(symref)%00%(upstream)%00%(upstream:track,nobracket)%00%(worktreepath)%00%(creatordate:unix)%00%(contents:subject)' refs/heads refs/remotes refs/tags)
LOG=(log -z --no-decorate --date-order '--format=tformat:%H%x00%P%x00%aN%x00%aE%x00%at%x00%ct%x00%s')
cd "$WORK"

# upstream with history, a clone that is ahead 1 and behind 2
git init -q --bare origin.git
git init -q up; commit up "Add a" a.txt a b.txt b d.txt d; git -C up remote add origin "$WORK/origin.git"; git -C up push -q -u origin main
git clone -q origin.git work
commit up "Remote one" r1.txt 1; commit up "Remote two" r2.txt 2; git -C up push -q
commit work "Local one" l1.txt 1; git -C work fetch -q
printf 'staged' > work/a.txt; git -C work add a.txt
printf 'unstaged' > work/b.txt
git -C work mv d.txt e.txt
printf 'both' > work/l1.txt; git -C work add l1.txt; printf 'both again' > work/l1.txt
printf 'new' > work/untracked.txt
"${G[@]}" -C work "${STATUS[@]}" > "$OUT/status_ahead_behind.txt"

# detached head
git clone -q origin.git detached; git -C detached checkout -q --detach HEAD
"${G[@]}" -C detached "${STATUS[@]}" > "$OUT/status_detached.txt"

# no commits
git init -q empty
printf 'x' > empty/x.txt
"${G[@]}" -C empty "${STATUS[@]}" > "$OUT/status_initial.txt"

# gone upstream
git clone -q origin.git gone; git -C gone switch -q -c topic; git -C gone push -q -u origin topic
git --git-dir origin.git branch -D topic > /dev/null
git -C gone fetch -q --prune
"${G[@]}" -C gone "${STATUS[@]}" > "$OUT/status_gone_upstream.txt"

# merge conflict with all four kinds
git init -q conflict
commit conflict "Base" a.txt base b.txt b
git -C conflict switch -q -c other; commit conflict "Other" a.txt other c.txt c
git -C conflict switch -q main; commit conflict "Main" a.txt main
tick; git -C conflict merge -q other > /dev/null 2>&1 || true
printf 'changed' > conflict/b.txt
printf 'new' > conflict/u.txt
"${G[@]}" -C conflict "${STATUS[@]}" > "$OUT/status_conflict.txt"

# refs: current branch with upstream ahead/behind, gone upstream, plain branch, remote HEAD, remote with slash, tags, worktree
git clone -q origin.git refs
git -C refs reset -q --hard HEAD~1
commit refs "Local refs one" x1.txt 1; commit refs "Local refs two" x2.txt 2
git -C refs remote set-head origin main
git -C gone push -q origin HEAD:refs/heads/topic2
git -C refs fetch -q
git -C refs branch -q --track feature origin/topic2
git --git-dir origin.git branch -D topic2 > /dev/null; git -C refs fetch -q --prune
git -C refs branch -q plain
git init -q --bare fork.git; git -C refs remote add team/fork "$WORK/fork.git"; git -C refs push -q team/fork main:shared
git -C refs fetch -q team/fork
git -C refs tag light
tick; git -C refs tag -a -m "Release two" v2
git -C refs worktree add -q ../linked plain
"${G[@]}" -C refs "${REFS[@]}" > "$OUT/for_each_ref.txt"
git -C refs remote add mirror "https://ada:s3cret@example.test/ada/repo.git"
git -C refs remote add scp "git@example.test:ada/repo.git"
"${G[@]}" -C refs config -z --get-regexp '^remote\..*\.url$' > "$OUT/remote_urls.txt"
set +e
"${G[@]}" -C empty config -z --get-regexp '^remote\..*\.url$' > "$OUT/remote_urls_none.txt"; echo "exit $?" > "$OUT/remote_urls_none.exit"
set -e

# repository facts
"${G[@]}" -C refs "${REVPARSE[@]}" > "$OUT/rev_parse_root.txt"
git clone -q --depth 1 "file://$WORK/origin.git" shallow
git -C shallow worktree add -q ../shallow-linked -b side
mkdir -p shallow-linked/src
"${G[@]}" -C shallow-linked/src "${REVPARSE[@]}" > "$OUT/rev_parse_shallow_linked_subfolder.txt"
set +e
"${G[@]}" -C origin.git "${REVPARSE[@]}" > "$OUT/rev_parse_bare.txt" 2> "$OUT/rev_parse_bare.stderr"; echo "exit $?" > "$OUT/rev_parse_bare.exit"
mkdir plain
"${G[@]}" -C plain "${REVPARSE[@]}" > "$OUT/rev_parse_plain.txt" 2> "$OUT/rev_parse_plain.stderr"; echo "exit $?" > "$OUT/rev_parse_plain.exit"
set -e

# log: root commit, quotes, tab, non-ASCII, a control character, a merge
git init -q history
commit history "Root" a.txt a
git -C history switch -q -c side; commit history "$(printf 'Quote "it"\tand tab \xe2\x80\x93 \xc3\xbc \xe6\x97\xa5\xe6\x9c\xac')" s.txt s
git -C history switch -q main; commit history "$(printf 'Bell\a here')" b.txt b
tick; git -C history merge -q --no-ff -m "Merge side" side
git -C history rev-parse HEAD | "${G[@]}" -C history "${LOG[@]}" --stdin > "$OUT/log_history.txt"

# commit details: added, modified, deleted, renamed (non-ASCII name with a space), binary; root commit
SHOW=(show -s -z '--format=tformat:%H%x00%P%x00%aN%x00%aE%x00%at%x00%ct%x00%s%x00%cN%x00%cE%x00%B' --end-of-options)
DIFF=(diff-tree -r -z --no-ext-diff --no-textconv -M)
git init -q changes
commit changes "Base" a.txt "$(printf 'a\nb\nc\n')" b.txt "gone" c.txt "$(seq 1 50)" d.bin "$(printf 'x\001y')"
printf 'a\nB\nc\nd\n' > changes/a.txt
git -C changes rm -q b.txt
git -C changes mv c.txt "c renamed ü.txt"
printf 'x\000y\003' > changes/d.bin
git -C changes add a.txt d.bin
commit changes "$(printf 'Change files\n\nWith a body line.\n')" e.txt "$(printf 'new\nfile\n')"
"${G[@]}" -C changes "${SHOW[@]}" HEAD > "$OUT/show_details.txt"
"${G[@]}" -C changes "${DIFF[@]}" --name-status HEAD~1 HEAD > "$OUT/diff_tree_name_status.txt"
"${G[@]}" -C changes "${DIFF[@]}" --numstat HEAD~1 HEAD > "$OUT/diff_tree_numstat.txt"
"${G[@]}" -C changes "${DIFF[@]}" --root --no-commit-id --name-status HEAD~1 > "$OUT/diff_tree_root_name_status.txt"

for file in "$OUT"/*; do sed -i "s#$WORK#/fixture#g" "$file"; done
