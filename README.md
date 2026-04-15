# GitHub AI Agent Action

A comment-driven GitHub repository AI agent.

This Action responds to `/ai ...` comments on issues and pull requests. It supports:

- `/ai [message]`
- `/ai diagnose-ci`
- `/ai review`
- `/ai explain`
- `/ai plan`
- `/ai approve`

The MVP is read-first. It can answer questions, review PRs, explain diffs, and draft plans. When write actions are enabled, it can execute a narrow set of approved non-code operations after an authorized `/ai approve` comment:

- rerun a workflow
- add labels
- remove labels
- request reviewers
- close an issue or pull request
- reopen an issue or pull request

It does not edit code, commit, push, or open pull requests.

For non-approval commands, the model can use bounded read-only tools to fetch additional issue comments, PR review comments, workflow runs, workflow log excerpts, and PR file summaries when the initial context is not enough. `/ai approve` does not use tools and remains approval-gated.

## Example Workflow

```yaml
name: GitHub AI Agent

on:
  issue_comment:
    types: [created]
  pull_request_review_comment:
    types: [created]

permissions:
  contents: read
  issues: write
  pull-requests: write
  actions: read

jobs:
  ai:
    if: startsWith(github.event.comment.body, '/ai')
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: your-org/github-ai-agent-action@v1
        with:
          openai-api-key: ${{ secrets.OPENAI_API_KEY }}
          openai-base-url: ${{ secrets.OPENAI_BASE_URL }}
          github-token: ${{ github.token }}
```

## Enable Approved Operations

```yaml
permissions:
  contents: read
  issues: write
  pull-requests: write
  actions: write

jobs:
  ai:
    if: startsWith(github.event.comment.body, '/ai')
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: your-org/github-ai-agent-action@v1
        with:
          openai-api-key: ${{ secrets.OPENAI_API_KEY }}
          openai-base-url: ${{ secrets.OPENAI_BASE_URL }}
          github-token: ${{ github.token }}
          enable-write-actions: "true"
          allowed-operations: "rerun-workflow,add-labels,remove-labels,request-reviewers,close-item,reopen-item"
```

## Publishing

This repository commits the generated `dist/` bundle so the Action can be consumed directly from a tag. Before publishing, run `npm run check`, commit the refreshed `dist/`, and create a version tag.

Consumers should reference a tag, for example:

```yaml
- uses: your-org/github-ai-agent-action@v1
```

## Notes

- Comments, diffs, workflow logs, README, and `AGENTS.md` are treated as untrusted context.
- Unauthorized users get a visible reply instead of a silent no-op.
- Pending approved operations are stored in signed hidden comment markers.
- Fork pull requests are not allowed to execute approved operations in the MVP.
