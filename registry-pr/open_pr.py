"""Open the vercel/ai tools-registry PR for ai-sdk-tool-cyberwarex, all through the GitHub API (no clone of the big repo).

python3 open_pr.py --dry-run   # read-only: checks npm + docs, builds the new registry.ts, prints the diff size
python3 open_pr.py             # fork, branch, commit, open the PR

Needs a CLASSIC token with public_repo for cyberwareX in ~/.secrets/github-classic-pr.env (GITHUB_CLASSIC_TOKEN=...).
Our fine-grained token cannot open PRs on other owners' repos (403, checked 2026-11-09).
Refuses to run before the package is on npm: the registry's first prerequisite."""
import base64, json, os, re, subprocess, sys, time, urllib.request

UP, FILE, PKG = "vercel/ai", "content/tools-registry/registry.ts", "ai-sdk-tool-cyberwarex"
BRANCH = "feat/add-tool-cyberwarex"
TITLE = "feat(tools-registry): add cyberwarex"
HERE = os.path.dirname(os.path.abspath(__file__))
BODY = """Adds CyberWareX to the tools registry.

- **Package:** [ai-sdk-tool-cyberwarex](https://www.npmjs.com/package/ai-sdk-tool-cyberwarex): two AI SDK `tool()`s, `tokenSafetyCheck` (ERC-20 check before buying: ALLOW, LIMIT, RECHECK or BLOCK with reason codes) and `webSearch` (live web or news results).
- **Docs:** https://cyberwarex.com/docs/ai-sdk
- **Payment:** no API key. Each call is paid from the agent wallet in USDC on Base via x402 (`@x402/fetch`), $0.005 per check and $0.00435 per search. `maxPerCall` and `maxPerDay` are enforced before anything is signed; the model cannot change them. A failed or unpaid check returns `NO_ANSWER`, never a pass.
- **Tested:** the code example type-checks against the published types (strict, nodenext), and the same tools ran in a real `generateText` loop on 2026-11-09 with two paid calls settled on Base (tx 0x296d5e2e...cb85, 0x60318e7d...1cfe). Offline tests: 8 of 8.
"""

def token():
    s = open(os.path.expanduser("~/.secrets/github-classic-pr.env")).read()
    m = re.search(r"GITHUB_CLASSIC_TOKEN=(\S+)", s)
    if not m: sys.exit("no GITHUB_CLASSIC_TOKEN in ~/.secrets/github-classic-pr.env")
    return m.group(1)

def gh(method, path, tok=None, data=None):
    req = urllib.request.Request("https://api.github.com" + path, method=method,
                                 data=json.dumps(data).encode() if data is not None else None,
                                 headers={"Accept": "application/vnd.github+json", "User-Agent": "cyberwarex-pr",
                                          **({"Authorization": "Bearer " + tok} if tok else {})})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")

def status(url):
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "curl/8"}), timeout=20) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code

def main():
    dry = "--dry-run" in sys.argv
    npm, docs = status(f"https://registry.npmjs.org/{PKG}"), status("https://cyberwarex.com/docs/ai-sdk")
    print("npm", npm, "docs", docs)
    if docs != 200: sys.exit("docs page is not up")
    if npm != 200 and not dry: sys.exit("package is not on npm yet: publish first")
    code, up = gh("GET", f"/repos/{UP}/contents/{FILE}?ref=main")
    if code != 200: sys.exit(f"cannot read upstream file: {code}")
    old = base64.b64decode(up["content"]).decode()
    tmp_in, tmp_out = "/tmp/registry.up.ts", "/tmp/registry.ours.ts"
    open(tmp_in, "w").write(old)
    r = subprocess.run([sys.executable, os.path.join(HERE, "make_registry.py"), tmp_in, tmp_out], capture_output=True, text=True)
    if r.returncode: sys.exit("make_registry: " + (r.stderr or r.stdout).strip())
    new = open(tmp_out).read()
    print("registry.ts", len(old), "->", len(new), "bytes; open PRs by us:", end=" ")
    code, prs = gh("GET", f"/repos/{UP}/pulls?state=open&head=cyberwareX:{BRANCH}")
    print(len(prs) if code == 200 else code)
    if code == 200 and prs: sys.exit("PR already open: " + prs[0]["html_url"])
    if dry: return
    tok = token()
    code, _ = gh("POST", f"/repos/{UP}/forks", tok, {"default_branch_only": True})
    if code not in (200, 202): sys.exit(f"fork failed: {code}")
    for _ in range(30):                                   # forks appear asynchronously
        code, fk = gh("GET", "/repos/cyberwareX/ai", tok)
        if code == 200: break
        time.sleep(4)
    else:
        sys.exit("fork did not appear")
    code, ref = gh("GET", f"/repos/{UP}/git/ref/heads/main")
    sha = ref["object"]["sha"]
    code, _ = gh("POST", "/repos/cyberwareX/ai/git/refs", tok, {"ref": "refs/heads/" + BRANCH, "sha": sha})
    if code not in (201, 422): sys.exit(f"branch failed: {code}")    # 422 = branch exists from an earlier run
    code, cur = gh("GET", f"/repos/cyberwareX/ai/contents/{FILE}?ref={BRANCH}", tok)
    code, _ = gh("PUT", f"/repos/cyberwareX/ai/contents/{FILE}", tok,
                 {"message": TITLE, "content": base64.b64encode(new.encode()).decode(), "sha": cur["sha"], "branch": BRANCH})
    if code not in (200, 201): sys.exit(f"commit failed: {code}")
    code, pr = gh("POST", f"/repos/{UP}/pulls", tok, {"title": TITLE, "head": "cyberwareX:" + BRANCH, "base": "main", "body": BODY})
    print(code, pr.get("html_url") or pr)

if __name__ == "__main__":
    main()
