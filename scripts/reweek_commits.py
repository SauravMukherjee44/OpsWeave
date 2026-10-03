#!/usr/bin/env python3
"""Preview or rewrite the current main branch's commit dates into this week.

The rewrite preserves commit trees, messages, authors, and chronological order.
It changes both author and committer dates, so every commit receives a new ID.
Existing commit signatures cannot survive a history rewrite.
"""

from __future__ import annotations

import argparse
import os
import re
import subprocess
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo


ZONE = ZoneInfo("Asia/Kolkata")
IDENTITY = re.compile(rb"^(.*) <([^<>]+)> ([0-9]+) ([+-][0-9]{4})$")


def git(*args: str, input_data: bytes | None = None, env: dict[str, str] | None = None) -> bytes:
    return subprocess.run(
        ["git", *args], input=input_data, env=env, check=True, stdout=subprocess.PIPE
    ).stdout


def commit_parts(sha: str) -> tuple[str, list[str], str, str, str, str, bytes]:
    header, message = git("cat-file", "-p", sha).split(b"\n\n", 1)
    lines = header.splitlines()
    tree = next(line[5:].decode("ascii") for line in lines if line.startswith(b"tree "))
    parents = [line[7:].decode("ascii") for line in lines if line.startswith(b"parent ")]
    author = next(line[7:] for line in lines if line.startswith(b"author "))
    committer = next(line[10:] for line in lines if line.startswith(b"committer "))
    author_match, committer_match = IDENTITY.match(author), IDENTITY.match(committer)
    if not author_match or not committer_match:
        raise SystemExit(f"Unsupported author or committer identity in {sha}")
    if any(line.startswith(b"encoding ") for line in lines):
        raise SystemExit(f"Non-UTF-8 commit encoding in {sha}; refusing to rewrite")
    return (
        tree,
        parents,
        author_match.group(1).decode("utf-8"),
        author_match.group(2).decode("utf-8"),
        committer_match.group(1).decode("utf-8"),
        committer_match.group(2).decode("utf-8"),
        message,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="rewrite local main after preview")
    parser.add_argument("--push", action="store_true", help="force-with-lease push rewritten main (requires --apply)")
    args = parser.parse_args()
    if args.push and not args.apply:
        parser.error("--push requires --apply")

    git("rev-parse", "--show-toplevel")
    branch = git("branch", "--show-current").decode().strip()
    if branch != "main":
        raise SystemExit(f"Expected checked-out branch main; found {branch or 'detached HEAD'}")
    if args.apply and git("status", "--porcelain"):
        raise SystemExit("Working tree must be clean before preview or rewrite")

    old_head = git("rev-parse", "refs/heads/main").decode().strip()
    commits = git("rev-list", "--reverse", "refs/heads/main").decode().splitlines()
    if not commits:
        raise SystemExit("No commits found")

    parts = [commit_parts(sha) for sha in commits]
    for index, (_, parents, *_rest) in enumerate(parts):
        expected = [] if index == 0 else [commits[index - 1]]
        if parents != expected:
            raise SystemExit("History is not linear; refusing to rewrite merges")

    now = datetime.now(ZONE)
    monday = (now - timedelta(days=now.weekday())).date()
    start = datetime.combine(monday, time(9), ZONE)
    end = now - timedelta(minutes=1)
    if end < start:
        raise SystemExit("This week has not reached Monday 09:00 IST yet")
    span = (end - start).total_seconds()
    dates = [start + timedelta(seconds=span * index / max(len(commits) - 1, 1)) for index in range(len(commits))]

    print(f"Branch: main ({old_head})")
    print(f"Week: {monday.isoformat()} through {(monday + timedelta(days=6)).isoformat()} IST")
    for sha, date, part in zip(commits, dates, parts):
        subject = part[-1].splitlines()[0].decode("utf-8", "replace")
        print(f"{sha[:10]}  ->  {date.isoformat(timespec='seconds')}  {subject}")
    if not args.apply:
        print("Preview only. Run with --apply to rewrite local main; add --push to update origin/main.")
        return

    backup = f"refs/heads/backup/main-before-date-rewrite-{now:%Y%m%d-%H%M%S}"
    git("update-ref", backup, old_head)
    parent: str | None = None
    for date, (tree, _parents, author_name, author_email, committer_name, committer_email, message) in zip(dates, parts):
        iso_date = date.isoformat(timespec="seconds")
        environment = dict(os.environ)
        environment.update(
            GIT_AUTHOR_NAME=author_name,
            GIT_AUTHOR_EMAIL=author_email,
            GIT_AUTHOR_DATE=iso_date,
            GIT_COMMITTER_NAME=committer_name,
            GIT_COMMITTER_EMAIL=committer_email,
            GIT_COMMITTER_DATE=iso_date,
        )
        command = ["-c", "commit.gpgsign=false", "commit-tree", tree]
        if parent:
            command += ["-p", parent]
        parent = git(*command, input_data=message, env=environment).decode().strip()

    assert parent is not None
    git("update-ref", "refs/heads/main", parent, old_head)
    print(f"Rewrote local main: {old_head[:10]} -> {parent[:10]}")
    print(f"Backup branch: {backup.removeprefix('refs/heads/')}")
    if args.push:
        git("push", f"--force-with-lease=refs/heads/main:{old_head}", "origin", "main")
        print("Updated origin/main with force-with-lease")


if __name__ == "__main__":
    main()
